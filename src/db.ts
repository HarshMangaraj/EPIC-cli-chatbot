import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import fs from "fs";
import path from "path";
import os from "os";

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) throw new Error("DATABASE_URL is not set. Add it to your .env file.");

// ── Parse and clean the DATABASE_URL ─────────────────────────
// Neon URLs often look like:
//   postgresql://user:pass@host/neondb?sslmode=require&channel_binding=require
//
// Problems we fix here:
//   1. sslmode=require triggers a pg deprecation warning — we strip it and
//      pass ssl as an explicit object instead.
//   2. channel_binding=require is not understood by pg's JS driver — strip it.
//   3. If the URL is missing the `?` before query params (common copy-paste
//      mistake), we detect and fix it so the db name isn't corrupted.
function buildPool(rawUrl: string): pg.Pool {
  // ── Fix missing `?` before query params ──────────────────
  // e.g. ".../neondb&sslmode=..." → ".../neondb?sslmode=..."
  const fixedUrl = rawUrl.replace(
    /(\/[^/?]+)&([a-z_]+=)/,
    "$1?$2"
  );

  // ── Use Node's URL parser to safely extract components ───
  let parsed: URL;
  try {
    parsed = new URL(fixedUrl);
  } catch {
    throw new Error(
      `DATABASE_URL is not a valid URL: "${rawUrl}"\n` +
      `Expected format: postgresql://user:pass@host/dbname?sslmode=require`
    );
  }

  // ── Detect if SSL is needed ───────────────────────────────
  const sslMode = parsed.searchParams.get("sslmode") ?? "";
  const needsSsl =
    ["require", "verify-ca", "verify-full", "prefer"].includes(sslMode) ||
    parsed.hostname.includes("neon.tech") ||
    parsed.hostname.includes("supabase.") ||
    parsed.hostname.includes("render.com") ||
    parsed.hostname.includes("railway.app");

  // ── Strip params pg's JS driver can't handle ─────────────
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("channel_binding"); // not supported by pg driver
  parsed.searchParams.delete("uselibpqcompat");  // libpq-only

  return new pg.Pool({
    connectionString: parsed.toString(),
    ssl: needsSsl ? { rejectUnauthorized: true } : false,
  });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const pool    = buildPool(rawUrl);
const adapter = new PrismaPg(pool);

// ── Slow query log → ~/.epiccode/query.log (never terminal) ──
const LOG_DIR  = path.join(os.homedir(), ".epiccode");
const LOG_PATH = path.join(LOG_DIR, "query.log");

function writeQueryLog(line: string) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, line + "\n", "utf-8");
  } catch { /* never crash over a log write */ }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: [{ emit: "event", level: "query" }],
  });

if (!(prisma as any).__slowQueryListenerAttached) {
  (prisma as any).$on("query", (e: any) => {
    if (e.duration > 500) {
      const ts  = new Date().toISOString();
      const sql = e.query.replace(/\s+/g, " ").trim();
      writeQueryLog(`[${ts}] SLOW ${e.duration.toFixed(0)}ms  ${sql}`);
    }
  });
  (prisma as any).__slowQueryListenerAttached = true;
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
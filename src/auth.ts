import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import os from "os";
import { prisma } from "./db.js";

// ── JWT secret ───────────────────────────────────────────────
// Falls back to a hardcoded dev secret so the app still runs,
// but prints a loud warning. In production always set JWT_SECRET.
const JWT_SECRET: string = (() => {
  const s = process.env.JWT_SECRET;
  if (!s || s === "change-me") {
    process.stderr.write(
      "\n⚠️  JWT_SECRET is not set in your .env file.\n" +
      "   Sessions will not persist across restarts.\n" +
      "   Generate one: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n\n"
    );
    // Use a per-process random secret — sessions expire when the process does
    return require("crypto").randomBytes(32).toString("hex");
  }
  return s;
})();

const TOKEN_DIR  = path.join(os.homedir(), ".epiccode");
const TOKEN_PATH = path.join(TOKEN_DIR, "token");

export interface Session {
  userId: number;
  email:  string;
}

// ── Register ─────────────────────────────────────────────────
export async function register(
  email: string,
  password: string
): Promise<Session> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("Email already registered. Use login.");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash },
  });

  return saveToken(user.id, user.email);
}

// ── Login (timing-safe to prevent email enumeration) ─────────
export async function login(
  email: string,
  password: string
): Promise<Session> {
  const DUMMY_HASH =
    "$2b$12$invalidhashpaddinginvalidhashpaddinginvalidhash000000000";

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid) throw new Error("Invalid email or password.");

  return saveToken(user.id, user.email);
}

// ── Logout ───────────────────────────────────────────────────
export function logout() {
  try {
    if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
  } catch { /* ignore */ }
}

// ── Load existing session from disk ──────────────────────────
export function loadSession(): Session | null {
  try {
    const token = fs.readFileSync(TOKEN_PATH, "utf-8").trim();
    const decoded = jwt.verify(token, JWT_SECRET) as Session & { exp: number };

    // Renew if expiring within 7 days
    if (decoded.exp - Date.now() / 1000 < 60 * 60 * 24 * 7) {
      saveToken(decoded.userId, decoded.email);
    }

    return { userId: decoded.userId, email: decoded.email };
  } catch {
    // Token missing, expired, or signed with a different secret
    return null;
  }
}

// ── Load per-user config from DB ─────────────────────────────
export async function loadUserConfig(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { model: true, theme: true },
  });
  return user ?? { model: "llama-3.3-70b-versatile", theme: "cyan" };
}

// ── Save per-user config to DB ────────────────────────────────
export async function saveUserConfig(
  userId: number,
  config: { model?: string; theme?: string }
) {
  await prisma.user.update({ where: { id: userId }, data: config });
}

// ── Internal: write JWT to disk with owner-only permissions ──
function saveToken(userId: number, email: string): Session {
  const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: "30d" });
  try {
    fs.mkdirSync(TOKEN_DIR, { recursive: true });
    fs.writeFileSync(TOKEN_PATH, token, { encoding: "utf-8", mode: 0o600 });
  } catch {
    // On Windows, mode is ignored but the write still works
  }
  return { userId, email };
} 
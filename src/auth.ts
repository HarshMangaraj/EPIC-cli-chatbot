import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import os from "os";
import { prisma } from "./db";

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me";
const TOKEN_DIR  = path.join(os.homedir(), ".epiccode");
const TOKEN_PATH = path.join(TOKEN_DIR, "token");

export interface Session {
  userId: number;
  email:  string;
}

// ── Register ────────────────────────────────────────────────
export async function register(email: string, password: string): Promise<Session> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("Email already registered. Use login.");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash },
  });

  return saveToken(user.id, user.email);
}

// ── Login ────────────────────────────────────────────────────
export async function login(email: string, password: string): Promise<Session> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("No account found for that email.");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Wrong password.");

  return saveToken(user.id, user.email);
}

// ── Logout ───────────────────────────────────────────────────
export function logout() {
  if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
}

// ── Load existing session from disk ─────────────────────────
export function loadSession(): Session | null {
  try {
    const token = fs.readFileSync(TOKEN_PATH, "utf-8").trim();
    const decoded = jwt.verify(token, JWT_SECRET) as Session & { exp: number };

    // If token expires in < 1 day, quietly renew it
    if (decoded.exp - Date.now() / 1000 < 86400) {
      saveToken(decoded.userId, decoded.email);
    }

    return { userId: decoded.userId, email: decoded.email };
  } catch {
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

// ── Save per-user config to DB ───────────────────────────────
export async function saveUserConfig(
  userId: number,
  config: { model?: string; theme?: string }
) {
  await prisma.user.update({ where: { id: userId }, data: config });
}

// ── Internal ─────────────────────────────────────────────────
function saveToken(userId: number, email: string): Session {
  const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: "30d" });
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, token, "utf-8");
  return { userId, email };
}
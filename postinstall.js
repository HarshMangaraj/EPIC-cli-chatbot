#!/usr/bin/env node
// Runs automatically after `npm i -g epiccli`
// Generates the Prisma client so the DB layer works out of the box.

import { execSync } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "..", "prisma", "schema.prisma");

if (!existsSync(schemaPath)) {
  // During local dev the schema is one level up; skip silently
  process.exit(0);
}

try {
  console.log("⚡ epiccli — generating Prisma client...");
  execSync(`npx prisma generate --schema="${schemaPath}"`, { stdio: "inherit" });
  console.log("✓ Done. Run `epiccli` to start.\n");
} catch {
  console.warn(
    "⚠  Prisma generate failed.\n" +
    "   Run this manually before using epiccli:\n" +
    `   npx prisma generate --schema="${schemaPath}"\n`
  );
}
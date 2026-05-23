#!/usr/bin/env node

import Groq from "groq-sdk";
import dotenv from "dotenv";
import readline from "readline";
import chalk from "chalk";
import ora from "ora";
import gradient from "gradient-string";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

/* ================================================== */
/* ENV LOADING                                        */
/* Load from ~/.epiccode/.env first (installed users) */
/* then fall back to local .env (dev mode)            */
/* ================================================== */

const EPICCODE_DIR  = path.join(os.homedir(), ".epiccode");
const EPICCODE_ENV  = path.join(EPICCODE_DIR, ".env");

// Load user-level env first, then local .env (local wins in dev)
if (fs.existsSync(EPICCODE_ENV)) dotenv.config({ path: EPICCODE_ENV });
dotenv.config(); // local .env — overwrites if keys already set

/* ================================================== */
/* CONFIG FILE  (~/.epiccode.json)                    */
/* ================================================== */

interface Config {
  model: string;
  theme: string;
}

const DEFAULT_CONFIG: Config = {
  model: "llama-3.3-70b-versatile",
  theme: "cyan",
};

const CONFIG_PATH = path.join(os.homedir(), ".epiccode.json");

function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
    return DEFAULT_CONFIG;
  }
  const text = fs.readFileSync(CONFIG_PATH, "utf-8");
  return { ...DEFAULT_CONFIG, ...JSON.parse(text) };
}

let config = loadConfig();

// Deferred imports — set Prisma env before loading
let loadSession: any, register: any, login: any, logout: any, loadUserConfig: any, saveUserConfig: any;
let createConversation: any, setConversationTitle: any, saveMessage: any, loadRecentMessages: any, listConversations: any, deleteConversation: any, deleteAccount: any;
let prisma: any;

/* ================================================== */
/* GROQ CLIENT                                        */
/* ================================================== */

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/* ================================================== */
/* READLINE                                           */
/* ================================================== */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/* ================================================== */
/* AI MEMORY                                          */
/* ================================================== */

const MAX_MESSAGES = 20;

const messages: any[] = [
  {
    role: "system",
    content: `
You are Epic CODE, an elite AI coding assistant.

Rules:
- Use markdown formatting
- Add proper spacing
- Keep answers readable
- Use headings and bullet points
- Use code blocks correctly
- Explain simply for beginners
- Keep paragraphs short
`,
  },
];

/* ================================================== */
/* BANNER                                             */
/* ================================================== */

function banner(session: { email: string }) {
  console.clear();

  const title = gradient.rainbow.multiline(`
███████╗██████╗ ██╗ ██████╗     ██████╗ ██████╗ ██████╗ ███████╗
██╔════╝██╔══██╗██║██╔════╝    ██╔════╝██╔═══██╗██╔══██╗██╔════╝
█████╗  ██████╔╝██║██║         ██║     ██║   ██║██║  ██║█████╗
██╔══╝  ██╔═══╝ ██║██║         ██║     ██║   ██║██║  ██║██╔══╝
███████╗██║     ██║╚██████╗    ╚██████╗╚██████╔╝██████╔╝███████╗
╚══════╝╚═╝     ╚═╝ ╚═════╝     ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
`);

  console.log(title);
  console.log(chalk.gray("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(chalk.cyanBright.bold("               ⚡ EPIC CODE AI ASSISTANT ⚡"));
  console.log(chalk.gray(`\n         Model : ${chalk.whiteBright(config.model)}`));
  console.log(chalk.gray(`         User  : ${chalk.whiteBright(session.email)}`));
  console.log(chalk.gray(`         Config: ${CONFIG_PATH}`));
  console.log(chalk.gray('\n         Type /help for commands  |  "exit" to quit\n'));
  console.log(chalk.gray("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));
}

/* ================================================== */
/* UI HELPERS                                         */
/* ================================================== */

function currentTime(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function printHeader() {
  console.log(
    "\n" +
    chalk.cyan("  ┌─ ") +
    chalk.cyanBright.bold("EPIC CODE") +
    chalk.gray("  " + currentTime())
  );
  console.log(chalk.cyan("  │"));
  process.stdout.write(chalk.cyan("  │  "));
}

function printFooter() {
  console.log(
    "\n" + chalk.cyan("  │") +
    "\n" + chalk.cyan("  └" + "─".repeat(58)) + "\n"
  );
}

function boxLine(label: string, value: string) {
  return chalk.cyan("  │  ") + chalk.gray(`${label}: `) + chalk.whiteBright(value) + "\n";
}

function boxOpen(title: string) {
  return (
    "\n" +
    chalk.cyan("  ┌─ ") + chalk.yellowBright.bold(title) + "\n" +
    chalk.cyan("  │\n")
  );
}

function boxClose() {
  return chalk.cyan("  └" + "─".repeat(58)) + "\n";
}

// Prompt helper — set mask=true to hide password input.
// In masked mode we show nothing (blank) — the safest cross-platform
// approach. Showing one * per keypress breaks on Windows raw mode and
// when characters are pasted because stdin fires one event per byte,
// not per logical character, making the * count wrong.
function askQuestion(prompt: string, mask = false): Promise<string> {
  return new Promise((resolve) => {
    if (!mask) return rl.question(prompt, resolve);

    const stdin = process.stdin;
    process.stdout.write(prompt);

    // Pause readline so it doesn't intercept our raw keystrokes
    rl.pause();
    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");

    let input = "";

    function onData(char: string) {
      if (char === "\r" || char === "\n" || char === "\u0004") {
        // Enter pressed — submit
        stdin.setRawMode(false);
        stdin.removeListener("data", onData);
        rl.resume();
        process.stdout.write("\n");
        resolve(input);
        return;
      }

      if (char === "\u0003") {
        // Ctrl+C
        process.stdout.write("\n");
        process.exit(0);
      }

      if (char === "\u007f" || char === "\b") {
        // Backspace — erase one character silently
        if (input.length > 0) {
          input = input.slice(0, -1);
        }
        return;
      }

      // Ignore other control characters (arrows, function keys, etc.)
      if (char < " ") return;

      input += char;
      // Show nothing — blank password field, standard terminal behaviour
    }

    stdin.on("data", onData);
  });
}

/* ================================================== */
/* SLASH COMMAND HANDLERS                             */
/* ================================================== */

function handleHelp() {
  const cmd = (c: string, desc: string) =>
    chalk.cyan("  │  ") + chalk.greenBright(c.padEnd(20)) + chalk.gray(desc) + "\n";

  process.stdout.write(
    boxOpen("COMMANDS") +
    cmd("/help",               "show this menu") +
    cmd("/clear",              "reset the conversation") +
    cmd("/save",               "export chat to a markdown file") +
    cmd("/count",              "messages in memory") +
    cmd("/config",             "show current settings") +
    cmd("/config set <k> <v>", "update model or theme") +
    cmd("/conversations",      "list past conversations") +
    cmd("/history <id>",       "load a past conversation") +
    cmd("/logout",             "clear session and exit") +
    cmd("/deleteaccount",      "permanently delete account") +
    cmd("create <app>",        "generate a project on disk") +
    cmd("exit",                "quit") +
    chalk.cyan("  │\n") +
    boxClose()
  );
}

function handleClear() {
  messages.splice(1);
  process.stdout.write(
    boxOpen("CLEARED") +
    chalk.cyan("  │  ") + chalk.gray("Conversation reset. AI memory wiped.\n") +
    chalk.cyan("  │\n") +
    boxClose()
  );
}

function handleSave() {
  const conversation = messages.slice(1);
  if (conversation.length === 0) {
    console.log("\n" + chalk.gray("  Nothing to save yet.\n"));
    return;
  }

  const lines = conversation.map((msg) => {
    const who = msg.role === "user" ? "You" : "Epic CODE";
    return `[${who}]\n${msg.content}\n`;
  });

  const fileContent = "# Epic CODE Chat Export\n\n" + lines.join("\n---\n\n");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `epiccode-chat-${timestamp}.md`;

  fs.writeFileSync(filename, fileContent, "utf-8");

  process.stdout.write(
    boxOpen("SAVED") +
    chalk.cyan("  │  ") + chalk.greenBright("✓ ") + chalk.gray(`Saved to: ${filename}\n`) +
    chalk.cyan("  │\n") +
    boxClose()
  );
}

function handleCount() {
  const turns = messages.length - 1;
  const bar = "█".repeat(Math.min(turns, MAX_MESSAGES)) + "░".repeat(Math.max(0, MAX_MESSAGES - turns));
  process.stdout.write(
    boxOpen("MEMORY") +
    chalk.cyan("  │  ") + chalk.gray(`Messages: `) + chalk.whiteBright(`${turns} / ${MAX_MESSAGES}`) + "\n" +
    chalk.cyan("  │  ") + chalk.cyan(bar) + "\n" +
    chalk.cyan("  │\n") +
    boxClose()
  );
}

function handleShowConfig() {
  process.stdout.write(
    boxOpen("CONFIG") +
    boxLine("File ", CONFIG_PATH) +
    boxLine("Model", config.model) +
    boxLine("Theme", config.theme) +
    chalk.cyan("  │\n") +
    chalk.cyan("  │  ") + chalk.gray("Use: /config set model <name>  or  /config set theme <color>\n") +
    chalk.cyan("  │\n") +
    boxClose()
  );
}

async function handleSetConfig(
  key: string,
  value: string,
  session: { userId: number }
) {
  if (!["model", "theme"].includes(key)) {
    console.log(chalk.redBright(`  Unknown config key "${key}". Valid keys: model, theme`));
    return;
  }
  (config as any)[key] = value;
  await saveUserConfig(session.userId, { [key]: value });

  process.stdout.write(
    boxOpen("CONFIG UPDATED") +
    boxLine(key, value) +
    chalk.cyan("  │\n") +
    boxClose()
  );
}

/* ================================================== */
/* PROJECT GENERATOR  (create <app>)                  */
/* ================================================== */

async function handleCreate(userInput: string) {
  const projectDescription = userInput.replace(/^create\s+/i, "").trim();

  const folderName = projectDescription
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  const projectPath = path.join(process.cwd(), folderName);

  process.stdout.write(
    boxOpen("CREATING PROJECT") +
    chalk.cyan("  │  ") + chalk.gray(`Building : `) + chalk.whiteBright(projectDescription) + "\n" +
    chalk.cyan("  │  ") + chalk.gray(`Location : `) + chalk.whiteBright(projectPath) + "\n" +
    chalk.cyan("  │\n")
  );

  const spinner = ora({
    text: chalk.blueBright("  Asking AI to generate files..."),
    spinner: "dots",
  }).start();

  try {
    const creationPrompt = `
You are a code generator. The user wants you to create: ${projectDescription}

Generate all the files needed for a complete, working project.

IMPORTANT — You MUST use this exact format for every file:

FILE: filename.ext
\`\`\`
(file contents here)
\`\`\`

Rules:
- Use FILE: before every single file
- Include all files needed to run the project
- Keep each file clean and well-commented
- Include a README.md explaining how to run it
- Do not add any explanation outside of the FILE blocks
`;

    const completion = await groq.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: "You are a code generator. Only output files in the requested format. No extra text." },
        { role: "user",   content: creationPrompt },
      ],
      stream: false,
    });

    spinner.stop();

    const aiResponse = completion.choices[0]?.message?.content || "";
    const fileBlocks = aiResponse.split(/^FILE:/m).slice(1);

    if (fileBlocks.length === 0) {
      console.log(chalk.redBright("  │  ✗ AI did not return files in the expected format."));
      console.log(chalk.gray("  │  Raw response preview:\n"), aiResponse.slice(0, 300));
      console.log(boxClose());
      return;
    }

    fs.mkdirSync(projectPath, { recursive: true });

    const createdFiles: string[] = [];

    for (const block of fileBlocks) {
      const lines  = block.trim().split("\n");
      const filename = lines[0]?.trim();
      const content  = lines
        .slice(1)
        .join("\n")
        .replace(/^```[\w]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim();

      if (!filename || !content) continue;

      const filePath = path.join(projectPath, filename);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, "utf-8");
      createdFiles.push(filename);

      console.log(
        chalk.cyan("  │  ") +
        chalk.greenBright("✓ ") +
        chalk.whiteBright(filename.padEnd(30)) +
        chalk.gray(`${content.split("\n").length} lines`)
      );
    }

    process.stdout.write(
      chalk.cyan("  │\n") +
      chalk.cyan("  │  ") + chalk.greenBright(`${createdFiles.length} files created\n`) +
      chalk.cyan("  │\n") +
      chalk.cyan("  │  ") + chalk.gray("Get started:\n") +
      chalk.cyan("  │\n") +
      chalk.cyan("  │    ") + chalk.whiteBright(`cd ${projectPath}\n`) +
      chalk.cyan("  │    ") + chalk.whiteBright(`cat README.md\n`) +
      boxClose()
    );

  } catch (error: any) {
    spinner.stop();
    console.log(chalk.redBright("  │  ✗ Error generating files: " + error?.message));
    console.log(boxClose());
  }
}

/* ================================================== */
/* MAIN CHAT LOOP  (iterative — no recursion)         */
/* Recursive readline callbacks blow the stack after  */
/* ~10 000 messages. A while-loop avoids that entirely*/
/* ================================================== */

async function startChat(session: { userId: number; email: string }) {
  let currentConvId: number = await createConversation(session.userId, config.model);
  let isFirstMessage = true;

  while (true) {
    const input = await askQuestion(chalk.greenBright.bold("\n❯ You: "));
    const trimmed = input.trim();

    if (!trimmed) continue;

    /* ── Exit ───────────────────────────────────────── */
    if (trimmed.toLowerCase() === "exit") {
      console.log(chalk.yellowBright("\n  👋  Goodbye!\n"));
      break;
    }

    const parts = trimmed.split(/\s+/);

    /* ── Slash commands ─────────────────────────────── */
    if (trimmed === "/help")    { handleHelp();        continue; }
    if (trimmed === "/clear")   { handleClear();       continue; }
    if (trimmed === "/save")    { handleSave();        continue; }
    if (trimmed === "/count")   { handleCount();       continue; }
    if (trimmed === "/config")  { handleShowConfig();  continue; }

    // /config set <key> <value>
    if (parts[0] === "/config" && parts[1] === "set") {
      await handleSetConfig(parts[2] ?? "", parts.slice(3).join(" "), session);
      continue;
    }

    // /logout
    if (trimmed === "/logout") {
      logout();
      console.log(chalk.yellowBright("\n  Session cleared. Restart to log in again.\n"));
      break;
    }

    // /conversations
    if (trimmed === "/conversations") {
      const convs = await listConversations(session.userId);
      if (convs.length === 0) {
        console.log(chalk.gray("\n  No past conversations.\n"));
      } else {
        process.stdout.write(boxOpen("CONVERSATIONS"));
        convs.forEach((c: any) => {
          console.log(
            chalk.cyan("  │  ") +
            chalk.yellowBright(`[${c.id}]`) + " " +
            chalk.whiteBright((c.title ?? "Untitled").padEnd(35)) +
            chalk.gray(`${c._count.messages} msgs · ${c.model ?? "?"}`)
          );
        });
        process.stdout.write(chalk.cyan("  │\n") + boxClose());
      }
      continue;
    }

    // /history <id>
    if (parts[0] === "/history") {
      const id = parseInt(parts[1] ?? "", 10);
      if (isNaN(id)) {
        console.log(chalk.redBright("\n  Usage: /history <id>\n"));
        continue;
      }
      currentConvId = id;
      isFirstMessage = false;
      const msgs = await loadRecentMessages(id, MAX_MESSAGES);
      messages.splice(1);
      messages.push(...msgs);
      console.log(
        chalk.greenBright(`\n  ✓ Loaded conversation ${id}`) +
        chalk.gray(` (${msgs.length} messages)\n`)
      );
      continue;
    }

    // /deleteaccount
    if (trimmed === "/deleteaccount") {
      const confirm = await askQuestion(
        chalk.redBright("  Type DELETE to confirm account deletion: ")
      );
      if (confirm === "DELETE") {
        await deleteAccount(session.userId);
        logout();
        console.log(chalk.redBright("\n  Account permanently deleted.\n"));
        break;
      }
      console.log(chalk.gray("\n  Cancelled.\n"));
      continue;
    }

    // Unknown slash command
    if (trimmed.startsWith("/")) {
      console.log(
        "\n" + chalk.redBright(`  Unknown command: ${trimmed}`) +
        chalk.gray("  — type /help\n")
      );
      continue;
    }

    /* ── Project generator ──────────────────────────── */
    if (trimmed.toLowerCase().startsWith("create ")) {
      await handleCreate(trimmed);
      continue;
    }

    /* ── Normal AI chat ─────────────────────────────── */
    messages.push({ role: "user", content: trimmed });
    await saveMessage(currentConvId, "user", trimmed);

    // Proactively trim context window BEFORE calling the API
    if (messages.length > MAX_MESSAGES + 1) {
      const history = await loadRecentMessages(currentConvId, MAX_MESSAGES);
      messages.splice(1);
      messages.push(...history);
    }

    const spinner = ora({
      text: chalk.blueBright(" Epic CODE is thinking..."),
      spinner: "dots",
    }).start();

    try {
      const stream = await groq.chat.completions.create({
        model: config.model,
        messages,
        stream: true,
      });

      spinner.stop();
      printHeader();

      let reply = "";
      let lineBuffer = "";

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content || "";
        reply += token;
        lineBuffer += token;
        process.stdout.write(chalk.whiteBright(token));

        // Re-emit the indent prefix after each newline
        if (token.includes("\n")) {
          process.stdout.write(chalk.cyan("  │  "));
          lineBuffer = "";
        }
      }

      printFooter();

      // Save once after the full reply — not per token
      await saveMessage(currentConvId, "assistant", reply);
      messages.push({ role: "assistant", content: reply });

      // Auto-title from first user message
      if (isFirstMessage) {
        await setConversationTitle(currentConvId, session.userId, trimmed);
        isFirstMessage = false;
      }

    } catch (error: any) {
      spinner.stop();
      const msg =
        error?.status === 401 ? "❌  Invalid API key — check your .env file" :
        error?.status === 429 ? "❌  Rate limited — wait a moment and try again" :
        error?.code  === "ENOTFOUND" ? "❌  No internet connection" :
        `❌  Unexpected error: ${error?.message ?? String(error)}`;
      console.log("\n" + chalk.redBright("  " + msg) + "\n");
    }
  }
}

/* ================================================== */
/* AUTH FLOW  (with retry on wrong password)          */
/* ================================================== */

async function authFlow(): Promise<{ userId: number; email: string }> {
  // If a valid token exists on disk, skip the prompt entirely
  let session = loadSession();
  if (session) {
    console.log(chalk.gray("  Session restored for ") + chalk.cyanBright(session.email) + "\n");
    return session;
  }

  // No session — show login/register prompt
  console.log(
    chalk.gray("  ┌─────────────────────────────────────────┐\n") +
    chalk.gray("  │  ") + chalk.cyanBright.bold("Welcome to Epic CODE") + chalk.gray("                 │\n") +
    chalk.gray("  │  Create an account or log in to start.  │\n") +
    chalk.gray("  └─────────────────────────────────────────┘\n")
  );

  const choice = await askQuestion(
    chalk.cyanBright("  [l]") + chalk.gray("ogin  or  ") +
    chalk.cyanBright("[r]") + chalk.gray("egister? ")
  );
  const email = await askQuestion(chalk.gray("  Email: "));

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const password = await askQuestion(
      chalk.gray(`  Password (attempt ${attempt}/${MAX_ATTEMPTS}): `),
      true
    );
    try {
      session = choice.toLowerCase().startsWith("r")
        ? await register(email, password)
        : await login(email, password);
      console.log(chalk.greenBright(`\n  ✓ Welcome, ${session!.email}\n`));
      return session!;
    } catch (e: any) {
      if (attempt < MAX_ATTEMPTS) {
        console.log(chalk.redBright(`\n  ✗ ${e.message}  — try again\n`));
      } else {
        console.log(chalk.redBright(`\n  ✗ ${e.message}  — too many attempts\n`));
        process.exit(1);
      }
    }
  }

  process.exit(1); // unreachable, but TypeScript wants a return
}

/* ================================================== */
/* FIRST-RUN SETUP WIZARD                             */
/* Runs when ~/.epiccode/.env doesn't exist yet.      */
/* Saves keys there so they persist across updates.   */
/* ================================================== */

async function firstRunSetup() {
  console.clear();
  console.log(
    gradient.rainbow.multiline("  ⚡ EPIC CODE") + "\n\n" +
    chalk.cyanBright.bold("  Welcome! Let\'s get you set up.\n") +
    chalk.gray("  This only happens once. Takes about 60 seconds.\n")
  );

  console.log(
    chalk.gray("  You need two free accounts:\n") +
    chalk.white("  1. Groq API key  →  ") + chalk.cyanBright("https://console.groq.com\n") +
    chalk.white("  2. Neon database →  ") + chalk.cyanBright("https://neon.tech\n")
  );

  await askQuestion(chalk.gray("  Press Enter when you have both ready..."));
  console.log();

  const groqKey = await askQuestion(chalk.gray("  Paste your GROQ_API_KEY: "));
  if (!groqKey.startsWith("gsk_")) {
    console.log(chalk.yellowBright("  ⚠  That doesn\'t look like a Groq key (should start with gsk_)"));
    console.log(chalk.gray("  Continuing anyway — you can fix it later in ~/.epiccode/.env\n"));
  }

  const dbUrl = await askQuestion(chalk.gray("  Paste your DATABASE_URL (PostgreSQL): "));
  if (!dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
    console.log(chalk.yellowBright("  ⚠  That doesn\'t look like a PostgreSQL URL"));
    console.log(chalk.gray("  Continuing anyway — you can fix it later in ~/.epiccode/.env\n"));
  }

  const jwtSecret = crypto.randomBytes(32).toString("hex");

  const envContent = [
    `GROQ_API_KEY=${groqKey.trim()}`,
    `DATABASE_URL=${dbUrl.trim()}`,
    `JWT_SECRET=${jwtSecret}`,
    "",
  ].join("\n");

  fs.mkdirSync(EPICCODE_DIR, { recursive: true });
  fs.writeFileSync(EPICCODE_ENV, envContent, { encoding: "utf-8", mode: 0o600 });

  // Reload env into process now
  dotenv.config({ path: EPICCODE_ENV });

  console.log(
    "\n" +
    chalk.greenBright("  ✓ Config saved to ~/.epiccode/.env\n") +
    chalk.gray("  Edit that file anytime to change your keys.\n")
  );

  // Run prisma migrate so the DB is ready
  const spinner = ora({ text: chalk.blueBright("  Setting up your database..."), spinner: "dots" }).start();
  try {
    const { execSync } = await import("child_process");
    const schemaPath = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "prisma", "schema.prisma");
    execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, { stdio: "pipe" });
    spinner.succeed(chalk.greenBright("  Database ready!"));
  } catch {
    spinner.warn(chalk.yellowBright("  DB migration skipped — run `npx prisma migrate deploy` manually if needed."));
  }

  console.log();
}

/* ================================================== */
/* ENTRY POINT                                        */
/* ================================================== */

process.env.PRISMA_CLIENT_ENGINE_TYPE =
  process.env.PRISMA_CLIENT_ENGINE_TYPE ?? "binary";

// ── First-run: show setup wizard if no env file exists ───────
const isFirstRun = !fs.existsSync(EPICCODE_ENV) && !process.env.GROQ_API_KEY;
if (isFirstRun) await firstRunSetup();

try {
  ({ loadSession, register, login, logout, loadUserConfig, saveUserConfig } =
    await import("./auth.js"));
  ({ createConversation, setConversationTitle, saveMessage, loadRecentMessages,
     listConversations, deleteConversation, deleteAccount } =
    await import("./conversations.js"));
  ({ prisma } = await import("./db.js"));
} catch (err: any) {
  console.error(chalk.redBright("\n  ✗ Failed to load modules:\n"));
  console.error(chalk.gray("  " + (err?.message ?? String(err))));
  console.error(chalk.gray("\n  Check your ~/.epiccode/.env and that your DATABASE_URL is reachable.\n"));
  process.exit(1);
}


function shutdown() {
  try { rl.close(); }    catch { /* already closed */ }
  try { prisma.$disconnect(); } catch { /* already gone */ }
}
process.on("exit", shutdown);
process.on("SIGINT",  () => { console.log(chalk.yellowBright("\n\n  👋  Goodbye!\n")); shutdown(); process.exit(0); });
process.on("SIGTERM", () => { shutdown(); process.exit(0); });


console.clear();
console.log(gradient.rainbow("  ⚡ EPIC CODE") + chalk.gray("  —  initialising...\n"));

const session = await authFlow();

const userConfig = await loadUserConfig(session.userId);
config = { ...config, ...userConfig } as Config;


banner(session);
await startChat(session);
shutdown();
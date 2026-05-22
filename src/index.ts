#!/usr/bin/env bun

import Groq from "groq-sdk";
import dotenv from "dotenv";
import readline from "readline";
import chalk from "chalk";
import ora from "ora";
import gradient from "gradient-string";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

dotenv.config();

/* ================================================== */
/* PHASE 3 — CONFIG FILE                              */
/* Lives at ~/.epiccode.json on your computer         */
/* Created automatically on first run                 */
/* ================================================== */

// The shape of the config object
interface Config {
  model: string;
  theme: string;
}

// Default values if no config file exists yet
const DEFAULT_CONFIG: Config = {
  model: "llama-3.3-70b-versatile",
  theme: "cyan",
};

// Full path to the config file — os.homedir() gives your home folder
// e.g. /Users/yourname/.epiccode.json  or  C:\Users\yourname\.epiccode.json
const CONFIG_PATH = path.join(os.homedir(), ".epiccode.json");

function loadConfig(): Config {
  // Check if the file exists
  if (!fs.existsSync(CONFIG_PATH)) {
    // First run — create the file with defaults
    fs.writeFileSync(
      CONFIG_PATH,
      JSON.stringify(DEFAULT_CONFIG, null, 2), // null, 2 = pretty print
      "utf-8"
    );
    return DEFAULT_CONFIG;
  }

  // File exists — read it and parse the JSON text back into an object
  const text = fs.readFileSync(CONFIG_PATH, "utf-8");
  return { ...DEFAULT_CONFIG, ...JSON.parse(text) };
}

// Load config once at startup (may be overridden by per-user DB config)
let config = loadConfig();

// Defer importing auth/conversations/db so we can set Prisma env first
let loadSession: any, register: any, login: any, logout: any, loadUserConfig: any, saveUserConfig: any;
let createConversation: any, setConversationTitle: any, saveMessage: any, loadRecentMessages: any, listConversations: any, deleteConversation: any, deleteAccount: any;
let prisma: any;

/* ================================================== */
/* GROQ CLIENT                                        */
/* ================================================== */

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

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

function banner() {
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
  console.log(chalk.gray(`\n         Model: ${config.model}`));
  console.log(chalk.gray(`         Config: ${CONFIG_PATH}`));
  console.log(chalk.gray('\n         Type /help for commands  |  "exit" to quit\n'));
}

/* ================================================== */
/* HELPERS                                            */
/* ================================================== */

function currentTime(): string {
  return new Date().toLocaleTimeString();
}

function printHeader() {
  console.log(
    "\n" +
    chalk.cyan("  ┌─ ") +
    chalk.cyanBright.bold("EPIC CODE") +
    chalk.gray("  [" + currentTime() + "]")
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

// Simple promise-based question helper. Set `mask` to true to hide input (for passwords).
function askQuestion(prompt: string, mask = false): Promise<string> {
  return new Promise((resolve) => {
    if (!mask) return rl.question(prompt, (ans) => resolve(ans));

    const stdin = process.stdin;
    process.stdout.write(prompt);
    stdin.resume();
    stdin.setRawMode(true);

    let input = "";
    function onData(chunk: Buffer) {
      const char = chunk.toString("utf8");
      if (char === "\r" || char === "\n" || char === "\u0004") {
        stdin.removeListener("data", onData);
        stdin.setRawMode(false);
        process.stdout.write("\n");
        resolve(input);
        return;
      }
      if (char === "\u0003") process.exit();
      input += char;
      process.stdout.write("*");
    }

    stdin.on("data", onData);
  });
}

/* ================================================== */
/* SLASH COMMANDS                                     */
/* ================================================== */

function handleHelp() {
  console.log(
    "\n" +
    chalk.cyan("  ┌─ ") + chalk.yellowBright.bold("COMMANDS") + "\n" +
    chalk.cyan("  │\n") +
    chalk.cyan("  │  ") + chalk.greenBright("/help") +
    chalk.gray("           show this menu\n") +
    chalk.cyan("  │  ") + chalk.greenBright("/clear") +
    chalk.gray("          reset the conversation\n") +
    chalk.cyan("  │  ") + chalk.greenBright("/save") +
    chalk.gray("           save chat to a file\n") +
    chalk.cyan("  │  ") + chalk.greenBright("/count") +
    chalk.gray("          show messages in memory\n") +
    chalk.cyan("  │  ") + chalk.greenBright("/config") +
    chalk.gray("         show current config\n") +
    chalk.cyan("  │  ") + chalk.greenBright("create [app]") +
    chalk.gray("    generate a project on disk\n") +
    chalk.cyan("  │  ") + chalk.redBright("exit") +
    chalk.gray("             quit\n") +
    chalk.cyan("  └" + "─".repeat(58)) + "\n"
  );
}

function handleClear() {
  messages.splice(1);
  console.log(
    "\n" +
    chalk.cyan("  ┌─ ") + chalk.yellowBright.bold("CLEARED") + "\n" +
    chalk.cyan("  │\n") +
    chalk.cyan("  │  ") + chalk.gray("Conversation reset. AI memory wiped.\n") +
    chalk.cyan("  └" + "─".repeat(58)) + "\n"
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

  console.log(
    "\n" +
    chalk.cyan("  ┌─ ") + chalk.yellowBright.bold("SAVED") + "\n" +
    chalk.cyan("  │\n") +
    chalk.cyan("  │  ") + chalk.greenBright("✓ ") + chalk.gray(`Saved to: ${filename}\n`) +
    chalk.cyan("  └" + "─".repeat(58)) + "\n"
  );
}

function handleCount() {
  const turns = messages.length - 1;
  console.log(
    "\n" +
    chalk.cyan("  ┌─ ") + chalk.yellowBright.bold("MEMORY") + "\n" +
    chalk.cyan("  │\n") +
    chalk.cyan("  │  ") + chalk.gray(`Messages in memory: ${turns}\n`) +
    chalk.cyan("  └" + "─".repeat(58)) + "\n"
  );
}

function handleShowConfig() {
  console.log(
    "\n" +
    chalk.cyan("  ┌─ ") + chalk.yellowBright.bold("CONFIG") + "\n" +
    chalk.cyan("  │\n") +
    chalk.cyan("  │  ") + chalk.gray(`File:  ${CONFIG_PATH}\n`) +
    chalk.cyan("  │  ") + chalk.gray(`Model: ${config.model}\n`) +
    chalk.cyan("  │  ") + chalk.gray(`Theme: ${config.theme}\n`) +
    chalk.cyan("  │\n") +
    chalk.cyan("  │  ") + chalk.gray("Edit the file to change settings.\n") +
    chalk.cyan("  └" + "─".repeat(58)) + "\n"
  );
}

/* ================================================== */
/* PHASE 4 — FILE CREATION                            */
/*                                                    */
/* When user types "create a todo app":               */
/* 1. Detect the word "create" at the start           */
/* 2. Ask AI to return files in a parseable format    */
/* 3. Split the response to get each file             */
/* 4. Write every file to disk                        */
/* ================================================== */

async function handleCreate(userInput: string) {

  // Extract what they want to build
  // "create a todo app in React" → "a todo app in React"
  const projectDescription = userInput.replace(/^create\s+/i, "").trim();

  // Turn the description into a folder name
  // "a todo app in React" → "todo-app-in-react"
  const folderName = projectDescription
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")  // replace non-letters with hyphens
    .replace(/^-|-$/g, "")         // remove leading/trailing hyphens
    .slice(0, 40);                  // max 40 chars

  console.log(
    "\n" + chalk.cyan("  ┌─ ") + chalk.yellowBright.bold("CREATING PROJECT") + "\n" +
    chalk.cyan("  │\n") +
    chalk.cyan("  │  ") + chalk.gray(`Building: ${projectDescription}\n`) +
    chalk.cyan("  │  ") + chalk.gray(`Folder:   ./${folderName}/\n`) +
    chalk.cyan("  │")
  );

  const spinner = ora({
    text: chalk.blueBright("  Asking AI to generate files..."),
    spinner: "dots",
  }).start();

  try {

    /* ------------------------------------------------ */
    /* SPECIAL PROMPT FOR FILE GENERATION               */
    /*                                                  */
    /* We tell the AI exactly what format to use        */
    /* so we can reliably split its response into files */
    /* ------------------------------------------------ */
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
        { role: "user", content: creationPrompt },
      ],
      // No streaming here — we need the full response to parse it
      stream: false,
    });

    spinner.stop();

    const aiResponse = completion.choices[0]?.message?.content || "";

    /* ------------------------------------------------ */
    /* PARSE THE AI RESPONSE INTO FILES                 */
    /*                                                  */
    /* Split by "FILE:" to get each file block          */
    /* Then extract filename and content from each block*/
    /* ------------------------------------------------ */
    const fileBlocks = aiResponse
      .split(/^FILE:/m)           // split on lines starting with "FILE:"
      .slice(1);                  // first item is empty, skip it

    if (fileBlocks.length === 0) {
      console.log(chalk.redBright("  │  ✗ AI did not return files in the expected format.\n"));
      console.log(chalk.gray("  │  Raw response:\n"), aiResponse.slice(0, 300));
      console.log(chalk.cyan("  └" + "─".repeat(58)) + "\n");
      return;
    }

    /* ------------------------------------------------ */
    /* CREATE THE PROJECT FOLDER                        */
    /* recursive: true means it creates parent folders  */
    /* too if they don't exist — no error if it exists  */
    /* ------------------------------------------------ */
    fs.mkdirSync(folderName, { recursive: true });

    const createdFiles: string[] = [];

    for (const block of fileBlocks) {

      // First line of the block is the filename
      const lines = block.trim().split("\n");
      const filename = lines[0]?.trim();

      // The rest is the file content — remove code fence markers
      const content = lines
        .slice(1)
        .join("\n")
        .replace(/^```[\w]*\n?/, "")   // remove opening ```
        .replace(/\n?```$/, "")         // remove closing ```
        .trim();

      if (!filename || !content) continue;

      // Build the full file path inside the project folder
      const filePath = path.join(folderName, filename);

      // Create any subfolders needed (e.g. src/ inside the project)
      const fileDir = path.dirname(filePath);
      fs.mkdirSync(fileDir, { recursive: true });

      // Write the actual file
      fs.writeFileSync(filePath, content, "utf-8");

      createdFiles.push(filename);

      // Show each file as it gets written
      console.log(
        chalk.cyan("  │  ") +
        chalk.greenBright("✓ ") +
        chalk.gray(filename)
      );
    }

    /* ------------------------------------------------ */
    /* DONE                                             */
    /* ------------------------------------------------ */
    console.log(
      chalk.cyan("  │\n") +
      chalk.cyan("  │  ") + chalk.greenBright(`${createdFiles.length} files created in ./${folderName}/\n`) +
      chalk.cyan("  │  ") + chalk.gray(`To get started:\n`) +
      chalk.cyan("  │\n") +
      chalk.cyan("  │    ") + chalk.whiteBright(`cd ${folderName}\n`) +
      chalk.cyan("  │    ") + chalk.whiteBright(`cat README.md\n`) +
      chalk.cyan("  └" + "─".repeat(58)) + "\n"
    );

  } catch (error: any) {
    spinner.stop();
    console.log(chalk.redBright("  │  ✗ Error generating files: " + error?.message));
    console.log(chalk.cyan("  └" + "─".repeat(58)) + "\n");
  }
}

/* ================================================== */
/* CHAT LOOP                                          */
/* ================================================== */

async function startChat() {
  rl.question(
    chalk.greenBright.bold("\n❯ You: "),
    async (input) => {

      const trimmed = input.trim();

      if (trimmed.toLowerCase() === "exit") {
        console.log(chalk.yellowBright("\n👋 Goodbye!\n"));
        rl.close();
        process.exit(0);
      }

      if (!trimmed) return startChat();

      /* ---------- SLASH COMMANDS ---------- */
      const parts = trimmed.split(/\s+/);
      if (trimmed === "/help") { handleHelp(); return startChat(); }
      else if (trimmed === "/clear") { handleClear(); return startChat(); }
      else if (trimmed === "/save") { handleSave(); return startChat(); }
      else if (trimmed === "/count") { handleCount(); return startChat(); }
      else if (trimmed === "/config") { handleShowConfig(); return startChat(); }

      // /logout
      else if (trimmed === "/logout") {
        logout();
        console.log(chalk.yellowBright("  Session cleared. Restart to log in again."));
        process.exit(0);
      }

      // /conversations — list all past conversations
      else if (trimmed === "/conversations") {
        const convs = await listConversations(session.userId);
        convs.forEach((c: any) => {
          console.log(
            chalk.cyan(`  [${c.id}] `) +
            chalk.white(c.title ?? "Untitled") +
            chalk.gray(` · ${c._count.messages} msgs · ${c.model} · ${c.createdAt.toLocaleDateString()}`)
          );
        });
        return startChat();
      }

      // /history — reload a past conversation
      else if (parts[0] === "/history") {
        const id = parseInt(parts[1] ?? "", 10);
        if (isNaN(id)) { console.log(chalk.red("  Usage: /history <id>")); return startChat(); }
        currentConvId = id;
        isFirstMessage = false;
        const msgs = await loadRecentMessages(id, 20);
        messages.splice(1); // keep system prompt
        messages.push(...msgs);
        console.log(chalk.green(`  ✓ Loaded conversation ${id} (${msgs.length} messages)`));
        return startChat();
      }

      // /deleteaccount
      else if (trimmed === "/deleteaccount") {
        const confirm = await askQuestion("  Type DELETE to confirm: ");
        if (confirm === "DELETE") {
          await deleteAccount(session.userId);
          logout();
          console.log(chalk.red("  Account deleted."));
          process.exit(0);
        }
        return startChat();
      }

      else if (trimmed.startsWith("/")) {
        console.log("\n" + chalk.redBright(`  Unknown command: ${trimmed}`) + chalk.gray("  — type /help\n"));
        return startChat();
      }

      /* -------------------------------------------- */
      /* PHASE 4 — DETECT "create" INTENT             */
      /* If the message starts with "create",          */
      /* go to file creation mode instead of chat mode */
      /* -------------------------------------------- */
      if (trimmed.toLowerCase().startsWith("create ")) {
        await handleCreate(trimmed);
        return startChat();
      }

      /* ---------- NORMAL CHAT — SEND TO AI ---------- */
      messages.push({ role: "user", content: trimmed });

      // Save user message to DB
      await saveMessage(currentConvId, "user", trimmed);

      // Context window guard — keep max 20 messages (load from DB when trimming)
      const MAX = 20;
      if (messages.length > MAX + 1) {
        const history = await loadRecentMessages(currentConvId, MAX);
        messages.splice(1);
        messages.push(...history);
      }

      const spinner = ora({
        text: chalk.blueBright(" Epic CODE is thinking..."),
        spinner: "dots",
      }).start();

      try {
        const stream = await groq.chat.completions.create({
          model: config.model,    // uses model from config file
          messages,
          stream: true,
        });

        spinner.stop();
        printHeader();

        let reply = "";

        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content || "";
          reply += token;
          process.stdout.write(chalk.whiteBright(token));
          if (token.includes("\n")) {
            process.stdout.write(chalk.cyan("  │  "));
          }
        }

        printFooter();

        // Save assistant reply to DB
        await saveMessage(currentConvId, "assistant", reply);

        messages.push({ role: "assistant", content: reply });

        // Auto-title the conversation from the first message
        if (isFirstMessage) {
          await setConversationTitle(currentConvId, trimmed);
          isFirstMessage = false;
        }

      } catch (error: any) {
        spinner.stop();
        const msg =
          error?.status === 401 ? "❌  Invalid API key — check your .env file" :
          error?.status === 429 ? "❌  Rate limited — wait a moment and try again" :
          error?.code === "ENOTFOUND" ? "❌  No internet connection" :
          "❌  Unexpected error";
        console.log("\n" + chalk.redBright(msg));
        console.error(chalk.gray(String(error?.message || error)));
      }

      startChat();
    }
  );
}

/* ================================================== */
/* START                                              */
/* ================================================== */

// Ensure Prisma uses the binary engine by default when running locally
process.env.PRISMA_CLIENT_ENGINE_TYPE = process.env.PRISMA_CLIENT_ENGINE_TYPE ?? "binary";

// Dynamically import auth/conversations/db now that env is set
({ loadSession, register, login, logout, loadUserConfig, saveUserConfig } = await import("./auth"));
({ createConversation, setConversationTitle, saveMessage, loadRecentMessages, listConversations, deleteConversation, deleteAccount } = await import("./conversations"));
({ prisma } = await import("./db"));

// ── Startup ──────────────────────────────────────────────────
let session: any = loadSession();

if (!session) {
  const choice = await askQuestion("  No session found. [l]ogin or [r]egister? ");

  const email = await askQuestion("  Email: ");
  const password = await askQuestion("  Password: ", true);

  try {
    session = choice.toLowerCase().startsWith("r")
      ? await register(email, password)
      : await login(email, password);
    console.log(chalk.greenBright(`\n  ✓ Welcome, ${session.email}\n`));
  } catch (e: any) {
    console.log(chalk.redBright(`\n  ✗ ${e.message}\n`));
    process.exit(1);
  }
}

// Load this user's config from DB (replaces file-based config)
const userConfig = await loadUserConfig(session.userId);
config = { ...config, ...userConfig } as any;

// Start a new conversation in DB for this session
let currentConvId = await createConversation(session.userId, config.model);
let isFirstMessage = true;

// Graceful shutdown
process.on("exit", () => prisma.$disconnect());

banner();
startChat();
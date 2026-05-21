#!/usr/bin/env bun

import Groq from "groq-sdk";
import dotenv from "dotenv";
import readline from "readline";
import chalk from "chalk";
import ora from "ora";
import boxen from "boxen";
import gradient from "gradient-string";

import { marked } from "marked";
import TerminalRenderer from "marked-terminal";

/* -------------------------------------------------- */
/* ENV */
/* -------------------------------------------------- */

dotenv.config();

/* -------------------------------------------------- */
/* MARKDOWN RENDERER */
/* -------------------------------------------------- */

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/* -------------------------------------------------- */
/* GROQ CLIENT */
/* -------------------------------------------------- */

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/* -------------------------------------------------- */
/* READLINE */
/* -------------------------------------------------- */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/* -------------------------------------------------- */
/* AI MEMORY */
/* -------------------------------------------------- */

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

/* -------------------------------------------------- */
/* BANNER */
/* -------------------------------------------------- */

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

  console.log(
    chalk.gray(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    )
  );

  console.log(
    chalk.cyanBright.bold(
      "               ⚡ EPIC CODE AI ASSISTANT ⚡"
    )
  );

  console.log(
    chalk.gray(
      '\n                 Type "exit" to quit\n'
    )
  );
}

/* -------------------------------------------------- */
/* CURRENT TIME */
/* -------------------------------------------------- */

function currentTime() {
  return chalk.gray(
    `[${new Date().toLocaleTimeString()}]`
  );
}

/* -------------------------------------------------- */
/* CHAT LOOP */
/* -------------------------------------------------- */

async function startChat() {

  rl.question(
    chalk.greenBright.bold("❯ You: "),
    async (input) => {

      /* ---------- EXIT ---------- */

      if (input.trim().toLowerCase() === "exit") {

        console.log(
          chalk.yellowBright("\n👋 Goodbye!\n")
        );

        rl.close();
        process.exit(0);
      }

      /* ---------- EMPTY INPUT ---------- */

      if (!input.trim()) {
        return startChat();
      }

      /* ---------- SAVE USER MESSAGE ---------- */

      messages.push({
        role: "user",
        content: input,
      });

      /* ---------- SPINNER ---------- */

      const spinner = ora({
        text: chalk.blueBright(
          " Epic CODE is thinking..."
        ),
        spinner: "dots",
      }).start();

      try {

        /* ---------- AI REQUEST ---------- */

        const completion =
          await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages,
          });

        spinner.stop();

        /* ---------- EXTRACT RESPONSE ---------- */

        const reply =
          completion.choices[0]?.message?.content ||
          "No response received.";

        /* ---------- SAVE AI RESPONSE ---------- */

        messages.push({
          role: "assistant",
          content: reply,
        });

        /* ---------- RENDER MARKDOWN ---------- */

        const renderedMarkdown = marked(reply);

        /* ---------- BOX UI ---------- */

        const aiBox = boxen(
          renderedMarkdown as string,
          {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "cyan",
            title: `${currentTime()} EPIC CODE`,
            titleAlignment: "left",
            width: 90,
          }
        );

        /* ---------- PRINT RESPONSE ---------- */

        console.log(aiBox);

      } catch (error) {

        spinner.stop();

        const errorBox = boxen(
          chalk.redBright(
            "❌ Error communicating with Groq API"
          ),
          {
            padding: 1,
            borderStyle: "round",
            borderColor: "red",
          }
        );

        console.log(errorBox);

        console.error(error);
      }

      /* ---------- LOOP AGAIN ---------- */

      startChat();
    }
  );
}

/* -------------------------------------------------- */
/* START APP */
/* -------------------------------------------------- */

banner();
startChat();
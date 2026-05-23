# ⚡ Epic CODE

> An elite AI coding assistant that lives in your terminal.

```
███████╗██████╗ ██╗ ██████╗     ██████╗ ██████╗ ██████╗ ███████╗
██╔════╝██╔══██╗██║██╔════╝    ██╔════╝██╔═══██╗██╔══██╗██╔════╝
█████╗  ██████╔╝██║██║         ██║     ██║   ██║██║  ██║█████╗
██╔══╝  ██╔═══╝ ██║██║         ██║     ██║   ██║██║  ██║██╔══╝
███████╗██║     ██║╚██████╗    ╚██████╗╚██████╔╝██████╔╝███████╗
╚══════╝╚═╝     ╚═╝ ╚═════╝     ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
```

## Install

```bash
npm install -g epiccli
# or
bun add -g epiccli
```

## First-time setup

You need two things:

**1. A free Groq API key** (the AI engine)
→ Get one at https://console.groq.com — it's free

**2. A free PostgreSQL database** (stores your chat history)
→ Get one at https://neon.tech — free tier is plenty

When you first run `epiccli`, it will ask for both and save them
to `~/.epiccode/.env` automatically.

## Usage

```bash
epiccli
```

## Commands

| Command | Description |
|---|---|
| `/help` | Show all commands |
| `/clear` | Reset the conversation |
| `/save` | Export chat to markdown |
| `/count` | Show context window usage |
| `/config` | Show current settings |
| `/config set model <name>` | Switch AI model |
| `/conversations` | List past conversations |
| `/history <id>` | Load a past conversation |
| `/logout` | Clear session |
| `create <app>` | Generate a project on disk |
| `exit` | Quit |

## Models

Epic CODE uses Groq by default. Supported models:

- `llama-3.3-70b-versatile` (default, best quality)
- `llama-3.1-8b-instant` (fastest)
- `mixtral-8x7b-32768` (large context)

Switch with: `/config set model llama-3.1-8b-instant`

## Generate a project

```
❯ You: create a REST API with Express and TypeScript
```

Epic CODE will generate all the files and drop them in a folder
in your current directory.

## Requirements

- Node.js 20+ or Bun 1.0+
- A Groq API key (free)
- A PostgreSQL database (Neon free tier works great)

## License

MIT
# WhatsApp MCP (Mac Catalyst) 🚀

A secure, local-first, **Read-Only** Model Context Protocol (MCP) server for WhatsApp Desktop on macOS.

This tool allows AI assistants (like Claude Desktop or local Ollama models) to read and summarize your WhatsApp messages directly from the local macOS CoreData SQLite database, completely bypassing the need for cloud APIs or WhatsApp Web automation.

---

## 🔒 Security & Privacy First

- **100% Local:** Your WhatsApp messages never leave your machine (unless your chosen AI client sends them).
- **Read-Only Enforcement:** This tool is strictly read-only. It opens the database in read-only mode and uses parameterized queries.
- **Localhost only, token protected:** The daemon listens on `127.0.0.1` only, checks the `Host` header (blocks DNS rebinding) and requires a random token stored in `~/Library/Application Support/whatsapp-mcp/token` (owner-only).
- **Access switch:** The menu bar app has an On/Off switch. When it is off, every data request is refused and the snapshot is deleted.
- **Snapshot Isolation:** To prevent `database is locked` errors while WhatsApp is running, this tool copies the database into a private folder (`~/Library/Application Support/whatsapp-mcp/snapshot`, owner-only) and deletes it when access is turned off or the app quits.
- **No Sending:** There is no send tool. The server can only read.

## 🏗 Architecture

This project is split into two parts to solve macOS `Full Disk Access` limitations cleanly:

1. **The Daemon (`src/daemon.ts`):** A lightweight local Express API server that reads the database. It runs inside the menu bar app (give the app Full Disk Access), or in a terminal with Full Disk Access via `npm run daemon`.
2. **The MCP Proxy (`src/index.ts`):** The actual MCP server configured in Claude Desktop. It has zero disk access privileges and simply fetches data from the Daemon via HTTP.

## 🛠 Features (Available MCP Tools)

- `whatsapp_doctor`: Diagnoses database paths and access permissions.
- `whatsapp_list_chats`: Lists your most recent chats and groups.
- `whatsapp_recent_messages`: Fetches recent messages globally or from a specific chat. `since` returns only newer messages.
- `whatsapp_search_messages`: Searches messages by text query (e.g., "meeting", "payment").
- `whatsapp_chat_history`: Gets chronological message history for a specific chat.
- `whatsapp_digest_data`: Provides a grouped, structured payload specially designed for AI models to answer _"What did I miss on WhatsApp today?"_

Messages include the community name (when known), mentions resolved to names, readable system events and placeholders for media (`[Image]`, `[Document: name]`).

---

## 🚀 Getting Started

### Prerequisites

- macOS (Apple Silicon / Intel)
- Official WhatsApp Desktop App installed from the Mac App Store (Catalyst version).
- Node.js (v18+)

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Daemon

You must run the daemon in a terminal that has **Full Disk Access** (e.g., iTerm2 or Terminal).

```bash
npm run daemon
```

_The daemon will run on `http://127.0.0.1:3456`._

### 3. Configure Claude Desktop

Add this project to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "whatsapp-mcp": {
      "command": "/path/to/your/node",
      "args": [
        "/path/to/whatsapp-mcp/node_modules/.bin/tsx",
        "/path/to/whatsapp-mcp/src/index.ts"
      ]
    }
  }
}
```

Restart Claude Desktop and try asking:

- _"Run whatsapp_doctor"_
- _"What did I miss on WhatsApp today?"_

## 🔮 Roadmap

- **Phase 1-4:** ✅ Secure Read-Only SQLite Access & AI Digesting.
- **Phase 5:** ⏳ **Tauri / Rust Status Bar App**: Bundle the daemon into a native macOS menu bar app with a simple ON/OFF switch and built-in Ollama support for 100% offline privacy! (Coming Next)

---

_Disclaimer: This is an unofficial tool and is not affiliated with WhatsApp or Meta._

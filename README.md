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

### Requirements

- macOS on Apple Silicon (the release is built for arm64).
- The official WhatsApp Desktop app from the Mac App Store, signed in.
- Claude Desktop or Claude Code.

### 1. Install the app

1. Download `whatsapp-mcp-<version>-arm64.dmg` from [Releases](https://github.com/mehedisarkar2k/whatsapp-mcp/releases).
2. Open the DMG and drag **whatsapp-mcp** into **Applications**.
3. The app is not signed by Apple, so the first launch is blocked. Right-click the app and choose **Open**, or allow it in **System Settings > Privacy & Security > Open Anyway**.

### 2. Give it Full Disk Access

WhatsApp keeps its messages in a protected folder.

1. Open **System Settings > Privacy & Security > Full Disk Access**.
2. Click **+**, add **/Applications/whatsapp-mcp.app** and turn it on.
3. Quit the app from its menu bar popup and open it again.

The popup should now show **Database: Readable**.

### 3. Connect Claude

**Claude Desktop:** click the menu bar icon, then **Copy Claude config**. Open `~/Library/Application Support/Claude/claude_desktop_config.json` and add the copied `whatsapp-mcp` entry inside `mcpServers` (keep your other servers). Restart Claude Desktop.

**Claude Code:**

```bash
claude mcp add whatsapp-mcp -s user -e ELECTRON_RUN_AS_NODE=1 -- /Applications/whatsapp-mcp.app/Contents/MacOS/whatsapp-mcp /Applications/whatsapp-mcp.app/Contents/Resources/app.asar/dist/index.js
```

Then try: _"Run whatsapp_doctor"_ or _"What did I miss on WhatsApp today?"_

The menu bar app must be running while Claude uses WhatsApp.

## 🔑 Token and access

- **You never copy the token.** The app creates it on first launch at `~/Library/Application Support/whatsapp-mcp/token` (only your macOS user can read it). The MCP server reads the same file on every request.
- **Reset token** (menu bar popup) creates a new token at once. The old token stops working, and Claude keeps working without a restart. Use it if you think the file was copied or shared.
- **WhatsApp access On/Off** (menu bar popup): when off, every data request is refused and the private snapshot is deleted.
- Never share or commit the token file. It only works on your own Mac (`127.0.0.1`), but it is the key to your messages.

## 🔄 Update or remove

- **Update:** quit the app from its popup, replace it in Applications with the new version, open it, then restart Claude. Because the app is unsigned, macOS may ask for Full Disk Access again.
- **Remove:** delete the app, delete `~/Library/Application Support/whatsapp-mcp`, and remove the `whatsapp-mcp` entry from your Claude config.

## 🛠 Build from source

```bash
npm install
npm run electron:start   # run the menu bar app
npm run dist             # build the DMG into release/
```

Without the app, `npm run daemon` runs the API in a terminal that has Full Disk Access.

## 🔮 Roadmap

- **Phase 1-4:** ✅ Secure Read-Only SQLite Access & AI Digesting.
- **Phase 5:** ⏳ **Tauri / Rust Status Bar App**: Bundle the daemon into a native macOS menu bar app with a simple ON/OFF switch and built-in Ollama support for 100% offline privacy! (Coming Next)

---

_Disclaimer: This is an unofficial tool and is not affiliated with WhatsApp or Meta._

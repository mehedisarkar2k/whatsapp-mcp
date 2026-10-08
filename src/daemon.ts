import express from "express";
import { checkDatabaseAccess } from "./whatsapp/paths.js";
import {
  listChats,
  getRecentMessages,
  searchMessages,
  getChatHistory,
  getDigestData,
  getMediaRecord,
  closeDbAndDeleteSnapshot,
} from "./whatsapp/db.js";
import { MediaError, loadImage } from "./whatsapp/media.js";
import {
  DAEMON_HOST,
  DAEMON_PORT,
  createNewToken,
  getOrCreateToken,
  loadAccessEnabled,
  saveAccessEnabled,
  tokenMatches,
} from "./whatsapp/security.js";

const app = express();
let token = getOrCreateToken();
let accessEnabled = loadAccessEnabled();

export function getAccessEnabled(): boolean {
  return accessEnabled;
}

// MCP clients read the token file on every request, so they pick up the new token without a restart.
export function resetToken(): void {
  token = createNewToken();
}

export function setAccessEnabled(enabled: boolean): void {
  accessEnabled = enabled;
  saveAccessEnabled(enabled);
  if (!enabled) closeDbAndDeleteSnapshot();
}

// Only these Host values are accepted, which blocks DNS-rebinding requests from web pages.
const allowedHosts = new Set([`${DAEMON_HOST}:${DAEMON_PORT}`, `localhost:${DAEMON_PORT}`]);

app.use((req, res, next) => {
  if (!allowedHosts.has(req.headers.host ?? "")) {
    res.status(403).json({ error: "Forbidden host" });
    return;
  }
  if (!tokenMatches(req.headers.authorization, token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!accessEnabled && req.path !== "/doctor") {
    res.status(503).json({ error: "WhatsApp access is turned off in the WhatsApp MCP menu bar app." });
    return;
  }
  next();
});

function intParam(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === "string" ? parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseSinceParam(value: unknown): { since?: string; error?: string } {
  if (value === undefined) return {};
  if (typeof value !== "string" || value.length === 0 || Number.isNaN(Date.parse(value))) {
    return { error: "Invalid 'since' parameter. Expected an ISO-8601 date." };
  }
  return { since: new Date(value).toISOString() };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

app.get("/doctor", (req, res) => {
  try {
    res.json({ ...checkDatabaseAccess(), accessEnabled });
  } catch (err: unknown) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

app.get("/chats", (req, res) => {
  try {
    res.json(listChats(intParam(req.query.limit, 20, 200)));
  } catch (err: unknown) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

app.get("/recent", (req, res) => {
  try {
    const since = parseSinceParam(req.query.since);
    if (since.error) {
      res.status(400).json({ error: since.error });
      return;
    }
    res.json(getRecentMessages(intParam(req.query.limit, 30, 200), stringParam(req.query.chatId), since.since));
  } catch (err: unknown) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

app.get("/search", (req, res) => {
  try {
    const query = stringParam(req.query.q);
    if (!query) {
      res.status(400).json({ error: "Missing query parameter 'q'" });
      return;
    }
    const since = parseSinceParam(req.query.since);
    if (since.error) {
      res.status(400).json({ error: since.error });
      return;
    }
    res.json(searchMessages(query, intParam(req.query.limit, 30, 200), stringParam(req.query.chatId), since.since));
  } catch (err: unknown) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

app.get("/history", (req, res) => {
  try {
    const chatId = stringParam(req.query.chatId);
    if (!chatId) {
      res.status(400).json({ error: "Missing query parameter 'chatId'" });
      return;
    }
    const since = parseSinceParam(req.query.since);
    if (since.error) {
      res.status(400).json({ error: since.error });
      return;
    }
    res.json(getChatHistory(chatId, intParam(req.query.limit, 50, 200), since.since));
  } catch (err: unknown) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

app.get("/digest", (req, res) => {
  try {
    const since = parseSinceParam(req.query.since);
    if (since.error) {
      res.status(400).json({ error: since.error });
      return;
    }
    const hours = intParam(req.query.hours, 24, 720);
    const limitPerChat = intParam(req.query.limitPerChat, 10, 100);
    res.json(getDigestData(hours, limitPerChat, stringParam(req.query.chatId), since.since));
  } catch (err: unknown) {
    res.status(500).json({ error: errorMessage(err) });
  }
});

app.get("/media", async (req, res) => {
  try {
    const messageId = stringParam(req.query.messageId);
    if (!messageId) {
      res.status(400).json({ error: "Missing query parameter 'messageId'" });
      return;
    }
    const record = getMediaRecord(messageId, stringParam(req.query.chatId));
    if (!record) {
      res.status(404).json({ error: "No media found for that message ID." });
      return;
    }
    res.json(await loadImage(record));
  } catch (err: unknown) {
    res.status(err instanceof MediaError ? 422 : 500).json({ error: errorMessage(err) });
  }
});

const server = app.listen(DAEMON_PORT, DAEMON_HOST, () => {
  console.log(`WhatsApp Daemon is running on http://${DAEMON_HOST}:${DAEMON_PORT}`);
});

server.on("error", (err) => {
  console.error("WhatsApp Daemon failed to start:", err);
});

function shutdown(): void {
  closeDbAndDeleteSnapshot();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

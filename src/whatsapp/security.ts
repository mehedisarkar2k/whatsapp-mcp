import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

export const DAEMON_HOST = "127.0.0.1";
export const DAEMON_PORT = 3456;

export const APP_DIR = path.join(os.homedir(), "Library/Application Support/whatsapp-mcp");
const TOKEN_PATH = path.join(APP_DIR, "token");
const SETTINGS_PATH = path.join(APP_DIR, "settings.json");

export function ensureAppDir(): void {
  fs.mkdirSync(APP_DIR, { recursive: true, mode: 0o700 });
  fs.chmodSync(APP_DIR, 0o700);
}

// The daemon and the MCP proxy run as separate processes, so they share the token through a
// file only this macOS user can read.
export function getOrCreateToken(): string {
  ensureAppDir();
  if (fs.existsSync(TOKEN_PATH)) {
    const existing = fs.readFileSync(TOKEN_PATH, "utf8").trim();
    if (existing.length >= 64) return existing;
  }
  const token = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
  fs.chmodSync(TOKEN_PATH, 0o600);
  return token;
}

export function readToken(): string {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("WhatsApp MCP token not found. Open the WhatsApp MCP menu bar app once to create it.");
  }
  return fs.readFileSync(TOKEN_PATH, "utf8").trim();
}

export function tokenMatches(authorizationHeader: string | undefined, token: string): boolean {
  const prefix = "Bearer ";
  if (!authorizationHeader?.startsWith(prefix)) return false;
  const given = Buffer.from(authorizationHeader.slice(prefix.length));
  const expected = Buffer.from(token);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export function loadAccessEnabled(): boolean {
  if (!fs.existsSync(SETTINGS_PATH)) return true;
  const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
  return settings.accessEnabled !== false;
}

export function saveAccessEnabled(enabled: boolean): void {
  ensureAppDir();
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ accessEnabled: enabled }), { mode: 0o600 });
}

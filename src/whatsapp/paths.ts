import os from "os";
import path from "path";
import fs from "fs";
import { APP_DIR, ensureAppDir } from "./security.js";

export function getDatabasePath(): string {
  if (process.env.WHATSAPP_CHAT_DB) {
    return process.env.WHATSAPP_CHAT_DB;
  }
  return path.join(
    os.homedir(),
    "Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite"
  );
}

// Media files sit next to the database, in the "Message" folder of WhatsApp's shared container.
export function getMediaRoot(): string {
  return path.join(path.dirname(getDatabasePath()), "Message");
}

export function checkDatabaseAccess(): { exists: boolean; readable: boolean; error?: string } {
  const dbPath = getDatabasePath();
  try {
    fs.accessSync(dbPath, fs.constants.F_OK);
  } catch (err) {
    return { exists: false, readable: false, error: "Database file not found at " + dbPath };
  }

  try {
    fs.accessSync(dbPath, fs.constants.R_OK);
    return { exists: true, readable: true };
  } catch (err) {
    return {
      exists: true,
      readable: false,
      error: "Permission denied. macOS Full Disk Access is required for the terminal running this MCP server.",
    };
  }
}

const SNAPSHOT_DIR = path.join(APP_DIR, "snapshot");
const SNAPSHOT_PATH = path.join(SNAPSHOT_DIR, "ChatStorage.sqlite");
const SNAPSHOT_SUFFIXES = ["", "-wal", "-shm"];

function copyPrivate(from: string, to: string): void {
  fs.copyFileSync(from, to);
  fs.chmodSync(to, 0o600);
}

// Reading a copy avoids WhatsApp's SQLite locks. The copy holds the full chat history, so it
// lives in a private folder and is deleted when access is turned off or the app quits.
export function createDatabaseSnapshot(): string {
  const originalDbPath = getDatabasePath();
  ensureAppDir();
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true, mode: 0o700 });
  fs.chmodSync(SNAPSHOT_DIR, 0o700);

  for (const suffix of SNAPSHOT_SUFFIXES) {
    const source = originalDbPath + suffix;
    const target = SNAPSHOT_PATH + suffix;
    if (fs.existsSync(source)) {
      copyPrivate(source, target);
    } else if (suffix && fs.existsSync(target)) {
      fs.unlinkSync(target);
    }
  }

  return SNAPSHOT_PATH;
}

export function deleteDatabaseSnapshot(): void {
  fs.rmSync(SNAPSHOT_DIR, { recursive: true, force: true });
}

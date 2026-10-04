import os from "os";
import path from "path";
import fs from "fs";

export function getDatabasePath(): string {
  if (process.env.WHATSAPP_CHAT_DB) {
    return process.env.WHATSAPP_CHAT_DB;
  }
  return path.join(
    os.homedir(),
    "Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite"
  );
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

export function createDatabaseSnapshot(): string {
  const originalDbPath = getDatabasePath();
  const snapshotDir = path.join(os.tmpdir(), "whatsapp-mcp-snapshot");
  
  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }

  const snapshotPath = path.join(snapshotDir, "ChatStorage.sqlite");
  
  // Copy the main database
  fs.copyFileSync(originalDbPath, snapshotPath);
  
  // Attempt to copy WAL and SHM files if they exist, to ensure consistency
  const walPath = originalDbPath + "-wal";
  const shmPath = originalDbPath + "-shm";
  
  if (fs.existsSync(walPath)) {
    fs.copyFileSync(walPath, snapshotPath + "-wal");
  } else {
    if (fs.existsSync(snapshotPath + "-wal")) fs.unlinkSync(snapshotPath + "-wal");
  }
  
  if (fs.existsSync(shmPath)) {
    fs.copyFileSync(shmPath, snapshotPath + "-shm");
  } else {
    if (fs.existsSync(snapshotPath + "-shm")) fs.unlinkSync(snapshotPath + "-shm");
  }

  return snapshotPath;
}

import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { APP_DIR, ensureAppDir } from "./security.js";
import { getMediaRoot } from "./paths.js";
import { MediaRecord } from "./db.js";

const run = promisify(execFile);

const IMAGE_MESSAGE_TYPES = new Set([1, 15]); // image, sticker
const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_RETURN_BYTES = 3 * 1024 * 1024;
const RESIZE_PIXELS = 1600;

export interface MediaPayload {
  mimeType: string;
  data: string;
  bytes: number;
  resized: boolean;
}

export class MediaError extends Error {}

// The path comes from the database, so it is never trusted: it must resolve (symlinks included)
// to a regular image file inside WhatsApp's own Media folder.
function resolveSafePath(localPath: string): string {
  const mediaRoot = path.join(getMediaRoot(), "Media");
  let root: string;
  let resolved: string;
  try {
    root = fs.realpathSync(mediaRoot);
    resolved = fs.realpathSync(path.resolve(getMediaRoot(), localPath));
  } catch {
    throw new MediaError("The image file is not on this Mac (it may not be downloaded or was deleted).");
  }
  if (!resolved.startsWith(root + path.sep)) throw new MediaError("Refused: file is outside the WhatsApp media folder.");
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new MediaError("Refused: not a regular file.");
  if (stat.size > MAX_FILE_BYTES) throw new MediaError("Refused: file is larger than 20 MB.");
  return resolved;
}

export async function loadImage(record: MediaRecord): Promise<MediaPayload> {
  if (!IMAGE_MESSAGE_TYPES.has(record.messageType)) {
    throw new MediaError("This message is not an image or sticker. Only images can be returned.");
  }
  const file = resolveSafePath(record.localPath);
  const mimeType = MIME_BY_EXTENSION[path.extname(file).toLowerCase()];
  if (!mimeType) throw new MediaError("Unsupported image type.");

  let bytes = fs.readFileSync(file);
  let resized = false;
  if (bytes.length > MAX_RETURN_BYTES) {
    // sips ships with macOS. The copy goes to the private app folder and is deleted right away.
    ensureAppDir();
    const tmp = path.join(APP_DIR, `media-${process.pid}-${Date.now()}.jpg`);
    try {
      await run("/usr/bin/sips", ["-Z", String(RESIZE_PIXELS), "-s", "format", "jpeg", file, "--out", tmp]);
      bytes = fs.readFileSync(tmp);
      resized = true;
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  return { mimeType: resized ? "image/jpeg" : mimeType, data: bytes.toString("base64"), bytes: bytes.length, resized };
}

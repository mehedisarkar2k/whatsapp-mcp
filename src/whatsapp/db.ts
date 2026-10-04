import Database from "better-sqlite3";
import { getDatabasePath, checkDatabaseAccess, createDatabaseSnapshot } from "./paths.js";
import { coreDataToISO, getCoreDataThreshold } from "./time.js";
import { WhatsAppChat, WhatsAppMessage } from "./types.js";

let dbInstance: Database.Database | null = null;
let dbLastSnapshotTime: number = 0;
const SNAPSHOT_CACHE_MS = 60 * 1000; // Reuse snapshot for 60 seconds

export function getDb(): Database.Database {
  const access = checkDatabaseAccess();
  if (!access.readable) {
    throw new Error(`Cannot read database: ${access.error}`);
  }

  const now = Date.now();
  // Reuse existing connection/snapshot if it was created within the last 60 seconds
  if (dbInstance && (now - dbLastSnapshotTime < SNAPSHOT_CACHE_MS)) {
    return dbInstance;
  }

  // Close old instance if it exists
  if (dbInstance) {
    try { dbInstance.close(); } catch (e) {}
  }

  // Create a snapshot to bypass WhatsApp's SQLite locks
  const snapshotPath = createDatabaseSnapshot();

  // Open strictly read-only on the snapshot
  dbInstance = new Database(snapshotPath, { readonly: true, fileMustExist: true });
  dbLastSnapshotTime = now;
  
  return dbInstance;
}

export function getMaxHistoryDays(): number {
  return process.env.MAX_HISTORY_DAYS ? parseInt(process.env.MAX_HISTORY_DAYS, 10) : 30;
}

function mapMessageRow(row: any): WhatsAppMessage {
  const isGroup = row.chatJid ? row.chatJid.includes("@g.us") : false;
  return {
    id: row.stanzaId || "",
    chatId: row.chatJid || "",
    chatName: row.chatName || null,
    senderId: row.senderJid || null,
    senderName: row.senderName || null,
    text: row.text || null,
    timestamp: row.messageDate ? coreDataToISO(row.messageDate) : new Date().toISOString(),
    direction: row.isFromMe ? "outbound" : "inbound",
    isGroup,
  };
}

export function listChats(limit = 20): WhatsAppChat[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      ZCONTACTJID as id,
      ZPARTNERNAME as name,
      ZUNREADCOUNT as unreadCount,
      ZLASTMESSAGEDATE as lastMessageDate
    FROM ZWACHATSESSION
    ORDER BY ZLASTMESSAGEDATE DESC
    LIMIT ?
  `);
  
  const rows = stmt.all(limit) as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    isGroup: r.id ? r.id.includes("@g.us") : false,
    unreadCount: r.unreadCount || 0,
    lastMessageTimestamp: r.lastMessageDate ? coreDataToISO(r.lastMessageDate) : null,
  }));
}

export function getRecentMessages(limit = 20, chatJid?: string): WhatsAppMessage[] {
  const db = getDb();
  const timeThreshold = getCoreDataThreshold(getMaxHistoryDays());

  let sql = `
    SELECT 
      m.ZSTANZAID as stanzaId,
      m.ZTEXT as text,
      m.ZMESSAGEDATE as messageDate,
      m.ZFROMJID as senderJid,
      m.ZPUSHNAME as senderName,
      m.ZISFROMME as isFromMe,
      c.ZCONTACTJID as chatJid,
      c.ZPARTNERNAME as chatName
    FROM ZWAMESSAGE m
    LEFT JOIN ZWACHATSESSION c ON m.ZCHATSESSION = c.Z_PK
    WHERE m.ZMESSAGEDATE >= ?
  `;
  const params: any[] = [timeThreshold];

  if (chatJid) {
    sql += ` AND c.ZCONTACTJID = ?`;
    params.push(chatJid);
  }

  sql += ` ORDER BY m.ZMESSAGEDATE DESC LIMIT ?`;
  params.push(limit);

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params);
  return rows.map(mapMessageRow).reverse(); // Return in chronological order
}

export function searchMessages(query: string, limit = 30, chatJid?: string): WhatsAppMessage[] {
  const db = getDb();
  const timeThreshold = getCoreDataThreshold(getMaxHistoryDays());

  let sql = `
    SELECT 
      m.ZSTANZAID as stanzaId,
      m.ZTEXT as text,
      m.ZMESSAGEDATE as messageDate,
      m.ZFROMJID as senderJid,
      m.ZPUSHNAME as senderName,
      m.ZISFROMME as isFromMe,
      c.ZCONTACTJID as chatJid,
      c.ZPARTNERNAME as chatName
    FROM ZWAMESSAGE m
    LEFT JOIN ZWACHATSESSION c ON m.ZCHATSESSION = c.Z_PK
    WHERE m.ZMESSAGEDATE >= ? AND m.ZTEXT LIKE ?
  `;
  const params: any[] = [timeThreshold, `%${query}%`];

  if (chatJid) {
    sql += ` AND c.ZCONTACTJID = ?`;
    params.push(chatJid);
  }

  sql += ` ORDER BY m.ZMESSAGEDATE DESC LIMIT ?`;
  params.push(limit);

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params);
  return rows.map(mapMessageRow).reverse();
}

export function getChatHistory(chatJid: string, limit = 50): WhatsAppMessage[] {
  const db = getDb();
  const timeThreshold = getCoreDataThreshold(getMaxHistoryDays());

  let sql = `
    SELECT 
      m.ZSTANZAID as stanzaId,
      m.ZTEXT as text,
      m.ZMESSAGEDATE as messageDate,
      m.ZFROMJID as senderJid,
      m.ZPUSHNAME as senderName,
      m.ZISFROMME as isFromMe,
      c.ZCONTACTJID as chatJid,
      c.ZPARTNERNAME as chatName
    FROM ZWAMESSAGE m
    LEFT JOIN ZWACHATSESSION c ON m.ZCHATSESSION = c.Z_PK
    WHERE m.ZMESSAGEDATE >= ? AND c.ZCONTACTJID = ?
    ORDER BY m.ZMESSAGEDATE DESC LIMIT ?
  `;
  const params: any[] = [timeThreshold, chatJid, limit];

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params);
  return rows.map(mapMessageRow).reverse(); // chronological
}

export function getDigestData(hours = 24, limitPerChat = 10, chatJid?: string): Record<string, any> {
  const db = getDb();
  const maxDays = getMaxHistoryDays();
  const requestedDays = hours / 24;
  const effectiveDays = Math.min(maxDays, requestedDays);
  
  const timeThreshold = getCoreDataThreshold(effectiveDays);

  let sql = `
    SELECT 
      m.ZSTANZAID as stanzaId,
      m.ZTEXT as text,
      m.ZMESSAGEDATE as messageDate,
      m.ZFROMJID as senderJid,
      m.ZPUSHNAME as senderName,
      m.ZISFROMME as isFromMe,
      c.ZCONTACTJID as chatJid,
      c.ZPARTNERNAME as chatName
    FROM ZWAMESSAGE m
    LEFT JOIN ZWACHATSESSION c ON m.ZCHATSESSION = c.Z_PK
    WHERE m.ZMESSAGEDATE >= ?
  `;
  
  const params: any[] = [timeThreshold];
  if (chatJid) {
    sql += ` AND c.ZCONTACTJID = ?`;
    params.push(chatJid);
  }
  
  sql += ` ORDER BY m.ZMESSAGEDATE DESC`;
  
  const stmt = db.prepare(sql);
  const rows = stmt.all(...params);
  const messages = rows.map(mapMessageRow);
  
  // Group by chat
  const grouped: Record<string, { chatName: string, isGroup: boolean, messages: WhatsAppMessage[] }> = {};
  
  for (const msg of messages) {
    if (!grouped[msg.chatId]) {
      grouped[msg.chatId] = {
        chatName: msg.chatName || msg.chatId,
        isGroup: msg.isGroup,
        messages: []
      };
    }
    
    if (grouped[msg.chatId].messages.length < limitPerChat) {
      grouped[msg.chatId].messages.push(msg);
    }
  }
  
  // Reverse each chat's messages so they are chronological
  for (const key of Object.keys(grouped)) {
    grouped[key].messages.reverse();
  }

  return grouped;
}

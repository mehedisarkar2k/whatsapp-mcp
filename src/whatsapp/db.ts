import Database from "better-sqlite3";
import { checkDatabaseAccess, createDatabaseSnapshot, deleteDatabaseSnapshot } from "./paths.js";
import { coreDataToISO, getCoreDataThreshold, isoToCoreData } from "./time.js";
import { CommunityMap, getCommunityMap } from "./community.js";
import { createMentionResolver, formatMessage, MentionResolver } from "./format.js";
import { WhatsAppChat, WhatsAppMessage, DigestChat } from "./types.js";

let dbInstance: Database.Database | null = null;
let dbLastSnapshotTime: number = 0;
const SNAPSHOT_CACHE_MS = 60 * 1000; // Reuse snapshot for 60 seconds

const SUPPORTED_MEDIA_TYPES = [1, 2, 3, 4, 5, 8, 11, 15];

const MESSAGE_SELECT = `
  SELECT
    m.ZSTANZAID as stanzaId,
    m.ZTEXT as text,
    m.ZMESSAGEDATE as messageDate,
    m.ZMESSAGETYPE as messageType,
    m.ZISFROMME as isFromMe,
    CASE WHEN m.ZISFROMME = 1 THEN 'Me' WHEN m.ZGROUPMEMBER IS NOT NULL THEN gm.ZMEMBERJID ELSE m.ZFROMJID END as senderJid,
    CASE WHEN m.ZISFROMME = 1 THEN 'Me' ELSE COALESCE(pn.ZPUSHNAME, c_sender.ZPARTNERNAME) END as senderName,
    c.ZCONTACTJID as chatJid,
    c.ZPARTNERNAME as chatName,
    mi.ZTITLE as mediaTitle
  FROM ZWAMESSAGE m
  LEFT JOIN ZWACHATSESSION c ON m.ZCHATSESSION = c.Z_PK
  LEFT JOIN ZWAGROUPMEMBER gm ON m.ZGROUPMEMBER = gm.Z_PK
  LEFT JOIN ZWAPROFILEPUSHNAME pn ON pn.ZJID = (CASE WHEN m.ZGROUPMEMBER IS NOT NULL THEN gm.ZMEMBERJID ELSE m.ZFROMJID END)
  LEFT JOIN ZWACHATSESSION c_sender ON c_sender.ZCONTACTJID = (CASE WHEN m.ZGROUPMEMBER IS NOT NULL THEN gm.ZMEMBERJID ELSE m.ZFROMJID END)
  LEFT JOIN ZWAMEDIAITEM mi ON mi.Z_PK = m.ZMEDIAITEM
`;

interface MessageRow {
  stanzaId: string | null;
  text: string | null;
  messageDate: number | null;
  messageType: number | null;
  isFromMe: number | null;
  senderJid: string | null;
  senderName: string | null;
  chatJid: string | null;
  chatName: string | null;
  mediaTitle: string | null;
}

interface MessageQuery {
  minDate: number;
  since?: number;
  chatJid?: string;
  search?: string;
  limit?: number;
}

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

  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }

  // Create a snapshot to bypass WhatsApp's SQLite locks
  const snapshotPath = createDatabaseSnapshot();

  // Open strictly read-only on the snapshot
  dbInstance = new Database(snapshotPath, { readonly: true, fileMustExist: true });
  dbLastSnapshotTime = now;

  return dbInstance;
}

export function closeDbAndDeleteSnapshot(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  deleteDatabaseSnapshot();
}

export function getMaxHistoryDays(): number {
  return process.env.MAX_HISTORY_DAYS ? parseInt(process.env.MAX_HISTORY_DAYS, 10) : 30;
}

function mapMessageRow(
  row: MessageRow,
  communities: CommunityMap,
  resolveMention: MentionResolver
): WhatsAppMessage {
  const formatted = formatMessage(row, resolveMention);
  const isGroup = row.chatJid ? row.chatJid.includes("@g.us") : false;
  return {
    id: row.stanzaId || "",
    chatId: row.chatJid || "",
    chatName: row.chatName || null,
    senderId: row.senderJid || null,
    senderName: row.senderName || null,
    text: formatted.text,
    timestamp: row.messageDate ? coreDataToISO(row.messageDate) : new Date().toISOString(),
    direction: row.isFromMe ? "outbound" : "inbound",
    isGroup,
    kind: formatted.kind,
    community: row.chatJid ? communities.get(row.chatJid) ?? null : null,
  };
}

function queryMessages(query: MessageQuery): WhatsAppMessage[] {
  const db = getDb();
  const conditions = [
    `(m.ZTEXT IS NOT NULL OR m.ZMESSAGETYPE IN (${SUPPORTED_MEDIA_TYPES.join(", ")}))`,
    `m.ZMESSAGEDATE >= ?`,
  ];
  const params: (number | string)[] = [query.minDate];

  if (query.since !== undefined) {
    conditions.push(`m.ZMESSAGEDATE > ?`);
    params.push(query.since);
  }
  if (query.chatJid) {
    conditions.push(`c.ZCONTACTJID = ?`);
    params.push(query.chatJid);
  }
  if (query.search !== undefined) {
    conditions.push(`m.ZTEXT LIKE ?`);
    params.push(`%${query.search}%`);
  }

  let sql = `${MESSAGE_SELECT} WHERE ${conditions.join(" AND ")} ORDER BY m.ZMESSAGEDATE DESC`;
  if (query.limit !== undefined) {
    sql += ` LIMIT ?`;
    params.push(query.limit);
  }

  const rows = db.prepare(sql).all(...params) as MessageRow[];
  const communities = getCommunityMap(db);
  const resolveMention = createMentionResolver(db);
  return rows.map((row) => mapMessageRow(row, communities, resolveMention));
}

export function listChats(limit = 20): WhatsAppChat[] {
  const db = getDb();
  const communities = getCommunityMap(db);
  const stmt = db.prepare(`
    SELECT
      ZCONTACTJID as id,
      ZPARTNERNAME as name,
      ZUNREADCOUNT as unreadCount,
      ZLASTMESSAGEDATE as lastMessageDate,
      ZSESSIONTYPE as sessionType
    FROM ZWACHATSESSION
    ORDER BY ZLASTMESSAGEDATE DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as {
    id: string;
    name: string | null;
    unreadCount: number | null;
    lastMessageDate: number | null;
    sessionType: number | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isGroup: r.id ? r.id.includes("@g.us") : false,
    isCommunity: r.sessionType === 4,
    community: r.id ? communities.get(r.id) ?? null : null,
    unreadCount: r.unreadCount || 0,
    lastMessageTimestamp: r.lastMessageDate ? coreDataToISO(r.lastMessageDate) : null,
  }));
}

export function getRecentMessages(limit = 20, chatJid?: string, since?: string): WhatsAppMessage[] {
  return queryMessages({
    minDate: getCoreDataThreshold(getMaxHistoryDays()),
    since: since ? isoToCoreData(since) : undefined,
    chatJid,
    limit,
  }).reverse(); // Return in chronological order
}

export function searchMessages(query: string, limit = 30, chatJid?: string, since?: string): WhatsAppMessage[] {
  return queryMessages({
    minDate: getCoreDataThreshold(getMaxHistoryDays()),
    since: since ? isoToCoreData(since) : undefined,
    chatJid,
    search: query,
    limit,
  }).reverse();
}

export function getChatHistory(chatJid: string, limit = 50, since?: string): WhatsAppMessage[] {
  return queryMessages({
    minDate: getCoreDataThreshold(getMaxHistoryDays()),
    since: since ? isoToCoreData(since) : undefined,
    chatJid,
    limit,
  }).reverse(); // chronological
}

export function getDigestData(hours = 24, limitPerChat = 10, chatJid?: string, since?: string): Record<string, DigestChat> {
  const maxDays = getMaxHistoryDays();
  const effectiveDays = Math.min(maxDays, hours / 24);

  const messages = queryMessages({
    minDate: getCoreDataThreshold(effectiveDays),
    since: since ? isoToCoreData(since) : undefined,
    chatJid,
  });

  // Group by chat
  const grouped: Record<string, DigestChat> = {};

  for (const msg of messages) {
    if (!grouped[msg.chatId]) {
      grouped[msg.chatId] = {
        chatName: msg.chatName || msg.chatId,
        isGroup: msg.isGroup,
        messages: [],
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

export interface MediaRecord {
  localPath: string;
  messageType: number;
  chatJid: string | null;
}

export function getMediaRecord(stanzaId: string, chatJid?: string): MediaRecord | null {
  const conditions = [`m.ZSTANZAID = ?`];
  const params: string[] = [stanzaId];
  if (chatJid) {
    conditions.push(`c.ZCONTACTJID = ?`);
    params.push(chatJid);
  }
  const row = getDb()
    .prepare(
      `SELECT mi.ZMEDIALOCALPATH as localPath, m.ZMESSAGETYPE as messageType, c.ZCONTACTJID as chatJid
       FROM ZWAMESSAGE m
       LEFT JOIN ZWACHATSESSION c ON m.ZCHATSESSION = c.Z_PK
       JOIN ZWAMEDIAITEM mi ON mi.Z_PK = m.ZMEDIAITEM
       WHERE ${conditions.join(" AND ")} LIMIT 1`
    )
    .get(...params) as { localPath: string | null; messageType: number | null; chatJid: string | null } | undefined;
  if (!row?.localPath) return null;
  return { localPath: row.localPath, messageType: row.messageType ?? 0, chatJid: row.chatJid };
}

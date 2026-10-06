import Database from "better-sqlite3";

export type CommunityMap = Map<string, string>;

// The community links live in system messages spread across all history. Scanning them is
// expensive, so the result is cached per snapshot (a new snapshot creates a new Database).
const cache = new WeakMap<Database.Database, CommunityMap>();

interface CommunityEvent {
  parent_group_jid?: string;
  parent_group_name?: string;
  linked_groups?: { groupJID?: string }[];
}

function parseCommunityEvent(text: string): CommunityEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  return parsed as CommunityEvent;
}

function buildCommunityMap(db: Database.Database): CommunityMap {
  const events = db.prepare(`
    SELECT m.ZTEXT as text, c.ZCONTACTJID as chatJid
    FROM ZWAMESSAGE m
    LEFT JOIN ZWACHATSESSION c ON m.ZCHATSESSION = c.Z_PK
    WHERE m.ZMESSAGETYPE = 6 AND m.ZTEXT LIKE '%parent_group_jid%'
  `).all() as { text: string; chatJid: string | null }[];

  const chats = db.prepare(
    `SELECT ZCONTACTJID as id, ZPARTNERNAME as name FROM ZWACHATSESSION`
  ).all() as { id: string; name: string | null }[];
  const chatNames = new Map(chats.map((chat) => [chat.id, chat.name]));

  const map: CommunityMap = new Map();
  for (const row of events) {
    const event = parseCommunityEvent(row.text);
    const parentJid =
      event && typeof event.parent_group_jid === "string" ? event.parent_group_jid : null;
    if (!parentJid) continue;

    const name =
      event && typeof event.parent_group_name === "string" && event.parent_group_name.length > 0
        ? event.parent_group_name
        : chatNames.get(parentJid) ?? null;
    if (!name) continue;

    map.set(parentJid, name);
    if (event && Array.isArray(event.linked_groups)) {
      for (const group of event.linked_groups) {
        if (group && typeof group.groupJID === "string" && group.groupJID.length > 0) {
          map.set(group.groupJID, name);
        }
      }
    }
    if (row.chatJid && row.chatJid !== parentJid) {
      map.set(row.chatJid, name);
    }
  }
  return map;
}

export function getCommunityMap(db: Database.Database): CommunityMap {
  const cached = cache.get(db);
  if (cached) return cached;
  const map = buildCommunityMap(db);
  cache.set(db, map);
  return map;
}

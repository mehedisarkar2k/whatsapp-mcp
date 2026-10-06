import Database from "better-sqlite3";
import { MessageKind } from "./types.js";

export type MentionResolver = (digits: string) => string | null;

export interface FormattableMessage {
  text: string | null;
  messageType: number | null;
  mediaTitle: string | null;
}

const MEDIA_PLACEHOLDERS: Record<number, string> = {
  1: "[Image]",
  2: "[Video]",
  3: "[Audio]",
  4: "[Contact]",
  5: "[Location]",
  8: "[Document]",
  11: "[GIF]",
  15: "[Sticker]",
};

export function createMentionResolver(db: Database.Database): MentionResolver {
  const pushName = db.prepare(`SELECT ZPUSHNAME as name FROM ZWAPROFILEPUSHNAME WHERE ZJID = ?`);
  const chatName = db.prepare(`SELECT ZPARTNERNAME as name FROM ZWACHATSESSION WHERE ZCONTACTJID = ?`);

  return (digits: string): string | null => {
    for (const suffix of ["@lid", "@s.whatsapp.net"]) {
      const jid = digits + suffix;
      const push = pushName.get(jid) as { name: string | null } | undefined;
      if (push?.name) return push.name;
      const chat = chatName.get(jid) as { name: string | null } | undefined;
      if (chat?.name) return chat.name;
    }
    return null;
  };
}

function replaceMentions(text: string, resolve: MentionResolver): string {
  return text.replace(/@(\d+)/g, (match, digits: string) => {
    const name = resolve(digits);
    return name ? `@${name}` : match;
  });
}

function formatSystemEvent(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const event = parsed as Record<string, unknown>;

  if (Array.isArray(event.linked_groups)) {
    const subjects = event.linked_groups
      .map((group) =>
        group && typeof group === "object" ? (group as Record<string, unknown>).subject : undefined
      )
      .filter((subject): subject is string => typeof subject === "string" && subject.length > 0);
    return `[Community linked group: ${subjects.join(", ")}]`;
  }
  if (typeof event.updated_description === "string") {
    return `[Group description changed: ${event.updated_description}]`;
  }
  return "[System event]";
}

function mediaPlaceholder(type: number, title: string | null): string | null {
  const placeholder = MEDIA_PLACEHOLDERS[type];
  if (!placeholder) return null;
  if (type === 8 && title) return `[Document: ${title}]`;
  return placeholder;
}

export function formatMessage(
  row: FormattableMessage,
  resolveMention: MentionResolver
): { text: string | null; kind: MessageKind } {
  const messageType = row.messageType ?? 0;
  const rawText = row.text || null;

  if (messageType === 6 && rawText !== null) {
    const event = formatSystemEvent(rawText);
    if (event !== null) return { text: event, kind: "system" };
  }
  if (rawText !== null) {
    return { text: replaceMentions(rawText, resolveMention), kind: "text" };
  }

  const placeholder = mediaPlaceholder(messageType, row.mediaTitle);
  if (placeholder !== null) return { text: placeholder, kind: "media" };
  return { text: null, kind: "text" };
}

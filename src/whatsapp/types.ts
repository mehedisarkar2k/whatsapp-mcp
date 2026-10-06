export interface WhatsAppChat {
  id: string;
  name: string | null;
  isGroup: boolean;
  isCommunity: boolean;
  community: string | null;
  unreadCount: number;
  lastMessageTimestamp: string | null;
}

export type MessageKind = "text" | "media" | "system";

export interface WhatsAppMessage {
  id: string;
  chatId: string;
  chatName: string | null;
  senderId: string | null;
  senderName: string | null;
  text: string | null;
  timestamp: string;
  direction: "inbound" | "outbound" | "unknown";
  isGroup: boolean;
  kind: MessageKind;
  community: string | null;
}

export interface DigestChat {
  chatName: string;
  isGroup: boolean;
  messages: WhatsAppMessage[];
}

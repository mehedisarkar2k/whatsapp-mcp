export interface WhatsAppChat {
  id: string;
  name: string | null;
  isGroup: boolean;
  unreadCount: number;
  lastMessageTimestamp: string | null;
}

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
}

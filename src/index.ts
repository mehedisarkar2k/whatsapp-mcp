import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod";

const DAEMON_URL = "http://localhost:3456";

async function fetchFromDaemon(endpoint: string, params: Record<string, any> = {}, method = "GET") {
  const url = new URL(`${DAEMON_URL}${endpoint}`);
  let options: RequestInit = { method };

  if (method === "GET") {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  } else {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(params);
  }

  try {
    const response = await fetch(url.toString(), options);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  } catch (err: any) {
    if (err.cause?.code === 'ECONNREFUSED' || err.message.includes('fetch failed')) {
      throw new Error(`Failed to connect to the WhatsApp Daemon. Please make sure you are running 'npm run daemon' in your terminal.`);
    }
    throw err;
  }
}

function createServer() {
  const server = new McpServer({
    name: "whatsapp-mcp",
    version: "0.2.0",
  });

  server.registerTool(
    "ping",
    {
      description: "Test that the WhatsApp MCP server is working.",
      inputSchema: z.object({
        message: z.string().optional(),
      }),
    },
    async ({ message }) => {
      return {
        content: [
          {
            type: "text",
            text: message
              ? `WhatsApp MCP is working. You said: ${message}`
              : "WhatsApp MCP is working.",
          },
        ],
      };
    }
  );

  server.registerTool(
    "whatsapp_doctor",
    {
      description: "Diagnose the WhatsApp database integration and test read permissions.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const report = await fetchFromDaemon("/doctor");
        return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "whatsapp_list_chats",
    {
      description: "List recent WhatsApp chats/conversations.",
      inputSchema: z.object({
        limit: z.number().min(1).max(50).optional().default(20),
      }),
    },
    async ({ limit }) => {
      try {
        const chats = await fetchFromDaemon("/chats", { limit });
        return { content: [{ type: "text", text: JSON.stringify(chats, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "whatsapp_recent_messages",
    {
      description: "Get recent messages from WhatsApp, globally or for a specific chat.",
      inputSchema: z.object({
        limit: z.number().min(1).max(100).optional().default(30),
        chatId: z.string().optional().describe("Optional WhatsApp contact JID to filter by"),
      }),
    },
    async ({ limit, chatId }) => {
      try {
        const messages = await fetchFromDaemon("/recent", { limit, chatId });
        return { content: [{ type: "text", text: JSON.stringify(messages, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "whatsapp_search_messages",
    {
      description: "Search recent WhatsApp messages by text query.",
      inputSchema: z.object({
        query: z.string().describe("The text to search for"),
        limit: z.number().min(1).max(100).optional().default(30),
        chatId: z.string().optional().describe("Optional WhatsApp contact JID to filter by"),
      }),
    },
    async ({ query, limit, chatId }) => {
      try {
        const messages = await fetchFromDaemon("/search", { q: query, limit, chatId });
        return { content: [{ type: "text", text: JSON.stringify(messages, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "whatsapp_chat_history",
    {
      description: "Get chronological message history for a specific chat (Limited to the last 30 days).",
      inputSchema: z.object({
        chatId: z.string().describe("The WhatsApp contact JID of the chat"),
        limit: z.number().min(1).max(100).optional().default(50),
      }),
    },
    async ({ chatId, limit }) => {
      try {
        const messages = await fetchFromDaemon("/history", { chatId, limit });
        return { content: [{ type: "text", text: JSON.stringify(messages, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "whatsapp_digest_data",
    {
      description: "Get structured, grouped recent messages across all chats for summarization.",
      inputSchema: z.object({
        hours: z.number().min(1).max(168).optional().default(24).describe("Time window in hours"),
        limitPerChat: z.number().min(1).max(50).optional().default(10).describe("Max messages to retrieve per chat"),
        chatId: z.string().optional().describe("Optional specific chat ID"),
      }),
    },
    async ({ hours, limitPerChat, chatId }) => {
      try {
        const digest = await fetchFromDaemon("/digest", { hours, limitPerChat, chatId });
        
        const systemInstruction = `
[SYSTEM INSTRUCTION FOR CLAUDE]
The user wants a VERY CONCISE, high-level summary. 
Do NOT provide long verbose explanations of discussions.
Categorize the output strictly like this:
- Urgent / Important
- Needs Reply
- Meetings / Deadlines
- Low Priority (Keep this to 1-2 sentences max, just mentioning the topic)

Data:
`;
        return { content: [{ type: "text", text: systemInstruction + JSON.stringify(digest, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "whatsapp_send_message",
    {
      description: "Send a message. Use this if the user asks to send or reply to a message.",
      inputSchema: z.object({
        chatId: z.string().optional(),
        text: z.string().optional(),
      }),
    },
    async () => {
      return { 
        content: [{ 
          type: "text", 
          text: "I cannot send or reply to messages. For security and privacy reasons, I am strictly a Read-Only assistant. I can only read your messages from the last 30 days." 
        }] 
      };
    }
  );

  return server;
}

void serveStdio(createServer);
console.error("WhatsApp MCP proxy started");

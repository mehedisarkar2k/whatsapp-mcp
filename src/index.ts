import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod";
import { DAEMON_HOST, DAEMON_PORT, readToken } from "./whatsapp/security.js";

const DAEMON_URL = `http://${DAEMON_HOST}:${DAEMON_PORT}`;

async function fetchFromDaemon(endpoint: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(`${DAEMON_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, String(value));
    }
  });
  const options: RequestInit = { headers: { Authorization: `Bearer ${readToken()}` } };

  try {
    const response = await fetch(url.toString(), options);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("fetch failed")) {
      throw new Error("Failed to connect to the WhatsApp daemon. Open the WhatsApp MCP menu bar app (or run 'npm run daemon').");
    }
    throw err;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function createServer() {
  const server = new McpServer({
    name: "whatsapp-mcp",
    version: "1.2.2",
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
      } catch (err: unknown) {
        return { content: [{ type: "text", text: `Error: ${errorMessage(err)}` }], isError: true };
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
      } catch (err: unknown) {
        return { content: [{ type: "text", text: `Error: ${errorMessage(err)}` }], isError: true };
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
        since: z.string().optional().describe("Only messages after this ISO time"),
      }),
    },
    async ({ limit, chatId, since }) => {
      try {
        const messages = await fetchFromDaemon("/recent", { limit, chatId, since });
        return { content: [{ type: "text", text: JSON.stringify(messages, null, 2) }] };
      } catch (err: unknown) {
        return { content: [{ type: "text", text: `Error: ${errorMessage(err)}` }], isError: true };
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
        since: z.string().optional().describe("Only messages after this ISO time"),
      }),
    },
    async ({ query, limit, chatId, since }) => {
      try {
        const messages = await fetchFromDaemon("/search", { q: query, limit, chatId, since });
        return { content: [{ type: "text", text: JSON.stringify(messages, null, 2) }] };
      } catch (err: unknown) {
        return { content: [{ type: "text", text: `Error: ${errorMessage(err)}` }], isError: true };
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
        since: z.string().optional().describe("Only messages after this ISO time"),
      }),
    },
    async ({ chatId, limit, since }) => {
      try {
        const messages = await fetchFromDaemon("/history", { chatId, limit, since });
        return { content: [{ type: "text", text: JSON.stringify(messages, null, 2) }] };
      } catch (err: unknown) {
        return { content: [{ type: "text", text: `Error: ${errorMessage(err)}` }], isError: true };
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
        since: z.string().optional().describe("Only messages after this ISO time"),
      }),
    },
    async ({ hours, limitPerChat, chatId, since }) => {
      try {
        const digest = await fetchFromDaemon("/digest", { hours, limitPerChat, chatId, since });
        
        return { content: [{ type: "text", text: JSON.stringify(digest, null, 2) }] };
      } catch (err: unknown) {
        return { content: [{ type: "text", text: `Error: ${errorMessage(err)}` }], isError: true };
      }
    }
  );

  return server;
}

void serveStdio(createServer);
console.error("WhatsApp MCP proxy started");

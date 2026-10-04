import express from "express";
import { checkDatabaseAccess } from "./whatsapp/paths.js";
import { listChats, getRecentMessages, searchMessages, getChatHistory, getDigestData } from "./whatsapp/db.js";

const app = express();
const PORT = 3456;

app.use(express.json());

// Diagnostics
app.get("/doctor", (req, res) => {
  try {
    const access = checkDatabaseAccess();
    res.json(access);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List Chats
app.get("/chats", (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const chats = listChats(limit);
    res.json(chats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Recent Messages
app.get("/recent", (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
    const chatId = req.query.chatId as string | undefined;
    const messages = getRecentMessages(limit, chatId);
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Search Messages
app.get("/search", (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
       res.status(400).json({ error: "Missing query parameter 'q'" });
       return;
    }
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
    const chatId = req.query.chatId as string | undefined;
    const messages = searchMessages(query, limit, chatId);
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Chat History
app.get("/history", (req, res) => {
  try {
    const chatId = req.query.chatId as string;
    if (!chatId) {
      res.status(400).json({ error: "Missing query parameter 'chatId'" });
      return;
    }
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const messages = getChatHistory(chatId, limit);
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Digest Data
app.get("/digest", (req, res) => {
  try {
    const hours = req.query.hours ? parseInt(req.query.hours as string, 10) : 24;
    const limitPerChat = req.query.limitPerChat ? parseInt(req.query.limitPerChat as string, 10) : 10;
    const chatId = req.query.chatId as string | undefined;
    const digest = getDigestData(hours, limitPerChat, chatId);
    res.json(digest);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`WhatsApp Daemon is running on http://localhost:${PORT}`);
  console.log(`Keep this terminal open! Claude will fetch data from this server.`);
});

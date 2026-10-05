import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { menubar } from 'menubar';
import path from 'path';

console.log("HELLO FROM MAIN.TS!");

// Start the daemon internally
import './daemon';

const mb = menubar({
  index: `file://${path.join(__dirname, '../public/index.html')}`,
  browserWindow: {
    width: 320,
    height: 520,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  },
});

ipcMain.on('quit-app', () => {
  app.quit();
});

mb.on('ready', () => {
  console.log('WhatsApp MCP Mac App is ready.');
});

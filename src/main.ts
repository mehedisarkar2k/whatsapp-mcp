import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { menubar } from 'menubar';
import path from 'path';

// Start the daemon internally
import './daemon';

const mb = menubar({
  index: `file://${path.join(__dirname, '../../public/index.html')}`,
  icon: path.join(__dirname, '../../public/icon.png'),
  browserWindow: {
    width: 320,
    height: 450,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  },
});

mb.on('ready', () => {
  console.log('WhatsApp MCP Mac App is ready.');
});

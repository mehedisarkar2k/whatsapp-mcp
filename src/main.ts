import { app, clipboard, ipcMain, Menu } from "electron";
import { menubar } from "menubar";
import path from "path";

// Importing the daemon also starts it.
import { getAccessEnabled, resetToken, setAccessEnabled } from "./daemon";
import { closeDbAndDeleteSnapshot } from "./whatsapp/db";
import { checkDatabaseAccess } from "./whatsapp/paths";

interface AppState {
  accessEnabled: boolean;
  version: string;
  databaseReadable: boolean;
  databaseError?: string;
}

function getState(): AppState {
  const access = checkDatabaseAccess();
  return {
    accessEnabled: getAccessEnabled(),
    version: app.getVersion(),
    databaseReadable: access.readable,
    databaseError: access.error,
  };
}

// A second launch (e.g. opening the app from Applications again) would fail to bind the port,
// so it hands over to the running instance, which shows its popup.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const mb = menubar({
  preloadWindow: true,
  index: `file://${path.join(__dirname, "../public/index.html")}`,
  icon: path.join(__dirname, "../public/trayTemplate.png"),
  browserWindow: {
    width: 320,
    height: 370,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  },
});

ipcMain.handle("get-state", () => getState());

ipcMain.handle("set-access", (_event, enabled: unknown) => {
  if (typeof enabled !== "boolean") {
    throw new Error("set-access expects a boolean");
  }
  setAccessEnabled(enabled);
  return getState();
});

ipcMain.handle("reset-token", () => {
  resetToken();
});

ipcMain.handle("copy-config", () => {
  const config = {
    mcpServers: {
      "whatsapp-mcp": {
        command: path.join(path.dirname(process.execPath), "whatsapp-mcp"),
        args: [path.join(app.getAppPath(), "dist/index.js")],
        env: {
          ELECTRON_RUN_AS_NODE: "1",
          ELECTRON_NO_ATTACH_CONSOLE: "1",
        },
      },
    },
  };
  clipboard.writeText(JSON.stringify(config, null, 2));
});

ipcMain.handle("quit", () => {
  app.quit();
});

app.on("before-quit", () => {
  closeDbAndDeleteSnapshot();
});

function showPopup(): void {
  mb.showWindow().catch((err: unknown) => console.error("Could not show the popup:", err));
}

function showContextMenu(): void {
  const menu = Menu.buildFromTemplate([
    { label: "Open WhatsApp MCP", click: showPopup },
    {
      label: "WhatsApp access",
      type: "checkbox",
      checked: getAccessEnabled(),
      click: (item) => setAccessEnabled(item.checked),
    },
    { type: "separator" },
    { label: "Quit WhatsApp MCP", click: () => app.quit() },
  ]);
  mb.tray.popUpContextMenu(menu);
}

app.on("second-instance", showPopup);

mb.on("ready", () => {
  mb.tray.on("right-click", showContextMenu);
  showPopup();
});

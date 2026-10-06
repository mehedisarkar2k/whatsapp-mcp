import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("whatsappMcp", {
  getState: () => ipcRenderer.invoke("get-state"),
  setAccess: (enabled: boolean) => ipcRenderer.invoke("set-access", enabled),
  copyConfig: () => ipcRenderer.invoke("copy-config"),
  quit: () => ipcRenderer.invoke("quit"),
});

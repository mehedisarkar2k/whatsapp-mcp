const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  console.log("ELECTRON APP READY!");
  const win = new BrowserWindow({ width: 400, height: 400 });
  win.loadURL('about:blank');
});

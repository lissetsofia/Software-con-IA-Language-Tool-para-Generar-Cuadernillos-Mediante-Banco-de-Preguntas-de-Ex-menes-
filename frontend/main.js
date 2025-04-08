const { app, BrowserWindow } = require("electron");
const path = require("path");
// 🔧 SOLUCIÓN: Desactiva aceleración por hardware
app.disableHardwareAcceleration();
function crearVentana() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, // ✅ importante
      enableRemoteModule: false,
      nodeIntegration: false,
    },
  });

  win.loadFile("index.html");
}

app.whenReady().then(crearVentana);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

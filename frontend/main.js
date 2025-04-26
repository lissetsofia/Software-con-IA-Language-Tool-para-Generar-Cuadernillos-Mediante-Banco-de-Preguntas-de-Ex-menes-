const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

// 🔧 Desactiva aceleración por hardware
app.disableHardwareAcceleration();

let win;

function crearVentana() {
  win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(crearVentana);

// ✅ Ahora cuando el login es exitoso, maximiza la ventana
ipcMain.on("login-exitoso", () => {
  if (win && !win.isDestroyed()) {
    win.maximize(); // 🔥 Maximizar la ventana
    win.webContents.send("login-exitoso"); // (opcional) Seguir enviando mensaje si quieres
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

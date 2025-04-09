//const { app, BrowserWindow } = require("electron");
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

// 🔧 Desactiva aceleración por hardware
app.disableHardwareAcceleration();

let win;
let homeWin;

function crearVentana() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
    },
  });

  win.loadFile("index.html");
}

function crearVentanaHome() {
  homeWin = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
    },
  });
  console.log("Mostrando home...");
  homeWin.loadFile("home.html").then(() => {
    if (win && !win.isDestroyed()) {
      win.close(); // Cierra login solo después de abrir home
    }
  });

  /*homeWin.loadFile("home.html");

  if (win && !win.isDestroyed()) {
    win.close(); // Cierra la ventana de login si existe
  }*/
}

app.whenReady().then(crearVentana);

ipcMain.on("login-exitoso", () => {
  crearVentanaHome();
});

app.on("window-all-closed", () => {
  // Solo salir si NO estamos en macOS
  if (process.platform !== "darwin") {
    app.quit();
  }
});

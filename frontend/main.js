const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");

const fetch = require("node-fetch"); // si no existe en tu proyecto, instálalo
// 👇 usa fs de promesas
const fs = require("fs/promises");

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

ipcMain.handle("exportar-examen", async (_event, { idexamen, formato }) => {
  try {
    const ext = formato === "pdf" ? "pdf" : "docx";

    // 👇 1) Pedimos el nombre original al backend
    const nres = await fetch(`http://127.0.0.1:5050/api/examen_nombre/${idexamen}`);
    let defaultName = `examen_${idexamen}.${ext}`;
    if (nres.ok) {
      const { archivo_nombre } = await nres.json();
      if (archivo_nombre) {
        const base = archivo_nombre.replace(/\.docx$/i, "");
        defaultName = `${base}.${ext}`; // mismo nombre que el DOCX, cambiando extensión
      }
    }

    // 👇 2) Sugerimos ese nombre en el diálogo
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Guardar examen",
      defaultPath: defaultName,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });

    if (canceled || !filePath) return { ok: false, canceled: true };

    // 3) Descargamos y guardamos
    const url = `http://127.0.0.1:5050/api/exportar_examen/${idexamen}?formato=${formato}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Backend respondió ${res.status}: ${text}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    return { ok: true, path: filePath };
  } catch (err) {
    console.error("Error exportando:", err);
    return { ok: false, message: String(err) };
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

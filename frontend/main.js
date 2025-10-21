const { app, BrowserWindow, ipcMain, dialog, shell, session } = require("electron");
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

function forceIPv4(u) {
  try {
    const url = new URL(u);
    if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
    return url.toString();
  } catch {
    return u.replace('http://localhost:', 'http://127.0.0.1:');
  }
}

async function fetchWithRendererCookies(rawUrl) {
  const url = forceIPv4(rawUrl);
  // toma cookies de la sesión por defecto (donde está tu renderer)
  const cookies = await session.defaultSession.cookies.get({ url: 'http://127.0.0.1:5050' });
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const headers = cookieHeader ? { Cookie: cookieHeader } : {};
  return fetch(url, { headers });
}

ipcMain.handle('save-from-url', async (_ev, { url, suggestedName }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Guardar como…',
      defaultPath: suggestedName || 'archivo',
      filters: [
        { name: 'Documentos', extensions: ['docx', 'pdf'] },
        { name: 'Todos', extensions: ['*'] },
      ],
    });
    if (canceled || !filePath) return { canceled: true };

    // 👇 ahora con cookies del renderer
    const res = await fetchWithRendererCookies(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} al descargar ${url}\n${text.slice(0,200)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(filePath, buf);

    shell.showItemInFolder(filePath); // opcional
    return { ok: true, path: filePath };
  } catch (err) {
    console.error('save-from-url error:', err);
    // opcional para ver el error en la UI del usuario:
    dialog.showErrorBox('No se pudo guardar', String(err));
    return { ok: false, message: String(err) };
  }
});
ipcMain.handle("save-last-from-folder", async (_ev, { sourceDir, pattern, suggestedName }) => {
  try {
    const rx = new RegExp(pattern, "i");
    const items = await fs.readdir(sourceDir, { withFileTypes: true });

    // filtra por regex y toma el más reciente por mtime
    const candidates = [];
    for (const it of items) {
      if (!it.isFile()) continue;
      if (!rx.test(it.name)) continue;
      const full = path.join(sourceDir, it.name);
      const st = await fs.stat(full);
      candidates.push({ full, name: it.name, mtime: st.mtimeMs });
    }
    if (!candidates.length) return { ok: false, message: "No hay archivos que coincidan en la carpeta." };

    candidates.sort((a, b) => b.mtime - a.mtime);
    const latest = candidates[0];

    // diálogo "Guardar como…"
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Guardar como…",
      defaultPath: suggestedName || latest.name,
      filters: [
        { name: "Documentos", extensions: ["docx", "pdf"] },
        { name: "Todos", extensions: ["*"] },
      ],
    });
    if (canceled || !filePath) return { canceled: true };

    // copiar
    await fs.copyFile(latest.full, filePath);
    shell.showItemInFolder(filePath);
    return { ok: true, path: filePath, from: latest.full };
  } catch (err) {
    console.error("save-last-from-folder error:", err);
    return { ok: false, message: String(err) };
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

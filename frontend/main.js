const { app, BrowserWindow, ipcMain, dialog, shell, session, Menu } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fetch = require("node-fetch");
const fs = require("fs/promises");
const fsSync = require("fs");
const net = require("net");

app.disableHardwareAcceleration();

let win;
let backendProcess = null;

const isDev = !app.isPackaged;
const BACKEND_PORT = 5050;
/*
if (isDev) {
  try {
    // watchRenderer vigila todo el cwd (raíz del repo con package.json). Sin ignorar
    // backend/temas_archivos, cada .docx creado al partir exámenes recarga la ventana
    // y aborta el fetch largo de partir_y_guardar.
    const ignoreBackendGenerated = (filePath) => {
      const norm = path.normalize(filePath).replace(/\\/g, "/");
      if (/(^|\/)backend\/(temas_archivos|uploads|data|descargas)(\/|$)/i.test(norm))
        return true;
      if (/(^|\/)descargas(\/|$)/i.test(norm)) return true;
      if (/(^|\/)static\/previews(\/|$)/i.test(norm)) return true;
      return false;
    };
    require("electron-reloader")(module, {
      watchRenderer: true,
      ignore: [ignoreBackendGenerated],
    });
  } catch (_) {}
}
*/
function logMain(...args) {
  console.log("[MAIN]", ...args);
}

function logMainError(...args) {
  console.error("[MAIN][ERROR]", ...args);
}

function getBackendEntry() {
  if (isDev) {
    const appPy = path.join(__dirname, "..", "backend", "app.py");
    const cwd = path.join(__dirname, "..", "backend");

    return {
      mode: "dev",
      command: "python",
      args: [appPy],
      cwd,
      expectedPath: appPy,
    };
  }

  const exePath = path.join(
    process.resourcesPath,
    "backend",
    "evalunia_backend.exe"
  );

  return {
    mode: "packaged",
    command: exePath,
    args: [],
    cwd: path.dirname(exePath),
    expectedPath: exePath,
  };
}

function isPortBusy(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(700);

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.once("error", () => {
      resolve(false);
    });

    socket.connect(port, host);
  });
}

async function waitForBackend(url, timeoutMs = 20000) {
  const start = Date.now();
  let lastError = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: true, data };
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  return { ok: false, error: lastError };
}

async function startBackend() {
  try {
    const backend = getBackendEntry();

    logMain("isDev =", isDev);
    logMain("app.isPackaged =", app.isPackaged);
    logMain("process.resourcesPath =", process.resourcesPath);
    logMain("backend.mode =", backend.mode);
    logMain("backend.command =", backend.command);
    logMain("backend.args =", backend.args);
    logMain("backend.cwd =", backend.cwd);
    logMain("backend.expectedPath =", backend.expectedPath);

    if (backend.mode === "packaged") {
      const exists = fsSync.existsSync(backend.expectedPath);
      logMain("backend exe exists =", exists);
      if (!exists) {
        throw new Error(`No existe backend exe: ${backend.expectedPath}`);
      }
    } else {
      const exists = fsSync.existsSync(backend.expectedPath);
      logMain("backend app.py exists =", exists);
      if (!exists) {
        throw new Error(`No existe app.py: ${backend.expectedPath}`);
      }
    }

    const busyBefore = await isPortBusy(BACKEND_PORT);
    logMain(`puerto ${BACKEND_PORT} ocupado antes de arrancar =`, busyBefore);

    backendProcess = spawn(backend.command, backend.args, {
      cwd: backend.cwd,
      windowsHide: true,
      shell: false,
    });

    logMain("spawn pid =", backendProcess.pid);

    backendProcess.stdout?.on("data", (data) => {
      console.log("[BACKEND][STDOUT]", data.toString().trim());
    });

    backendProcess.stderr?.on("data", (data) => {
      console.error("[BACKEND][STDERR]", data.toString().trim());
    });

    backendProcess.on("error", (err) => {
      logMainError("falló spawn backend:", err);
    });

    backendProcess.on("close", (code, signal) => {
      logMain(`backend cerrado. code=${code} signal=${signal}`);
      backendProcess = null;
    });

    const probe = await waitForBackend("http://127.0.0.1:5050/probar-conexion", 20000);

    if (probe.ok) {
      logMain("backend listo /probar-conexion =", probe.data);
    } else {
      logMainError("backend NO respondió /probar-conexion", probe.error);
    }

    const busyAfter = await isPortBusy(BACKEND_PORT);
    logMain(`puerto ${BACKEND_PORT} ocupado después de arrancar =`, busyAfter);
  } catch (err) {
    logMainError("No se pudo iniciar backend:", err);
  }
}

function stopBackend() {
  try {
    if (backendProcess && !backendProcess.killed) {
      logMain("cerrando backend pid =", backendProcess.pid);
      backendProcess.kill();
    }
  } catch (err) {
    logMainError("Error cerrando backend:", err);
  }
}

function crearVentana() {
  win = new BrowserWindow({
    width: 1000,
    height: 700,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "img", "logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
    },
  });
  win.once("ready-to-show", () => {
  win.show();

  if (isDev) {
    win.webContents.openDevTools({ mode: "detach" });
  }
});

  // App desktop: ocultamos menu nativo y abrimos maximizada por defecto.
  win.setMenuBarVisibility(false);
  win.maximize();
  logMain("cargando index.html =", path.join(__dirname, "index.html"));
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await startBackend();
  crearVentana();
});

ipcMain.on("login-exitoso", (_event, token) => {
  if (win && !win.isDestroyed()) {
    win.maximize();
    win.webContents.send("login-exitoso", token);
  }
});

function forceIPv4(u) {
  try {
    const url = new URL(u);
    if (url.hostname === "localhost") url.hostname = "127.0.0.1";
    return url.toString();
  } catch {
    return u.replace("http://localhost:", "http://127.0.0.1:");
  }
}

function sanitizeFilename(name) {
  return String(name || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
}

async function fetchWithRendererCookies(rawUrl) {
  const url = forceIPv4(rawUrl);
  const cookies = await session.defaultSession.cookies.get({ url: "http://127.0.0.1:5050" });
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const headers = cookieHeader ? { Cookie: cookieHeader } : {};
  return fetch(url, { headers });
}

ipcMain.handle("exportar-examen", async (_event, { idexamen, formato }) => {
  try {
    const ext = formato === "pdf" ? "pdf" : "docx";

    const nres = await fetch(`http://127.0.0.1:5050/api/examen_nombre/${idexamen}`);
    let defaultName = `examen_${idexamen}.${ext}`;

    if (nres.ok) {
      const { archivo_nombre } = await nres.json();
      if (archivo_nombre) {
        const base = archivo_nombre.replace(/\.docx$/i, "");
        defaultName = `${base}.${ext}`;
      }
    }

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Guardar examen",
      defaultPath: defaultName,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });

    if (canceled || !filePath) return { ok: false, canceled: true };

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

ipcMain.handle("save-from-url", async (_ev, { url, suggestedName }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Guardar como…",
      defaultPath: suggestedName || "archivo",
      filters: [
        { name: "Documentos", extensions: ["docx", "pdf"] },
        { name: "Todos", extensions: ["*"] },
      ],
    });

    if (canceled || !filePath) return { canceled: true };

    const res = await fetchWithRendererCookies(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} al descargar ${url}\n${text.slice(0, 200)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(filePath, buf);
    shell.showItemInFolder(filePath);

    return { ok: true, path: filePath };
  } catch (err) {
    console.error("save-from-url error:", err);
    dialog.showErrorBox("No se pudo guardar", String(err));
    return { ok: false, message: String(err) };
  }
});

ipcMain.handle("save-last-from-folder", async (_ev, { sourceDir, pattern, suggestedName }) => {
  try {
    const rx = new RegExp(pattern, "i");
    const items = await fs.readdir(sourceDir, { withFileTypes: true });

    const candidates = [];
    for (const it of items) {
      if (!it.isFile()) continue;
      if (!rx.test(it.name)) continue;
      const full = path.join(sourceDir, it.name);
      const st = await fs.stat(full);
      candidates.push({ full, name: it.name, mtime: st.mtimeMs });
    }

    if (!candidates.length) {
      return { ok: false, message: "No hay archivos que coincidan en la carpeta." };
    }

    candidates.sort((a, b) => b.mtime - a.mtime);
    const latest = candidates[0];

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Guardar como…",
      defaultPath: suggestedName || latest.name,
      filters: [
        { name: "Documentos", extensions: ["docx", "pdf"] },
        { name: "Todos", extensions: ["*"] },
      ],
    });

    if (canceled || !filePath) return { canceled: true };

    await fs.copyFile(latest.full, filePath);
    shell.showItemInFolder(filePath);

    return { ok: true, path: filePath, from: latest.full };
  } catch (err) {
    console.error("save-last-from-folder error:", err);
    return { ok: false, message: String(err) };
  }
});

ipcMain.handle("open-pdf-from-url", async (_event, rawUrl) => {
  try {
    const url = forceIPv4(rawUrl);
    const res = await fetchWithRendererCookies(url);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} al abrir PDF\n${txt.slice(0, 200)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());

    const tmpDir = path.join(app.getPath("temp"), "evalunia_print");
    await fs.mkdir(tmpDir, { recursive: true });

    const pdfPath = path.join(tmpDir, `CLAVES_RESPUESTA_${Date.now()}.pdf`);
    await fs.writeFile(pdfPath, buf);

    const opened = await shell.openPath(pdfPath);
    if (opened) throw new Error(opened);

    return { ok: true, path: pdfPath };
  } catch (err) {
    console.error("open-pdf-from-url error:", err);
    return { ok: false, message: String(err) };
  }
});

ipcMain.handle("open-docx-from-url", async (_event, payload) => {
  try {
    const rawUrl = typeof payload === "string" ? payload : payload?.url;
    const suggestedName = typeof payload === "object" ? payload?.suggestedName : null;
    if (!rawUrl) {
      throw new Error("URL de DOCX inválida.");
    }
    const url = forceIPv4(rawUrl);
    const res = await fetchWithRendererCookies(url);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} al abrir DOCX\n${txt.slice(0, 200)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const tmpDir = path.join(app.getPath("temp"), "evalunia_print");
    await fs.mkdir(tmpDir, { recursive: true });

    const baseNameRaw = String(suggestedName || "").trim() || `EXAMEN_${Date.now()}.docx`;
    const baseName = sanitizeFilename(baseNameRaw.toLowerCase().endsWith(".docx") ? baseNameRaw : `${baseNameRaw}.docx`);
    const finalName = baseName || `EXAMEN_${Date.now()}.docx`;
    const docxPath = path.join(tmpDir, finalName);
    await fs.writeFile(docxPath, buf);

    const opened = await shell.openPath(docxPath);
    if (opened) throw new Error(opened);

    return { ok: true, path: docxPath };
  } catch (err) {
    console.error("open-docx-from-url error:", err);
    return { ok: false, message: String(err) };
  }
});

app.on("before-quit", () => {
  stopBackend();
});

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
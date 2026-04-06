const { contextBridge, ipcRenderer } = require("electron");

const API_BASE = "http://127.0.0.1:5050";

contextBridge.exposeInMainWorld("api", {
  login: async (usuario, clave) => {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, clave }),
    });
    const data = await res.json();
    if (data.status === "ok") ipcRenderer.send("login-exitoso", data.token);
    return data;
  },

  checkSession: async (token) => {
    if (!token) return { ok: false };
    try {
      const res = await fetch(`${API_BASE}/api/session`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { ok: false };
      const data = await res.json();
      return { ok: true, usuario: data.usuario };
    } catch {
      return { ok: false };
    }
  },

  logoutRemote: async (token) => {
    try {
      await fetch(`${API_BASE}/logout`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (_) {}
  },

  onLoginExitoso: (callback) =>
    ipcRenderer.on("login-exitoso", (_event, token) => callback(token)),

  // Llama a un handler en el proceso main
  exportarExamen: (idexamen, formato) =>
    ipcRenderer.invoke("exportar-examen", { idexamen, formato }),

  guardarDesdeUrl: (url, suggestedName) => ipcRenderer.invoke("save-from-url", { url, suggestedName }),
  saveLastFromFolder: (opts) => ipcRenderer.invoke("save-last-from-folder", opts),
  
   openPdfFromUrl: (url) =>
    ipcRenderer.invoke("open-pdf-from-url", url),

  openDocxFromUrl: (url, suggestedName) =>
    ipcRenderer.invoke("open-docx-from-url", { url, suggestedName }),


});


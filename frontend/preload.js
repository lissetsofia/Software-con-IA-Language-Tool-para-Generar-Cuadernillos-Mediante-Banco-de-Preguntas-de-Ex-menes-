const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  login: async (usuario, clave) => {
    const res = await fetch("http://localhost:5050/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, clave }),
    });
    const data = await res.json();
    if (data.status === "ok") ipcRenderer.send("login-exitoso");
    return data;
  },

  onLoginExitoso: (callback) => ipcRenderer.on("login-exitoso", callback),

  // Llama a un handler en el proceso main
  exportarExamen: (idexamen, formato) =>
    ipcRenderer.invoke("exportar-examen", { idexamen, formato }),
});

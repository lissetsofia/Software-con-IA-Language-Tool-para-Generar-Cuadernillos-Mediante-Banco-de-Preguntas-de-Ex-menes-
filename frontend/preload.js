const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('api', {
  login: async (usuario, clave) => {
    const res = await fetch('http://localhost:5050/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, clave })
    })
    return res.json()
  }
})

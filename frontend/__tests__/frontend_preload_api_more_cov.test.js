function loadPreload(fetchImpl) {
  jest.resetModules();

  let exposed = null;
  const ipcRenderer = {
    send: jest.fn(),
    on: jest.fn(),
    invoke: jest.fn((channel, payload) => Promise.resolve({ channel, payload }))
  };
  const contextBridge = {
    exposeInMainWorld: jest.fn((name, api) => {
      exposed = { name, api };
    })
  };

  jest.doMock('electron', () => ({ contextBridge, ipcRenderer }), { virtual: true });

  global.fetch = fetchImpl || jest.fn(() => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ status: 'ok', token: 'tok-demo', usuario: 'admin' })
  }));

  require('../preload.js');

  expect(exposed).toBeTruthy();
  expect(exposed.name).toBe('api');
  return { api: exposed.api, ipcRenderer, contextBridge };
}

describe('preload.js API expuesta a Electron', () => {
  test('login envía credenciales y notifica login-exitoso cuando recibe token', async () => {
    const fetchMock = jest.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 'ok', token: 'abc123' })
    }));
    const { api, ipcRenderer } = loadPreload(fetchMock);

    await expect(api.login('admin', 'clave')).resolves.toEqual({ status: 'ok', token: 'abc123' });

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:5050/login', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'admin', clave: 'clave' })
    }));
    expect(ipcRenderer.send).toHaveBeenCalledWith('login-exitoso', 'abc123');
  });

  test('login no notifica cuando el backend responde error', async () => {
    const fetchMock = jest.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 'error', mensaje: 'Credenciales inválidas' })
    }));
    const { api, ipcRenderer } = loadPreload(fetchMock);

    await expect(api.login('x', 'y')).resolves.toMatchObject({ status: 'error' });
    expect(ipcRenderer.send).not.toHaveBeenCalled();
  });

  test('checkSession cubre token faltante, inválido, transitorio, válido y error de red', async () => {
    let fetchMock = jest.fn();
    let loaded = loadPreload(fetchMock);
    await expect(loaded.api.checkSession('')).resolves.toEqual({ ok: false, reason: 'missing-token' });

    fetchMock = jest.fn(() => Promise.resolve({ status: 401, ok: false }));
    loaded = loadPreload(fetchMock);
    await expect(loaded.api.checkSession('bad')).resolves.toEqual({ ok: false, reason: 'invalid-token' });

    fetchMock = jest.fn(() => Promise.resolve({ status: 503, ok: false }));
    loaded = loadPreload(fetchMock);
    await expect(loaded.api.checkSession('tok')).resolves.toEqual({ ok: true, transient: true });

    fetchMock = jest.fn(() => Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ usuario: { id: 1, usuario: 'admin' } })
    }));
    loaded = loadPreload(fetchMock);
    await expect(loaded.api.checkSession('tok')).resolves.toEqual({ ok: true, usuario: { id: 1, usuario: 'admin' } });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:5050/api/session', {
      headers: { Authorization: 'Bearer tok' }
    });

    fetchMock = jest.fn(() => Promise.reject(new Error('sin backend')));
    loaded = loadPreload(fetchMock);
    await expect(loaded.api.checkSession('tok')).resolves.toMatchObject({ ok: true, transient: true });
  });

  test('logoutRemote envía token cuando existe y tolera errores', async () => {
    const fetchMock = jest.fn(() => Promise.resolve({ ok: true }));
    const { api } = loadPreload(fetchMock);

    await expect(api.logoutRemote('tok')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:5050/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok' }
    });

    const loadedError = loadPreload(jest.fn(() => Promise.reject(new Error('red'))));
    await expect(loadedError.api.logoutRemote(null)).resolves.toBeUndefined();
  });

  test('wrappers IPC invocan canales correctos y onLoginExitoso registra callback', async () => {
    const { api, ipcRenderer } = loadPreload();

    let savedListener = null;
    ipcRenderer.on.mockImplementation((channel, cb) => {
      savedListener = cb;
      return undefined;
    });

    const cb = jest.fn();
    api.onLoginExitoso(cb);
    expect(ipcRenderer.on).toHaveBeenCalledWith('login-exitoso', expect.any(Function));
    savedListener({}, 'token-ipc');
    expect(cb).toHaveBeenCalledWith('token-ipc');

    await expect(api.exportarExamen(4, 'pdf')).resolves.toMatchObject({ channel: 'exportar-examen' });
    await expect(api.guardarDesdeUrl('/api/x', 'x.docx')).resolves.toMatchObject({ channel: 'save-from-url' });
    await expect(api.saveLastFromFolder({ sourceDir: 'tmp' })).resolves.toMatchObject({ channel: 'save-last-from-folder' });
    await expect(api.openPdfFromUrl('/p.pdf')).resolves.toMatchObject({ channel: 'open-pdf-from-url' });
    await expect(api.printPdfFile('a.pdf')).resolves.toMatchObject({ channel: 'print-pdf-file' });
    await expect(api.openDocxFromUrl('/a.docx', 'a.docx')).resolves.toMatchObject({ channel: 'open-docx-from-url' });

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('exportar-examen', { idexamen: 4, formato: 'pdf' });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('open-docx-from-url', { url: '/a.docx', suggestedName: 'a.docx' });
  });
});

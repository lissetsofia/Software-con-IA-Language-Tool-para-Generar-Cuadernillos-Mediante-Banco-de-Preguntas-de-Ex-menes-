const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

function jsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    json: jest.fn(() => Promise.resolve(data)),
    text: jest.fn(() => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data))),
    arrayBuffer: jest.fn(() => Promise.resolve(Buffer.from('archivo-demo')))
  };
}

function loadMain() {
  jest.resetModules();

  const handlers = {};
  const listeners = {};
  const app = {
    isPackaged: false,
    disableHardwareAcceleration: jest.fn(),
    whenReady: jest.fn(() => new Promise(() => {})),
    on: jest.fn((name, cb) => { listeners[name] = cb; }),
    quit: jest.fn(),
    getPath: jest.fn(() => fs.mkdtempSync(path.join(os.tmpdir(), 'evalunia-main-')))
  };

  const dialog = {
    showSaveDialog: jest.fn(),
    showErrorBox: jest.fn()
  };
  const shell = {
    showItemInFolder: jest.fn(),
    openPath: jest.fn(() => Promise.resolve(''))
  };
  const session = {
    defaultSession: {
      cookies: {
        get: jest.fn(() => Promise.resolve([{ name: 'sid', value: 'cookie1' }]))
      }
    }
  };
  const Menu = { setApplicationMenu: jest.fn() };
  const ipcMain = {
    handle: jest.fn((name, cb) => { handlers[name] = cb; }),
    on: jest.fn((name, cb) => { listeners[name] = cb; })
  };

  const windows = [];
  class BrowserWindow {
    constructor(opts) {
      this.opts = opts;
      this.closed = false;
      this.webContents = {
        session: {
          on: jest.fn(),
          removeListener: jest.fn()
        },
        on: jest.fn(),
        send: jest.fn(),
        print: jest.fn((_opts, cb) => cb(true)),
        setWindowOpenHandler: jest.fn(),
        openDevTools: jest.fn()
      };
      windows.push(this);
    }
    once() {}
    show() {}
    focus() {}
    maximize() {}
    setMenuBarVisibility() {}
    removeMenu() {}
    isDestroyed() { return this.closed; }
    close() { this.closed = true; }
    loadFile() { return Promise.resolve(); }
    loadURL() { return Promise.resolve(); }
  }

  jest.doMock('electron', () => ({
    app,
    BrowserWindow,
    ipcMain,
    dialog,
    shell,
    session,
    Menu
  }), { virtual: true });

  const fetchMock = jest.fn();
  jest.doMock('node-fetch', () => fetchMock, { virtual: true });

  require('../main.js');

  return { handlers, listeners, app, dialog, shell, session, ipcMain, fetchMock, windows };
}

describe('main.js handlers IPC de Electron', () => {
  test('exportar-examen cubre cancelación, éxito y error del backend', async () => {
    const ctx = loadMain();
    const out = path.join(os.tmpdir(), `export-${Date.now()}.pdf`);

    ctx.fetchMock.mockResolvedValueOnce(jsonResponse({ archivo_nombre: 'cancelado.docx' }));
    ctx.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true });
    await expect(ctx.handlers['exportar-examen']({}, { idexamen: 1, formato: 'pdf' }))
      .resolves.toEqual({ ok: false, canceled: true });

    ctx.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: out });
    ctx.fetchMock
      .mockResolvedValueOnce(jsonResponse({ archivo_nombre: 'admision 2025.docx' }))
      .mockResolvedValueOnce(jsonResponse('PDFDATA'));

    await expect(ctx.handlers['exportar-examen']({}, { idexamen: 8, formato: 'pdf' }))
      .resolves.toMatchObject({ ok: true, path: out });
    expect(fs.existsSync(out)).toBe(true);
    expect(ctx.dialog.showSaveDialog).toHaveBeenLastCalledWith(expect.objectContaining({
      defaultPath: 'admision 2025.pdf'
    }));

    ctx.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: out });
    ctx.fetchMock
      .mockResolvedValueOnce(jsonResponse({}, false, 404))
      .mockResolvedValueOnce(jsonResponse('error', false, 500));

    await expect(ctx.handlers['exportar-examen']({}, { idexamen: 99, formato: 'word' }))
      .resolves.toMatchObject({ ok: false });
  });

  test('save-from-url descarga con cookies, guarda archivo y maneja cancelación/error', async () => {
    const ctx = loadMain();
    const out = path.join(os.tmpdir(), `save-${Date.now()}.docx`);

    ctx.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true });
    await expect(ctx.handlers['save-from-url']({}, { url: 'http://localhost:5050/api/a', suggestedName: 'a.docx' }))
      .resolves.toEqual({ canceled: true });

    ctx.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: out });
    ctx.fetchMock.mockResolvedValueOnce(jsonResponse('DOCX'));
    await expect(ctx.handlers['save-from-url']({}, { url: 'http://localhost:5050/api/a', suggestedName: 'a.docx' }))
      .resolves.toMatchObject({ ok: true, path: out });
    expect(ctx.fetchMock).toHaveBeenLastCalledWith('http://127.0.0.1:5050/api/a', {
      headers: { Cookie: 'sid=cookie1' }
    });
    expect(ctx.shell.showItemInFolder).toHaveBeenCalledWith(out);

    ctx.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: out });
    ctx.fetchMock.mockResolvedValueOnce(jsonResponse('No encontrado', false, 404));
    await expect(ctx.handlers['save-from-url']({}, { url: 'mal-url', suggestedName: 'b.docx' }))
      .resolves.toMatchObject({ ok: false });
    expect(ctx.dialog.showErrorBox).toHaveBeenCalled();
  });

  test('save-last-from-folder elige el archivo más reciente y reporta cuando no hay coincidencias', async () => {
    const ctx = loadMain();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalunia-folder-'));
    const oldFile = path.join(dir, 'antiguo.pdf');
    const newFile = path.join(dir, 'nuevo.pdf');
    fs.writeFileSync(oldFile, 'old');
    fs.writeFileSync(newFile, 'new');

    await expect(ctx.handlers['save-last-from-folder']({}, {
      sourceDir: dir,
      pattern: 'docx$',
      suggestedName: 'salida.docx'
    })).resolves.toMatchObject({ ok: false });

    const out = path.join(os.tmpdir(), `ultimo-${Date.now()}.pdf`);
    ctx.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: out });
    await expect(ctx.handlers['save-last-from-folder']({}, {
      sourceDir: dir,
      pattern: 'pdf$',
      suggestedName: 'ultimo.pdf'
    })).resolves.toMatchObject({ ok: true, path: out, from: expect.stringContaining('nuevo.pdf') });
    expect(fs.readFileSync(out, 'utf8')).toBe('new');
  });

  test('open-pdf-from-url y open-docx-from-url descargan a temporal y manejan errores', async () => {
    const ctx = loadMain();

    ctx.fetchMock.mockResolvedValueOnce(jsonResponse('PDF'));
    await expect(ctx.handlers['open-pdf-from-url']({}, 'http://localhost:5050/api/p.pdf'))
      .resolves.toMatchObject({ ok: true, path: expect.stringContaining('CLAVES_RESPUESTA_') });

    ctx.fetchMock.mockResolvedValueOnce(jsonResponse('DOCX'));
    await expect(ctx.handlers['open-docx-from-url']({}, { url: 'http://localhost:5050/api/a.docx', suggestedName: 'Mi examen?.docx' }))
      .resolves.toMatchObject({ ok: true, path: expect.stringContaining('Mi examen_.docx') });

    await expect(ctx.handlers['open-docx-from-url']({}, {})).resolves.toMatchObject({ ok: false });

    ctx.fetchMock.mockResolvedValueOnce(jsonResponse('falló', false, 500));
    await expect(ctx.handlers['open-pdf-from-url']({}, 'http://localhost:5050/api/error.pdf'))
      .resolves.toMatchObject({ ok: false });
  });

  test('print-pdf-file cubre archivo inexistente y flujo exitoso de impresión', async () => {
    const ctx = loadMain();

    await expect(ctx.handlers['print-pdf-file']({}, 'no-existe.pdf')).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining('No existe')
    });

    const pdf = path.join(os.tmpdir(), `claves-${Date.now()}.pdf`);
    await fsp.writeFile(pdf, Buffer.from('%PDF demo'));

    await expect(ctx.handlers['print-pdf-file']({}, pdf)).resolves.toEqual({ ok: true });
    expect(fs.existsSync(pdf)).toBe(false);
    expect(ctx.windows.length).toBeGreaterThanOrEqual(1);
    expect(ctx.windows[0].webContents.print).toHaveBeenCalled();
  });

  test('eventos de cierre invocan stopBackend sin romper', () => {
    const ctx = loadMain();
    expect(() => ctx.listeners['before-quit']()).not.toThrow();
    expect(() => ctx.listeners['window-all-closed']()).not.toThrow();
  });
});

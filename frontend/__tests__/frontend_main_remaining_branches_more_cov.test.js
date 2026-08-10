const os = require('os');
const path = require('path');
const fs = require('fs');

function jsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    json: jest.fn(() => Promise.resolve(data)),
    text: jest.fn(() => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data))),
    arrayBuffer: jest.fn(() => Promise.resolve(Buffer.from(String(data || 'archivo-demo'))))
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
    getPath: jest.fn(() => fs.mkdtempSync(path.join(os.tmpdir(), 'evalunia-main-more-')))
  };

  const dialog = { showSaveDialog: jest.fn(), showErrorBox: jest.fn() };
  const shell = { showItemInFolder: jest.fn(), openPath: jest.fn(() => Promise.resolve('')) };
  const session = {
    defaultSession: { cookies: { get: jest.fn(() => Promise.resolve([{ name: 'sid', value: 'cookie1' }])) } }
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
        _events: {},
        session: {
          _events: {},
          on: jest.fn((name, cb) => { this.webContents.session._events[name] = cb; }),
          removeListener: jest.fn()
        },
        on: jest.fn((name, cb) => { this.webContents._events[name] = cb; }),
        send: jest.fn(),
        print: jest.fn((_opts, cb) => {
          const prevent = jest.fn();
          const before = this.webContents._events['before-input-event'];
          if (before) {
            before({ preventDefault: prevent }, { control: true, key: 'S' });
            before({ preventDefault: prevent }, { meta: true, key: 'O' });
            before({ preventDefault: prevent }, { key: 'F5' });
            before({ preventDefault: prevent }, { key: 'A' });
          }
          const blocker = this.webContents.session._events['will-download'];
          if (blocker) blocker({ preventDefault: prevent });
          const openHandler = this.webContents._openHandler;
          if (openHandler) openHandler();
          cb(false, 'cancelado por usuario');
        }),
        setWindowOpenHandler: jest.fn((cb) => { this.webContents._openHandler = cb; }),
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

  jest.doMock('electron', () => ({ app, BrowserWindow, ipcMain, dialog, shell, session, Menu }), { virtual: true });
  const fetchMock = jest.fn();
  jest.doMock('node-fetch', () => fetchMock, { virtual: true });

  require('../main.js');
  return { handlers, listeners, app, dialog, shell, session, ipcMain, fetchMock, windows };
}

describe('main.js ramas restantes de IPC y utilidades', () => {
  test('save-from-url cubre descarga sin cookies y save-last-from-folder cubre catch de patrón inválido', async () => {
    const ctx = loadMain();
    const out = path.join(os.tmpdir(), `sin-cookies-${Date.now()}.docx`);

    ctx.session.defaultSession.cookies.get.mockResolvedValueOnce([]);
    ctx.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: out });
    ctx.fetchMock.mockResolvedValueOnce(jsonResponse('DOCX'));

    await expect(ctx.handlers['save-from-url']({}, {
      url: 'http://localhost:5050/api/archivo.docx',
      suggestedName: 'archivo.docx'
    })).resolves.toMatchObject({ ok: true, path: out });

    expect(ctx.fetchMock).toHaveBeenLastCalledWith('http://127.0.0.1:5050/api/archivo.docx', { headers: {} });

    await expect(ctx.handlers['save-last-from-folder']({}, {
      sourceDir: os.tmpdir(),
      pattern: '[',
      suggestedName: 'x.pdf'
    })).resolves.toMatchObject({ ok: false });
  });

  test('open-pdf-from-url y open-docx-from-url cubren error cuando shell.openPath devuelve mensaje', async () => {
    const ctx = loadMain();

    ctx.fetchMock.mockResolvedValueOnce(jsonResponse('PDF'));
    ctx.shell.openPath.mockResolvedValueOnce('No se pudo abrir PDF');
    await expect(ctx.handlers['open-pdf-from-url']({}, 'http://localhost:5050/api/demo.pdf'))
      .resolves.toMatchObject({ ok: false, message: expect.stringContaining('No se pudo abrir PDF') });

    ctx.fetchMock.mockResolvedValueOnce(jsonResponse('DOCX'));
    ctx.shell.openPath.mockResolvedValueOnce('No se pudo abrir Word');
    await expect(ctx.handlers['open-docx-from-url']({}, {
      url: 'http://localhost:5050/api/demo.docx',
      suggestedName: 'Reporte final'
    })).resolves.toMatchObject({ ok: false, message: expect.stringContaining('No se pudo abrir Word') });
  });

  test('print-pdf-file cubre bloqueo de atajos, descargas, ventanas externas y cancelación', async () => {
    const ctx = loadMain();
    const pdf = path.join(os.tmpdir(), `claves-cancel-${Date.now()}.pdf`);
    fs.writeFileSync(pdf, '%PDF demo');

    await expect(ctx.handlers['print-pdf-file']({}, pdf)).resolves.toMatchObject({
      ok: false,
      canceled: true,
      message: expect.stringMatching(/cancelado/i)
    });

    const printWindow = ctx.windows.find((w) => w.opts && w.opts.title === 'Vista previa de claves de respuesta');
    expect(printWindow).toBeTruthy();
    expect(printWindow.webContents.on).toHaveBeenCalledWith('before-input-event', expect.any(Function));
    expect(printWindow.webContents.session.on).toHaveBeenCalledWith('will-download', expect.any(Function));
    expect(printWindow.webContents.session.removeListener).toHaveBeenCalledWith('will-download', expect.any(Function));
    expect(printWindow.webContents.setWindowOpenHandler).toHaveBeenCalled();
    expect(printWindow.closed).toBe(true);
    expect(fs.existsSync(pdf)).toBe(false);
  });

  test('window-all-closed respeta plataforma darwin sin llamar app.quit', () => {
    const ctx = loadMain();
    const original = Object.getOwnPropertyDescriptor(process, 'platform');

    Object.defineProperty(process, 'platform', { value: 'darwin' });

    expect(() => ctx.listeners['window-all-closed']()).not.toThrow();
    expect(ctx.app.quit).not.toHaveBeenCalled();

    Object.defineProperty(process, 'platform', original);
  });
});

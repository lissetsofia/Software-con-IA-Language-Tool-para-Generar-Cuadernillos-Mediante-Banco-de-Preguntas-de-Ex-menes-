const os = require('os');
const path = require('path');
const fsReal = require('fs');
const { EventEmitter } = require('events');

function jsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: { get: jest.fn(() => '') },
    json: jest.fn(() => Promise.resolve(data)),
    text: jest.fn(() => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data))),
    arrayBuffer: jest.fn(() => Promise.resolve(Buffer.from('docx demo')))
  };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flushMany(times = 10) {
  for (let i = 0; i < times; i += 1) await tick();
}

function loadMainExtra(options = {}) {
  jest.resetModules();

  const {
    packaged = false,
    exists = true,
    socketMode = 'connect',
    printSuccess = true,
    failureReason = '',
    loadUrlError = false,
    openPathResult = '',
    fetchImpl = null
  } = options;

  const originalResourcesPath = process.resourcesPath;
  Object.defineProperty(process, 'resourcesPath', {
    value: path.join(os.tmpdir(), 'evalunia-resources-extra'),
    configurable: true
  });

  const handlers = {};
  const listeners = {};
  const windows = [];
  const tmpBase = fsReal.mkdtempSync(path.join(os.tmpdir(), 'evalunia-main-extra-'));

  const app = {
    isPackaged: packaged,
    disableHardwareAcceleration: jest.fn(),
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn((name, cb) => { listeners[name] = cb; }),
    quit: jest.fn(),
    getPath: jest.fn(() => tmpBase)
  };

  const dialog = {
    showSaveDialog: jest.fn(() => Promise.resolve({ canceled: true })),
    showErrorBox: jest.fn()
  };

  const shell = {
    showItemInFolder: jest.fn(),
    openPath: jest.fn(() => Promise.resolve(openPathResult))
  };

  const session = {
    defaultSession: {
      cookies: { get: jest.fn(() => Promise.resolve([{ name: 'sid', value: 'abc' }])) }
    }
  };

  const Menu = { setApplicationMenu: jest.fn() };

  const ipcMain = {
    handle: jest.fn((name, cb) => { handlers[name] = cb; }),
    on: jest.fn((name, cb) => { listeners[name] = cb; })
  };

  class BrowserWindow {
    constructor(opts) {
      this.opts = opts;
      this.closed = false;
      this.show = jest.fn();
      this.focus = jest.fn();
      this.maximize = jest.fn();
      this.setMenuBarVisibility = jest.fn();
      this.removeMenu = jest.fn();
      this.loadFile = jest.fn(() => Promise.resolve());
      this.loadURL = jest.fn(() => loadUrlError ? Promise.reject(new Error('fallo loadURL')) : Promise.resolve());
      this.close = jest.fn(() => { this.closed = true; });
      this.isDestroyed = jest.fn(() => this.closed);
      this.webContents = {
        session: {
          on: jest.fn(),
          removeListener: jest.fn()
        },
        on: jest.fn(),
        send: jest.fn(),
        print: jest.fn((_opts, cb) => cb(printSuccess, failureReason)),
        setWindowOpenHandler: jest.fn(),
        openDevTools: jest.fn()
      };
      windows.push(this);
    }
    once(name, cb) {
      if (name === 'ready-to-show') Promise.resolve().then(cb);
    }
  }

  class MockSocket {
    constructor() {
      this.handlers = {};
      this.destroy = jest.fn();
      this.setTimeout = jest.fn(() => this);
    }
    once(name, cb) {
      this.handlers[name] = cb;
      return this;
    }
    connect() {
      Promise.resolve().then(() => {
        if (socketMode === 'connect' && this.handlers.connect) this.handlers.connect();
        if (socketMode === 'timeout' && this.handlers.timeout) this.handlers.timeout();
        if (socketMode === 'error' && this.handlers.error) this.handlers.error(new Error('puerto libre'));
      });
    }
  }

  const spawned = new EventEmitter();
  spawned.pid = 777;
  spawned.stdout = new EventEmitter();
  spawned.stderr = new EventEmitter();
  spawned.kill = jest.fn();
  const spawnMock = jest.fn(() => spawned);

  jest.doMock('electron', () => ({ app, BrowserWindow, ipcMain, dialog, shell, session, Menu }), { virtual: true });

  const actualFsSync = jest.requireActual('fs');
  jest.doMock('fs', () => ({
    ...actualFsSync,
    existsSync: jest.fn(() => exists),
    unlinkSync: jest.fn()
  }));

  const actualFsPromises = jest.requireActual('fs/promises');
  jest.doMock('fs/promises', () => ({
    ...actualFsPromises,
    mkdir: jest.fn((...args) => actualFsPromises.mkdir(...args)),
    writeFile: jest.fn((...args) => actualFsPromises.writeFile(...args))
  }));

  jest.doMock('child_process', () => ({ spawn: spawnMock }));
  jest.doMock('net', () => ({ Socket: MockSocket }));

  const fetchMock = jest.fn((url) => {
    if (typeof fetchImpl === 'function') return fetchImpl(url);
    const u = String(url);
    if (u.includes('/probar-conexion')) return Promise.resolve(jsonResponse({ conexion: 'ok' }));
    return Promise.resolve(jsonResponse(Buffer.from('docx demo'), true, 200));
  });
  jest.doMock('node-fetch', () => fetchMock, { virtual: true });

  const spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  const spyError = jest.spyOn(console, 'error').mockImplementation(() => {});

  require('../main.js');

  function restore() {
    spyLog.mockRestore();
    spyError.mockRestore();
    Object.defineProperty(process, 'resourcesPath', {
      value: originalResourcesPath,
      configurable: true
    });
  }

  return { handlers, listeners, app, dialog, shell, session, fetchMock, windows, spawnMock, restore };
}

describe('main.js rutas robustas extra de impresion y DOCX', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('print-pdf-file cubre impresion exitosa y cierre limpio de ventana temporal', async () => {
    const ctx = loadMainExtra({ printSuccess: true });
    await flushMany(12);

    const pdf = path.join(os.tmpdir(), `ok-print-${Date.now()}.pdf`);
    fsReal.writeFileSync(pdf, '%PDF demo');

    await expect(ctx.handlers['print-pdf-file']({}, pdf)).resolves.toMatchObject({ ok: true });
    const printWin = ctx.windows.find((w) => w.webContents.print.mock.calls.length > 0);
    expect(printWin).toBeTruthy();
    expect(printWin.close).toHaveBeenCalled();
    ctx.restore();
  });

  test('print-pdf-file cubre catch cuando falla loadURL', async () => {
    const ctx = loadMainExtra({ loadUrlError: true });
    await flushMany(12);

    const pdf = path.join(os.tmpdir(), `fail-load-${Date.now()}.pdf`);
    fsReal.writeFileSync(pdf, '%PDF demo');

    const res = await ctx.handlers['print-pdf-file']({}, pdf);
    expect(res.ok).toBe(false);
    expect(String(res.message)).toContain('fallo loadURL');
    ctx.restore();
  });

  test('open-docx-from-url valida payload vacio y HTTP error de backend', async () => {
    const ctx = loadMainExtra({
      fetchImpl: (url) => {
        const u = String(url);
        if (u.includes('/probar-conexion')) return Promise.resolve(jsonResponse({ conexion: 'ok' }));
        return Promise.resolve(jsonResponse('Servidor error', false, 500));
      }
    });
    await flushMany(12);

    await expect(ctx.handlers['open-docx-from-url']({}, null)).resolves.toMatchObject({ ok: false });
    const res = await ctx.handlers['open-docx-from-url']({}, { url: 'http://localhost:5050/api/descargas/demo.docx' });
    expect(res.ok).toBe(false);
    expect(String(res.message)).toContain('HTTP 500');
    ctx.restore();
  });

  test('open-docx-from-url guarda temporal, abre con shell y maneja error de openPath', async () => {
    const ctxOk = loadMainExtra({ openPathResult: '' });
    await flushMany(12);

    const ok = await ctxOk.handlers['open-docx-from-url']({}, {
      url: 'http://localhost:5050/api/descargas/Demo DOCX.docx',
      suggestedName: 'Mi examen final'
    });
    expect(ok.ok).toBe(true);
    expect(ok.path).toMatch(/\.docx$/i);
    expect(ctxOk.shell.openPath).toHaveBeenCalled();
    ctxOk.restore();

    const ctxFail = loadMainExtra({ openPathResult: 'No se pudo abrir Word' });
    await flushMany(12);
    const fail = await ctxFail.handlers['open-docx-from-url']({}, 'http://localhost:5050/api/descargas/demo.docx');
    expect(fail.ok).toBe(false);
    expect(String(fail.message)).toContain('No se pudo abrir Word');
    ctxFail.restore();
  });
});

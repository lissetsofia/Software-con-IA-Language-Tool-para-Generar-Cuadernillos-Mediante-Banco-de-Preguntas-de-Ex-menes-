const os = require('os');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

function jsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    json: jest.fn(() => Promise.resolve(data)),
    text: jest.fn(() => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data))),
    arrayBuffer: jest.fn(() => Promise.resolve(Buffer.from('demo')))
  };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flushMany(times = 8) {
  for (let i = 0; i < times; i += 1) await tick();
}

function loadMainStartup(options = {}) {
  jest.resetModules();

  const {
    packaged = false,
    exists = true,
    socketMode = 'connect',
    printSuccess = true,
    failureReason = ''
  } = options;

  const originalResourcesPath = process.resourcesPath;
  Object.defineProperty(process, 'resourcesPath', {
    value: path.join(os.tmpdir(), 'evalunia-resources'),
    configurable: true
  });

  const handlers = {};
  const listeners = {};
  const windows = [];

  const app = {
    isPackaged: packaged,
    disableHardwareAcceleration: jest.fn(),
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn((name, cb) => { listeners[name] = cb; }),
    quit: jest.fn(),
    getPath: jest.fn(() => fs.mkdtempSync(path.join(os.tmpdir(), 'evalunia-main-start-')))
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
      cookies: { get: jest.fn(() => Promise.resolve([])) }
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
      this.loadURL = jest.fn(() => Promise.resolve());
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
      if (name === 'ready-to-show') {
        Promise.resolve().then(cb);
      }
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
  spawned.pid = 1234;
  spawned.killed = false;
  spawned.stdout = new EventEmitter();
  spawned.stderr = new EventEmitter();
  spawned.kill = jest.fn(() => { spawned.killed = true; });
  const spawnMock = jest.fn(() => spawned);

  jest.doMock('electron', () => ({
    app,
    BrowserWindow,
    ipcMain,
    dialog,
    shell,
    session,
    Menu
  }), { virtual: true });

  const actualFs = jest.requireActual('fs');
  jest.doMock('fs', () => ({
    ...actualFs,
    existsSync: jest.fn(() => exists),
    unlinkSync: jest.fn()
  }));

  jest.doMock('child_process', () => ({ spawn: spawnMock }));
  jest.doMock('net', () => ({ Socket: MockSocket }));

  const fetchMock = jest.fn(() => Promise.resolve(jsonResponse({ conexion: 'ok' })));
  jest.doMock('node-fetch', () => fetchMock, { virtual: true });

  const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

  require('../main.js');

  function restore() {
    consoleLog.mockRestore();
    consoleError.mockRestore();
    Object.defineProperty(process, 'resourcesPath', {
      value: originalResourcesPath,
      configurable: true
    });
  }

  return {
    handlers,
    listeners,
    app,
    dialog,
    shell,
    session,
    ipcMain,
    Menu,
    fetchMock,
    spawnMock,
    spawned,
    windows,
    consoleLog,
    consoleError,
    restore
  };
}

describe('main.js arranque de Electron y backend', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('arranque en desarrollo inicia backend, espera conexión, crea ventana y procesa eventos', async () => {
    const ctx = loadMainStartup({ packaged: false, exists: true, socketMode: 'connect' });
    await flushMany(12);

    expect(ctx.app.disableHardwareAcceleration).toHaveBeenCalled();
    expect(ctx.Menu.setApplicationMenu).toHaveBeenCalledWith(null);
    expect(ctx.spawnMock).toHaveBeenCalledWith(
      'python',
      [expect.stringContaining('backend')],
      expect.objectContaining({ windowsHide: true, shell: false })
    );
    expect(ctx.fetchMock).toHaveBeenCalledWith('http://127.0.0.1:5050/probar-conexion');

    expect(ctx.windows.length).toBeGreaterThan(0);
    const mainWin = ctx.windows[0];
    expect(mainWin.setMenuBarVisibility).toHaveBeenCalledWith(false);
    expect(mainWin.maximize).toHaveBeenCalled();
    expect(mainWin.loadFile).toHaveBeenCalledWith(expect.stringContaining('index.html'));
    expect(mainWin.webContents.openDevTools).toHaveBeenCalledWith({ mode: 'detach' });

    ctx.listeners['login-exitoso']({}, 'token-demo');
    expect(mainWin.webContents.send).toHaveBeenCalledWith('login-exitoso', 'token-demo');

    expect(() => ctx.spawned.stdout.emit('data', Buffer.from('backend listo'))).not.toThrow();
    expect(() => ctx.spawned.stderr.emit('data', Buffer.from('warning'))).not.toThrow();
    expect(() => ctx.spawned.emit('error', new Error('spawn error'))).not.toThrow();

    ctx.listeners['before-quit']();
    expect(ctx.spawned.kill).toHaveBeenCalled();

    expect(() => ctx.spawned.emit('close', 0, null)).not.toThrow();
    expect(() => ctx.listeners['window-all-closed']()).not.toThrow();
    expect(ctx.app.quit).toHaveBeenCalled();

    ctx.restore();
  });

  test('arranque empaquetado reporta error cuando no existe el ejecutable del backend', async () => {
    const ctx = loadMainStartup({ packaged: true, exists: false, socketMode: 'error' });
    await flushMany(8);

    expect(ctx.app.whenReady).toHaveBeenCalled();
    expect(ctx.spawnMock).not.toHaveBeenCalled();
    expect(ctx.consoleError).toHaveBeenCalled();
    ctx.restore();
  });

  test('print-pdf-file cubre cancelación de impresión y limpieza del archivo temporal', async () => {
    const ctx = loadMainStartup({ packaged: false, exists: true, printSuccess: false, failureReason: 'Print job canceled' });
    await flushMany(10);

    const pdf = path.join(os.tmpdir(), `cancel-print-${Date.now()}.pdf`);
    fs.writeFileSync(pdf, '%PDF demo');

    await expect(ctx.handlers['print-pdf-file']({}, pdf)).resolves.toMatchObject({
      ok: false,
      canceled: true,
      message: expect.stringMatching(/cancel/i)
    });

    const printWin = ctx.windows.find((w) => w.webContents.print.mock.calls.length > 0);
    expect(printWin).toBeTruthy();
    expect(printWin.webContents.on).toHaveBeenCalledWith('before-input-event', expect.any(Function));
    expect(printWin.webContents.session.on).toHaveBeenCalledWith('will-download', expect.any(Function));
    expect(printWin.webContents.setWindowOpenHandler).toHaveBeenCalled();
    expect(printWin.close).toHaveBeenCalled();

    ctx.restore();
  });
});

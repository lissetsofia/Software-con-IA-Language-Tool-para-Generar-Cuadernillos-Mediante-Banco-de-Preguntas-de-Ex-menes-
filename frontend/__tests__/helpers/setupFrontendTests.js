const { TextEncoder, TextDecoder } = require('util');

if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function rootDir() {
  return process.cwd();
}

function abs(p) {
  return path.join(rootDir(), p);
}

function readFrontendFile(rel) {
  return fs.readFileSync(abs(rel), 'utf8');
}

function resetFrontendGuards() {
  const names = [
    '__GENERACION_PREGUNTAS_LOADED__',
    '__CUADERNILLOS_LOADED__',
    '__CORRECTOR_ORTOGRAFICO_LOADED__',
    '__TEMARIO_MODAL_LOADED__',
    '__EVALUNIA_DIALOG_LOADED__'
  ];
  for (const n of names) {
    try { delete global[n]; } catch (_) {}
    try { if (global.window) delete global.window[n]; } catch (_) {}
  }
}

function makeDataTableMock() {
  const api = {
    clear: jest.fn(() => api),
    draw: jest.fn(() => api),
    destroy: jest.fn(() => api),
    ajax: { reload: jest.fn(() => api) },
    rows: {
      add: jest.fn(() => api),
      data: jest.fn(() => []),
      every: jest.fn(() => api)
    },
    row: jest.fn(() => ({
      data: jest.fn(() => ({})),
      remove: jest.fn(() => api),
      node: jest.fn(() => document.createElement('tr'))
    })),
    columns: { adjust: jest.fn(() => api) },
    column: jest.fn(() => ({ data: jest.fn(() => []) })),
    page: jest.fn(() => ({ draw: jest.fn(() => api) })),
    search: jest.fn(() => api),
    order: jest.fn(() => api)
  };
  return api;
}

function makeJQueryChain(selector, fakeDataTable) {
  const elements = [];
  try {
    if (typeof selector === 'string') {
      elements.push(...Array.from(document.querySelectorAll(selector)));
    } else if (selector && selector.nodeType) {
      elements.push(selector);
    } else if (selector === document || selector === window) {
      elements.push(selector);
    }
  } catch (_) {}

  const chain = {
    length: elements.length,
    0: elements[0] || null,
    DataTable: jest.fn(() => fakeDataTable()),
    dataTable: jest.fn(() => fakeDataTable()),
    on: jest.fn(function (_event, _selector, cb) {
      if (typeof _selector === 'function') cb = _selector;
      if (typeof cb === 'function') {
        // No ejecutamos callbacks de eventos Bootstrap automáticamente.
      }
      return this;
    }),
    off: jest.fn(function () { return this; }),
    ready: jest.fn(function (cb) { if (typeof cb === 'function') cb(); return this; }),
    each: jest.fn(function (cb) {
      if (typeof cb === 'function') elements.forEach((el, i) => cb.call(el, i, el));
      return this;
    }),
    click: jest.fn(function (cb) { if (typeof cb === 'function') elements.forEach((el) => el.addEventListener('click', cb)); return this; }),
    change: jest.fn(function (cb) { if (typeof cb === 'function') elements.forEach((el) => el.addEventListener('change', cb)); return this; }),
    submit: jest.fn(function (cb) { if (typeof cb === 'function') elements.forEach((el) => el.addEventListener('submit', cb)); return this; }),
    trigger: jest.fn(function () { return this; }),
    modal: jest.fn(function () { return this; }),
    append: jest.fn(function (html) { elements.forEach((el) => { if (typeof html === 'string') el.insertAdjacentHTML('beforeend', html); }); return this; }),
    prepend: jest.fn(function (html) { elements.forEach((el) => { if (typeof html === 'string') el.insertAdjacentHTML('afterbegin', html); }); return this; }),
    appendTo: jest.fn(function () { return this; }),
    empty: jest.fn(function () { elements.forEach((el) => { el.innerHTML = ''; }); return this; }),
    remove: jest.fn(function () { elements.forEach((el) => el.remove && el.remove()); return this; }),
    find: jest.fn(function (sel) { return makeJQueryChain(sel, fakeDataTable); }),
    closest: jest.fn(function (sel) { return makeJQueryChain(elements[0] ? elements[0].closest(sel) : null, fakeDataTable); }),
    parent: jest.fn(function () { return makeJQueryChain(elements[0] ? elements[0].parentElement : null, fakeDataTable); }),
    children: jest.fn(function () { return makeJQueryChain(elements[0] ? Array.from(elements[0].children) : [], fakeDataTable); }),
    hide: jest.fn(function () { return this; }),
    show: jest.fn(function () { return this; }),
    fadeIn: jest.fn(function () { return this; }),
    fadeOut: jest.fn(function () { return this; }),
    addClass: jest.fn(function () { return this; }),
    removeClass: jest.fn(function () { return this; }),
    toggleClass: jest.fn(function () { return this; }),
    hasClass: jest.fn(() => false),
    css: jest.fn(function () { return this; }),
    prop: jest.fn(function (name, value) {
      if (value === undefined) return elements[0] ? elements[0][name] : undefined;
      elements.forEach((el) => { el[name] = value; });
      return this;
    }),
    attr: jest.fn(function (name, value) {
      if (value === undefined) return elements[0] ? elements[0].getAttribute(name) : undefined;
      elements.forEach((el) => el.setAttribute(name, value));
      return this;
    }),
    removeAttr: jest.fn(function (name) { elements.forEach((el) => el.removeAttribute(name)); return this; }),
    data: jest.fn(function (_name, value) { return value === undefined ? undefined : this; }),
    val: jest.fn(function (value) {
      if (value === undefined) return elements[0] && 'value' in elements[0] ? elements[0].value : '';
      elements.forEach((el) => { if ('value' in el) el.value = value; });
      return this;
    }),
    text: jest.fn(function (value) {
      if (value === undefined) return elements.map((el) => el.textContent || '').join('');
      elements.forEach((el) => { el.textContent = value; });
      return this;
    }),
    html: jest.fn(function (value) {
      if (value === undefined) return elements[0] ? elements[0].innerHTML : '';
      elements.forEach((el) => { el.innerHTML = value; });
      return this;
    })
  };
  return chain;
}

function installBrowserMocks(dom) {
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.HTMLInputElement = dom.window.HTMLInputElement;
  global.HTMLButtonElement = dom.window.HTMLButtonElement;
  global.HTMLFormElement = dom.window.HTMLFormElement;
  global.Event = dom.window.Event;
  global.CustomEvent = dom.window.CustomEvent;
  global.MouseEvent = dom.window.MouseEvent;
  global.File = dom.window.File;
  global.Blob = dom.window.Blob;
  global.FormData = dom.window.FormData;
  global.Node = dom.window.Node;
  global.MutationObserver = dom.window.MutationObserver || class { observe() {} disconnect() {} takeRecords() { return []; } };
  global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

  if (!window.HTMLElement.prototype.scrollIntoView) window.HTMLElement.prototype.scrollIntoView = jest.fn();
  if (!window.HTMLElement.prototype.focus) window.HTMLElement.prototype.focus = jest.fn();
  if (!window.HTMLFormElement.prototype.submit) window.HTMLFormElement.prototype.submit = jest.fn();
  window.print = jest.fn();
  window.open = jest.fn(() => ({ focus: jest.fn(), close: jest.fn() }));

  global.FileReader = class {
    readAsDataURL() { this.result = 'data:application/pdf;base64,AAAA'; if (this.onload) this.onload({ target: this }); }
    readAsText() { this.result = 'texto'; if (this.onload) this.onload({ target: this }); }
    readAsArrayBuffer() { this.result = new ArrayBuffer(8); if (this.onload) this.onload({ target: this }); }
  };
  window.FileReader = global.FileReader;

  global.URL = {
    createObjectURL: jest.fn(() => 'blob:test'),
    revokeObjectURL: jest.fn()
  };
  window.URL = global.URL;

  const makeStorage = () => {
    const storage = new Map();
    return {
      getItem: jest.fn((k) => storage.get(k) || null),
      setItem: jest.fn((k, v) => storage.set(k, String(v))),
      removeItem: jest.fn((k) => storage.delete(k)),
      clear: jest.fn(() => storage.clear())
    };
  };
  const localStorageMock = makeStorage();
  const sessionStorageMock = makeStorage();
  Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock, configurable: true });
  global.localStorage = localStorageMock;
  global.sessionStorage = sessionStorageMock;

  const jsonResponse = (body = {}, ok = true, status = 200) => Promise.resolve({
    ok,
    status,
    headers: { get: jest.fn(() => 'application/json') },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob(['demo'], { type: 'application/octet-stream' })),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
  });

  global.fetch = jest.fn((url) => {
    const u = String(url);
    if (u.includes('/api/examenes') && u.includes('/temas')) return jsonResponse([{ id: 1, nombre: 'ÁLGEBRA', activo: 1, n_preguntas: 2 }]);
    if (u.includes('/api/examenes')) return jsonResponse([{ idexamenes: 1, nombre: 'Examen demo', numero: 'I', institucion: 'UNAMBA', anio: 2025, archivo_nombre: 'demo.docx' }]);
    if (u.includes('/api/temas')) return jsonResponse([{ id: 1, nombre: 'ÁLGEBRA', activo: 1, n_preguntas: 2 }]);
    if (u.includes('/api/grupos')) return jsonResponse([{ idgrupo: 1, clave: 'A', nombre: 'Grupo A', activo: 1, total_preguntas: 10 }]);
    if (u.includes('/api/preguntas')) return jsonResponse([{ idpreguntas: 1, numero_p: 1, archivo_nombre: 'p1.docx' }]);
    if (u.includes('/lt/status')) return jsonResponse({ running: true, dir: 'LanguageTool' });
    return jsonResponse({ ok: true, exito: true, status: 'ok', html_url: '/api/descargas/demo.pdf', ruta_rel: '/api/descargas/demo.docx' });
  });
  window.fetch = global.fetch;

  global.alert = jest.fn();
  global.confirm = jest.fn(() => true);
  global.prompt = jest.fn(() => 'Demo');
  window.alert = global.alert;
  window.confirm = global.confirm;
  window.prompt = global.prompt;

  const modalInstance = { show: jest.fn(), hide: jest.fn(), toggle: jest.fn(), dispose: jest.fn() };
  global.bootstrap = {
    Modal: jest.fn(() => modalInstance),
    Tooltip: jest.fn(() => ({ dispose: jest.fn() })),
    Toast: jest.fn(() => ({ show: jest.fn(), hide: jest.fn() })),
    Dropdown: jest.fn(() => ({ show: jest.fn(), hide: jest.fn() }))
  };
  global.bootstrap.Modal.getOrCreateInstance = jest.fn(() => modalInstance);
  global.bootstrap.Modal.getInstance = jest.fn(() => modalInstance);
  window.bootstrap = global.bootstrap;

  const fakeDataTable = jest.fn(() => makeDataTableMock());
  fakeDataTable.isDataTable = jest.fn(() => false);
  global.DataTable = fakeDataTable;
  window.DataTable = fakeDataTable;

  const jqueryLike = jest.fn((selector) => {
    if (typeof selector === 'function') {
      selector();
      return makeJQueryChain(document, fakeDataTable);
    }
    return makeJQueryChain(selector, fakeDataTable);
  });
  jqueryLike.fn = makeJQueryChain(null, fakeDataTable);
  jqueryLike.fn.DataTable = fakeDataTable;
  jqueryLike.fn.dataTable = {
    ext: { errMode: 'none' },
    isDataTable: jest.fn(() => false)
  };
  jqueryLike.extend = Object.assign;
  jqueryLike.ajax = jest.fn(() => Promise.resolve({}));
  jqueryLike.get = jest.fn(() => Promise.resolve(''));
  jqueryLike.post = jest.fn(() => Promise.resolve({ ok: true }));
  global.$ = jqueryLike;
  global.jQuery = jqueryLike;
  window.$ = jqueryLike;
  window.jQuery = jqueryLike;

  global.Swal = {
    fire: jest.fn(() => Promise.resolve({ isConfirmed: true, value: true })),
    mixin: jest.fn(() => ({ fire: jest.fn(() => Promise.resolve({ isConfirmed: true })) }))
  };
  window.Swal = global.Swal;

  global.electronAPI = {
    seleccionarArchivo: jest.fn(() => Promise.resolve('demo.docx')),
    guardarArchivo: jest.fn(() => Promise.resolve('salida.docx')),
    imprimirPDF: jest.fn(() => Promise.resolve(true)),
    abrirPDF: jest.fn(() => Promise.resolve(true)),
    abrirArchivo: jest.fn(() => Promise.resolve(true)),
    onLoginExitoso: jest.fn(),
    enviarLoginExitoso: jest.fn(),
    imprimirClaves: jest.fn(() => Promise.resolve(true)),
    generarPDF: jest.fn(() => Promise.resolve(true))
  };
  window.electronAPI = global.electronAPI;

  resetFrontendGuards();
}

function createDomFromHtml(relHtml, extraHtml = '') {
  const htmlPath = abs(relHtml);
  const html = fs.existsSync(htmlPath)
    ? fs.readFileSync(htmlPath, 'utf8')
    : '<!doctype html><html><body></body></html>';

  const dom = new JSDOM(html + extraHtml, {
    url: 'http://127.0.0.1:5050/',
    pretendToBeVisual: true,
    runScripts: 'outside-only'
  });

  installBrowserMocks(dom);
  return dom;
}

function requireFresh(relJs) {
  const full = abs(relJs);
  resetFrontendGuards();
  try {
    delete require.cache[require.resolve(full)];
  } catch (_) {}
  try {
    return require(full);
  } catch (err) {
    if (err && /STOP_DUP_GENERACION_PREGUNTAS/i.test(String(err.message || err))) {
      return { ignoredDuplicateGuard: true };
    }
    throw err;
  }
}

function dispatchDomReady() {
  try {
    const evt = document.createEvent('Event');
    evt.initEvent('DOMContentLoaded', true, true);
    document.dispatchEvent(evt);
  } catch (_) {}
  try {
    const evt2 = document.createEvent('Event');
    evt2.initEvent('load', true, true);
    window.dispatchEvent(evt2);
  } catch (_) {}
}

module.exports = {
  abs,
  readFrontendFile,
  createDomFromHtml,
  requireFresh,
  dispatchDomReady
};

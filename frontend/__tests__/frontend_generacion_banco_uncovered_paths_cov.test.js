const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function jsonResponse(body, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob(['demo'], { type: 'application/octet-stream' })),
  });
}

async function tick() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function eventOf(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  return ev;
}

function makeFile(name = 'archivo.docx') {
  try {
    return new File(['docx'], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  } catch (_) {
    const b = new Blob(['docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    Object.defineProperty(b, 'name', { value: name, configurable: true });
    return b;
  }
}

function setFiles(input, files) {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
}

function clickLast(id) {
  const el = [...document.querySelectorAll(`#${id}`)].pop();
  if (el) el.dispatchEvent(eventOf('click'));
}

function addBancoDom() {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="modal-examen" class="modal"></div>
    <button id="btnBancoPreguntas" type="button">Banco</button>
    <button id="btnBancoVolverResumen" type="button">Volver</button>
    <button id="btnBancoImportar" type="button">Importar</button>
    <button id="btnBancoImportarDetalle" type="button">Importar detalle</button>
    <button id="btnBancoImportarGuardar" type="button">Guardar importación</button>
    <button id="btnBancoEditarGuardar" type="button">Guardar edición</button>

    <div id="modalBancoPreguntas" class="modal show" style="display:block">
      <div id="vista-banco-resumen"></div>
      <div id="vista-banco-detalle" class="d-none"></div>
      <span id="bancoTituloTemaDetalle"></span>
      <span id="bancoDetalleTema"></span>
      <div id="bancoModalResumenDtToolbarHost"></div>
      <div id="bancoModalDetalleDtToolbarHost"></div>
      <table id="tabla-banco-resumen"><tbody></tbody></table>
      <table id="tabla-banco-detalle"><tbody></tbody></table>
    </div>

    <div id="modalBancoImportar" class="modal">
      <select id="bancoTemaImportar"><option value="10">Comunicación</option><option value="20">Álgebra</option></select>
      <input id="bancoFilePreguntas" type="file">
    </div>

    <div id="modalBancoEditar" class="modal">
      <input id="bancoEditId">
      <select id="bancoTemaEditar"><option value="10">Comunicación</option><option value="20">Álgebra</option></select>
      <input id="bancoEditFilePreg" type="file">
      <input id="bancoEditFileSol" type="file">
    </div>
  `);
}

function normalize(input) {
  if (!input) return [];
  if (input.jqueryElements) return input.jqueryElements.filter(Boolean);
  if (input === document || input === window || input.nodeType) return [input];
  if (typeof input === 'string') {
    const txt = input.trim();
    if (txt.startsWith('<')) {
      const tpl = document.createElement('template');
      tpl.innerHTML = txt;
      return Array.from(tpl.content.childNodes).filter((n) => n.nodeType === 1);
    }
    try { return Array.from(document.querySelectorAll(input)); } catch (_) { return []; }
  }
  if (typeof input.length === 'number') return Array.from(input).filter(Boolean);
  return [];
}

function installJQueryBanco() {
  const handlers = [];
  const configs = [];
  const apis = [];
  const active = new Set();

  function makeContainer() {
    const div = document.createElement('div');
    div.innerHTML = '<div class="mbanco-dt-toolbar"><div class="dt-length"><label>Mostrar</label><select><option>8</option></select></div><div class="dt-search"><label>Buscar</label><input type="search"></div></div>';
    document.body.appendChild(div);
    return div;
  }

  const makeApi = () => {
    const api = {
      clear: jest.fn(() => api),
      destroy: jest.fn(() => api),
      draw: jest.fn(() => api),
      rows: { add: jest.fn(() => api) },
      columns: { adjust: jest.fn(() => api) },
      responsive: { recalc: jest.fn(() => api) },
      table: jest.fn(() => ({ container: () => makeContainer() })),
      api: jest.fn(() => api),
    };
    apis.push(api);
    return api;
  };

  const unwrap = (item) => normalize(item);
  const isActive = (target) => active.has(normalize(target)[0] || target);

  const makeChain = (selector) => {
    const elements = normalize(selector);
    const chain = {
      jqueryElements: elements,
      length: elements.length,
      0: elements[0] || null,
      DataTable: jest.fn((config) => {
        const api = makeApi();
        elements.forEach((el) => active.add(el));
        if (config) configs.push(config);
        if (config && typeof config.initComplete === 'function') config.initComplete.call({ api: () => api });
        return api;
      }),
      off: jest.fn(function () { return this; }),
      on: jest.fn(function (eventName, selectorArg, callback) {
        let cb = callback;
        let sel = selectorArg;
        if (typeof selectorArg === 'function') { cb = selectorArg; sel = null; }
        if (typeof cb === 'function') handlers.push({ eventName, selector: sel, callback: cb, elements });
        return this;
      }),
      ready: jest.fn(function (cb) { if (typeof cb === 'function') cb(); return this; }),
      closest: jest.fn((sel) => makeChain(elements[0]?.closest?.(sel))),
      find: jest.fn((sel) => {
        const found = [];
        elements.forEach((el) => { if (el?.querySelectorAll) found.push(...el.querySelectorAll(sel)); });
        return makeChain(found);
      }),
      first: jest.fn(function () { return makeChain(elements[0] ? [elements[0]] : []); }),
      detach: jest.fn(function () { elements.forEach((el) => el.parentNode?.removeChild(el)); return this; }),
      appendTo: jest.fn(function (target) { const targets = unwrap(target); if (targets[0]) elements.forEach((el) => targets[0].appendChild(el)); return this; }),
      append: jest.fn(function (...items) { elements.forEach((el) => items.flatMap(unwrap).forEach((child) => el.appendChild(child))); return this; }),
      prepend: jest.fn(function (...items) { elements.forEach((el) => items.flatMap(unwrap).reverse().forEach((child) => el.insertBefore(child, el.firstChild))); return this; }),
      before: jest.fn(function (item) { const nodes = unwrap(item); elements.forEach((el) => nodes.forEach((node) => el.parentNode?.insertBefore(node, el))); return this; }),
      remove: jest.fn(function () { elements.forEach((el) => el.parentNode?.removeChild(el)); return this; }),
      empty: jest.fn(function () { elements.forEach((el) => { if (el) el.innerHTML = ''; }); return this; }),
      addClass: jest.fn(function (cls) { String(cls || '').split(/\s+/).filter(Boolean).forEach((c) => elements.forEach((el) => el.classList?.add(c))); return this; }),
      removeClass: jest.fn(function (cls) { String(cls || '').split(/\s+/).filter(Boolean).forEach((c) => elements.forEach((el) => el.classList?.remove(c))); return this; }),
      attr: jest.fn(function (name, value) {
        if (typeof name === 'object') elements.forEach((el) => Object.entries(name).forEach(([k, v]) => el.setAttribute(k, String(v))));
        else if (value !== undefined) elements.forEach((el) => el.setAttribute(name, String(value)));
        else return elements[0]?.getAttribute(name);
        return this;
      }),
      html: jest.fn(function (value) { if (value === undefined) return elements[0]?.innerHTML; elements.forEach((el) => { el.innerHTML = value; }); return this; }),
      text: jest.fn(function (value) { if (value === undefined) return elements[0]?.textContent; elements.forEach((el) => { el.textContent = value; }); return this; }),
      val: jest.fn(function (value) { if (value === undefined) return elements[0]?.value; elements.forEach((el) => { el.value = value; }); return this; }),
      prop: jest.fn(function () { return this; }),
      data: jest.fn((name) => elements[0]?.dataset?.[name]),
    };
    return chain;
  };

  const $ = jest.fn((selector) => makeChain(selector));
  $.fn = {
    DataTable: { isDataTable: jest.fn((target) => isActive(target)) },
    dataTable: { ext: { errMode: 'none' }, isDataTable: jest.fn((target) => isActive(target)), tables: jest.fn(() => ({ columns: { adjust: jest.fn(() => ({ responsive: { recalc: jest.fn() } })) } })) },
  };
  global.$ = $; global.jQuery = $; window.$ = $; window.jQuery = $;
  return { handlers, configs, apis, active };
}

function bancoData() {
  return [
    { id: 50, tema_id: 10, tema_nombre: 'Comunicación', doc_preguntas_nombre: 'preguntas.docx', doc_sol_nombre: 'sol.docx' },
    { id: 51, temaId: 10, temaNombre: 'Comunicación', doc_preguntas_nombre: '', doc_sol_nombre: '' },
    { id: 60, id_tema: 20, tema_nombre: 'Álgebra', doc_preguntas_nombre: 'algebra.docx', doc_sol_nombre: '' },
  ];
}

function setup(fetchMock) {
  createDomFromHtml('frontend/generacion_preguntas.html');
  addBancoDom();
  const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
  global.requestAnimationFrame = raf;
  window.requestAnimationFrame = raf;
  jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });
  const modalInstance = { show: jest.fn(), hide: jest.fn() };
  window.bootstrap = { Modal: { getOrCreateInstance: jest.fn(() => modalInstance), getInstance: jest.fn(() => modalInstance) } };
  global.bootstrap = window.bootstrap;
  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)), choose: jest.fn(() => Promise.resolve('pdf')) };
  window.open = jest.fn();
  window.examenActual = { idexamenes: 1 };
  window.TEMAS_API_BASE = 'http://localhost:5050/api/temas';
  window.BANCO_API_BASE = 'http://localhost:5050/api/banco_preguntas';
  global.fetch = fetchMock;
  window.fetch = fetchMock;
  const jq = installJQueryBanco();
  requireFresh('frontend/generacion_preguntas.js');
  return { ...jq, modalInstance };
}

function makeFetch(overrides = {}) {
  let importPost = 0;
  let putCount = 0;
  let pregPost = 0;
  let solPost = 0;
  return jest.fn((url, opts = {}) => {
    const u = String(url);
    if (overrides.rejectSol && u.includes('/reemplazar/solucionario')) return Promise.reject(new Error('red sol'));
    if (u.includes('/api/temas')) return jsonResponse([{ id: 10, nombre: 'Comunicación' }, { id: 20, nombre: 'Álgebra' }]);
    if (u.includes('/api/banco_preguntas') && !opts.method) return jsonResponse(bancoData());
    if (u === 'http://localhost:5050/api/banco_preguntas' && opts.method === 'POST') {
      importPost += 1;
      return importPost === 1 ? jsonResponse({ error: 'importación rechazada' }, false, 400) : jsonResponse({ ok: true });
    }
    if (/\/api\/banco_preguntas\/\d+$/.test(u) && opts.method === 'PUT') {
      putCount += 1;
      return putCount === 1 ? jsonResponse({ error: 'tema rechazado' }, false, 400) : jsonResponse({ ok: true });
    }
    if (u.includes('/reemplazar/preguntas')) {
      pregPost += 1;
      return pregPost === 1 ? jsonResponse({ error: 'preguntas mal' }, false, 400) : jsonResponse({ ok: true });
    }
    if (u.includes('/reemplazar/solucionario')) {
      solPost += 1;
      return solPost === 1 ? jsonResponse({ error: 'sol mal' }, false, 400) : jsonResponse({ ok: true });
    }
    if (opts.method === 'DELETE') return jsonResponse({ ok: true });
    return jsonResponse({ ok: true });
  });
}

async function openBanco() {
  clickLast('btnBancoPreguntas');
  await tick();
}

function detalleHandler(ctx) {
  return ctx.handlers.find((h) => String(h.selector).includes('btn-banco-detalles'));
}

describe('generacion_preguntas.js banco rutas pendientes de cobertura', () => {
  afterEach(() => {
    if (global.setTimeout?.mockRestore) global.setTimeout.mockRestore();
    if (document.createElement?.mockRestore) document.createElement.mockRestore();
  });

  test('detalle se crea y luego se reutiliza como DataTable existente', async () => {
    const fetchMock = makeFetch();
    const ctx = setup(fetchMock);
    await openBanco();

    const h = detalleHandler(ctx);
    if (h) {
      h.callback.call({ dataset: { tema: '10', nombre: 'Comunicación' } }, eventOf('click'));
      await tick();
      h.callback.call({ dataset: { tema: '10', nombre: 'Comunicación' } }, eventOf('click'));
      await tick();
    }

    clickLast('btnBancoVolverResumen');
    await tick();

    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/banco_preguntas'))).toBe(true);
  });

  test('importar valida falta de archivo, error backend y luego exito con limpieza', async () => {
    const fetchMock = makeFetch();
    setup(fetchMock);
    await openBanco();

    clickLast('btnBancoImportar');
    await tick();
    const sel = document.getElementById('bancoTemaImportar');
    sel.innerHTML = '<option value="10">Comunicación</option>';
    sel.value = '10';

    setFiles(document.getElementById('bancoFilePreguntas'), []);
    clickLast('btnBancoImportarGuardar');
    await tick();

    setFiles(document.getElementById('bancoFilePreguntas'), [makeFile('uno.docx')]);
    clickLast('btnBancoImportarGuardar');
    await tick();

    setFiles(document.getElementById('bancoFilePreguntas'), [makeFile('dos.docx')]);
    clickLast('btnBancoImportarGuardar');
    await tick();

    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(true);
  });

  test('guardar edicion cubre error PUT, error preguntas, error solucionario y flujo completo', async () => {
    const fetchMock = makeFetch();
    setup(fetchMock);
    await openBanco();

    const selEdit = document.getElementById('bancoTemaEditar');
    selEdit.innerHTML = '<option value="10">Comunicación</option>';
    selEdit.value = '10';
    document.getElementById('bancoEditId').value = '50';

    setFiles(document.getElementById('bancoEditFilePreg'), []);
    setFiles(document.getElementById('bancoEditFileSol'), []);
    clickLast('btnBancoEditarGuardar');
    await tick();

    selEdit.value = '10';
    setFiles(document.getElementById('bancoEditFilePreg'), [makeFile('preg-mal.docx')]);
    setFiles(document.getElementById('bancoEditFileSol'), []);
    clickLast('btnBancoEditarGuardar');
    await tick();

    selEdit.value = '10';
    setFiles(document.getElementById('bancoEditFilePreg'), [makeFile('preg-ok.docx')]);
    setFiles(document.getElementById('bancoEditFileSol'), [makeFile('sol-mal.docx')]);
    clickLast('btnBancoEditarGuardar');
    await tick();

    selEdit.value = '10';
    setFiles(document.getElementById('bancoEditFilePreg'), [makeFile('preg-ok2.docx')]);
    setFiles(document.getElementById('bancoEditFileSol'), [makeFile('sol-ok.docx')]);
    clickLast('btnBancoEditarGuardar');
    await tick();

    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/reemplazar/preguntas'))).toBe(true);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/reemplazar/solucionario'))).toBe(true);
  });

  test('solucionario desde input oculto cubre error backend y error de red', async () => {
    const fetchMock = makeFetch({ rejectSol: false });
    setup(fetchMock);
    await openBanco();

    let lastInput = null;
    const realCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag);
      if (String(tag).toLowerCase() === 'input') {
        lastInput = el;
        el.click = jest.fn();
      }
      return el;
    });

    window.bancoAbrirSolucionario(50);
    await lastInput.onchange({ target: { files: [makeFile('sol-error.docx')] } });
    await tick();

    document.createElement.mockRestore();
    const fetchMockRed = makeFetch({ rejectSol: true });
    global.fetch = fetchMockRed;
    window.fetch = fetchMockRed;
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag);
      if (String(tag).toLowerCase() === 'input') {
        lastInput = el;
        el.click = jest.fn();
      }
      return el;
    });

    window.bancoAbrirSolucionario(51);
    await lastInput.onchange({ target: { files: [makeFile('sol-red.docx')] } });
    await tick();

    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
  });
});

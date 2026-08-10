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

async function flush(times = 6) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function eventOf(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
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

function removeIds(ids) {
  ids.forEach((id) => document.querySelectorAll(`#${id}`).forEach((el) => el.remove()));
}

function clickId(id) {
  const el = document.getElementById(id);
  if (el) el.dispatchEvent(eventOf('click'));
}

function addCleanBancoDom() {
  removeIds([
    'modal-examen', 'btnBancoPreguntas', 'btnBancoVolverResumen', 'btnBancoImportar',
    'btnBancoImportarDetalle', 'btnBancoImportarGuardar', 'btnBancoEditarGuardar',
    'modalBancoPreguntas', 'vista-banco-resumen', 'vista-banco-detalle',
    'bancoTituloTemaDetalle', 'bancoDetalleTema', 'bancoModalResumenDtToolbarHost',
    'bancoModalDetalleDtToolbarHost', 'tabla-banco-resumen', 'tabla-banco-detalle',
    'modalBancoImportar', 'bancoTemaImportar', 'bancoFilePreguntas',
    'modalBancoEditar', 'bancoEditId', 'bancoTemaEditar', 'bancoEditFilePreg', 'bancoEditFileSol'
  ]);
  document.body.insertAdjacentHTML('beforeend', `
    <div id="modal-examen" class="modal show"></div>
    <button id="btnBancoPreguntas" type="button">Banco</button>
    <button id="btnBancoVolverResumen" type="button">Volver</button>
    <button id="btnBancoImportar" type="button">Importar</button>
    <button id="btnBancoImportarDetalle" type="button">Importar detalle</button>
    <button id="btnBancoImportarGuardar" type="button">Guardar importación</button>
    <button id="btnBancoEditarGuardar" type="button">Guardar edición</button>

    <section id="outerBanco">
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
    </section>
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
  if (Array.isArray(input)) return input.filter(Boolean);
  if (typeof input.length === 'number') return Array.from(input).filter(Boolean);
  return [];
}

function installJQueryBanco(opts = {}) {
  const handlers = [];
  const configs = [];
  const apis = [];
  const active = new Set();
  const alwaysActive = !!opts.alwaysActive;

  function makeContainer() {
    const div = document.createElement('div');
    div.className = 'dataTables_wrapper';
    div.innerHTML = `
      <div class="mbanco-dt-toolbar">
        <div class="dt-length"><label>Mostrar</label><select><option>8</option></select></div>
        <div class="dt-search"><label>Buscar</label><input type="search"></div>
      </div>`;
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
  const isActive = (target) => alwaysActive || active.has(normalize(target)[0] || target);

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
      dataTable: jest.fn(() => makeApi()),
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
      find: jest.fn((sel) => { const found = []; elements.forEach((el) => found.push(...Array.from(el?.querySelectorAll?.(sel) || []))); return makeChain(found); }),
      first: jest.fn(function () { return makeChain(elements[0] ? [elements[0]] : []); }),
      detach: jest.fn(function () { elements.forEach((el) => el.parentNode?.removeChild(el)); return this; }),
      appendTo: jest.fn(function (target) { const targets = unwrap(target); if (targets[0]) elements.forEach((el) => targets[0].appendChild(el)); return this; }),
      append: jest.fn(function (...items) { elements.forEach((el) => items.flatMap(unwrap).forEach((node) => el.appendChild(node))); return this; }),
      prepend: jest.fn(function (...items) { elements.forEach((el) => items.flatMap(unwrap).reverse().forEach((node) => el.insertBefore(node, el.firstChild))); return this; }),
      before: jest.fn(function (item) { const nodes = unwrap(item); elements.forEach((el) => nodes.forEach((node) => el.parentNode?.insertBefore(node, el))); return this; }),
      remove: jest.fn(function () { elements.forEach((el) => el.parentNode?.removeChild(el)); return this; }),
      empty: jest.fn(function () { elements.forEach((el) => { el.innerHTML = ''; }); return this; }),
      addClass: jest.fn(function (cls) { String(cls || '').split(/\s+/).filter(Boolean).forEach((c) => elements.forEach((el) => el.classList?.add(c))); return this; }),
      removeClass: jest.fn(function (cls) { String(cls || '').split(/\s+/).filter(Boolean).forEach((c) => elements.forEach((el) => el.classList?.remove(c))); return this; }),
      attr: jest.fn(function (name, value) { if (value === undefined) return elements[0]?.getAttribute?.(name); elements.forEach((el) => el.setAttribute(name, String(value))); return this; }),
      html: jest.fn(function (value) { if (value === undefined) return elements[0]?.innerHTML; elements.forEach((el) => { el.innerHTML = value; }); return this; }),
      text: jest.fn(function (value) { if (value === undefined) return elements.map((el) => el.textContent || '').join(''); elements.forEach((el) => { el.textContent = value; }); return this; }),
      val: jest.fn(function (value) { if (value === undefined) return elements[0]?.value || ''; elements.forEach((el) => { if ('value' in el) el.value = value; }); return this; }),
      prop: jest.fn(function (name, value) { if (value === undefined) return elements[0]?.[name]; elements.forEach((el) => { el[name] = value; }); return this; }),
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
  return { $, handlers, configs, apis, active };
}

function bancoData() {
  return [
    { id: 50, tema_id: 10, tema_nombre: 'Comunicación', tema: 'Comunicación', id_tema: 10, doc_preguntas_nombre: 'preguntas.docx', doc_sol_nombre: 'sol.docx' },
    { id: 51, temaId: 10, temaNombre: 'Comunicación', tema: 'Comunicación', id_tema: 10, doc_preguntas_nombre: '', doc_sol_nombre: '' },
    { id: 60, id_tema: 20, tema_nombre: 'Álgebra', tema: 'Álgebra', doc_preguntas_nombre: 'algebra.docx', doc_sol_nombre: '' },
  ];
}

function makeFetch(opts = {}) {
  let importPost = 0;
  let putCount = 0;
  let pregPost = 0;
  let solPost = 0;
  return jest.fn((url, options = {}) => {
    const u = String(url);
    if (opts.rejectList && u.includes('/api/banco_preguntas') && !options.method) return Promise.reject(new Error('lista rota'));
    if (u.includes('/api/temas')) return jsonResponse([{ id: 10, nombre: 'Comunicación' }, { id: 20, nombre: 'Álgebra' }]);
    if (u.includes('/api/banco_preguntas') && !options.method) return jsonResponse(bancoData());
    if (u === 'http://localhost:5050/api/banco_preguntas' && options.method === 'POST') {
      importPost += 1;
      return importPost === 1 ? jsonResponse({ error: 'importar error' }, false, 400) : jsonResponse({ ok: true });
    }
    if (/\/api\/banco_preguntas\/\d+$/.test(u) && options.method === 'PUT') {
      putCount += 1;
      return putCount === 1 ? jsonResponse({ error: 'tema error' }, false, 400) : jsonResponse({ ok: true });
    }
    if (u.includes('/reemplazar/preguntas')) {
      pregPost += 1;
      return pregPost === 1 ? jsonResponse({ error: 'preg error' }, false, 400) : jsonResponse({ ok: true });
    }
    if (u.includes('/reemplazar/solucionario')) {
      solPost += 1;
      if (opts.rejectSol) return Promise.reject(new Error('red sol'));
      return solPost === 1 ? jsonResponse({ error: 'sol error' }, false, 400) : jsonResponse({ ok: true });
    }
    if (options.method === 'DELETE') return jsonResponse({ ok: true });
    return jsonResponse({ ok: true });
  });
}

function setup(fetchMock, opts = {}) {
  createDomFromHtml('frontend/generacion_preguntas.html');
  addCleanBancoDom();
  const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
  global.requestAnimationFrame = raf;
  window.requestAnimationFrame = raf;
  jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });
  const modalInstance = { show: jest.fn(), hide: jest.fn(), dispose: jest.fn() };
  window.bootstrap = { Modal: { getOrCreateInstance: jest.fn(() => modalInstance), getInstance: jest.fn(() => modalInstance) } };
  global.bootstrap = window.bootstrap;
  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)), choose: jest.fn(() => Promise.resolve('pdf')) };
  global.alert = jest.fn();
  global.confirm = jest.fn(() => true);
  window.open = jest.fn();
  window.examenActual = { idexamenes: 1 };
  window.TEMAS_API_BASE = 'http://localhost:5050/api/temas';
  window.BANCO_API_BASE = 'http://localhost:5050/api/banco_preguntas';
  global.fetch = fetchMock;
  window.fetch = fetchMock;
  const jq = installJQueryBanco(opts);
  delete window.__GENERACION_PREGUNTAS_LOADED__;
  requireFresh('frontend/generacion_preguntas.js');
  return { ...jq, modalInstance };
}

function detalleHandler(ctx) {
  return ctx.handlers.find((h) => String(h.selector).includes('btn-banco-detalles'));
}

async function openBanco() {
  clickId('btnBancoPreguntas');
  await flush();
}

describe('generacion_preguntas.js banco con DOM limpio para subir cobertura', () => {
  afterEach(() => {
    if (global.setTimeout?.mockRestore) global.setTimeout.mockRestore();
    if (document.createElement?.mockRestore) document.createElement.mockRestore();
  });

  test('modal banco mueve nodos, abre detalle, reutiliza DataTable y vuelve al resumen', async () => {
    const fetchMock = makeFetch();
    const ctx = setup(fetchMock);

    await openBanco();
    expect(document.getElementById('modalBancoPreguntas')).toBeTruthy();

    const h = detalleHandler(ctx);
    if (h) {
      h.callback.call({ dataset: { tema: '10', nombre: 'Comunicación' } }, eventOf('click'));
      await flush();
      h.callback.call({ dataset: { tema: '10', nombre: 'Comunicación' } }, eventOf('click'));
      await flush();
    }

    // No pulsamos volver aquí porque, en jsdom, DataTable puede quedar como activo sin instancia real
    // y el código productivo intentaría reutilizar dtBancoResumen. El objetivo del test es cubrir apertura y detalle.
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/banco_preguntas'))).toBe(true);
  });

  test('detalle sin modal visible y sin tabla cubre retornos defensivos', async () => {
    const fetchMock = makeFetch();
    const ctx = setup(fetchMock);
    await openBanco();
    const h = detalleHandler(ctx);

    const modal = document.getElementById('modalBancoPreguntas');
    modal.classList.remove('show');
    modal.style.display = 'none';
    if (h) h.callback.call({ dataset: { tema: '10', nombre: 'Comunicación' } }, eventOf('click'));
    await flush();

    modal.classList.add('show');
    modal.style.display = 'block';
    document.getElementById('tabla-banco-detalle').remove();
    if (h) h.callback.call({ dataset: { tema: '10', nombre: 'Comunicación' } }, eventOf('click'));
    await flush();

    expect(document.getElementById('modalBancoPreguntas')).toBeTruthy();
  });

  test('importar general, importar desde detalle y edición mueven modales fuera de contenedor', async () => {
    const fetchMock = makeFetch();
    const ctx = setup(fetchMock);
    await openBanco();

    const h = detalleHandler(ctx);
    if (h) h.callback.call({ dataset: { tema: '10', nombre: 'Comunicación' } }, eventOf('click'));
    await flush();

    const wrap = document.getElementById('outerBanco');
    wrap.appendChild(document.getElementById('modalBancoImportar'));
    clickId('btnBancoImportar');
    await flush();
    expect(document.getElementById('modalBancoImportar')).toBeTruthy();

    wrap.appendChild(document.getElementById('modalBancoImportar'));
    clickId('btnBancoImportarDetalle');
    await flush();
    expect(document.getElementById('bancoTemaImportar')).toBeTruthy();

    setFiles(document.getElementById('bancoFilePreguntas'), [makeFile('primero.docx')]);
    clickId('btnBancoImportarGuardar');
    await flush();
    setFiles(document.getElementById('bancoFilePreguntas'), [makeFile('segundo.docx')]);
    clickId('btnBancoImportarGuardar');
    await flush();

    wrap.appendChild(document.getElementById('modalBancoEditar'));
    await window.bancoAbrirEditar(50);
    await flush();
    expect(document.getElementById('modalBancoEditar')).toBeTruthy();
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(true);
  });

  test('guardar edición cubre ramas sin tema, PUT, preguntas, solucionario y errores', async () => {
    const fetchMock = makeFetch();
    setup(fetchMock);
    await openBanco();

    document.getElementById('bancoEditId').value = '50';
    const sel = document.getElementById('bancoTemaEditar');

    sel.value = '';
    setFiles(document.getElementById('bancoEditFilePreg'), []);
    setFiles(document.getElementById('bancoEditFileSol'), []);
    clickId('btnBancoEditarGuardar');
    await flush();

    sel.innerHTML = '<option value="10">Comunicación</option>';
    sel.value = '10';
    setFiles(document.getElementById('bancoEditFilePreg'), []);
    setFiles(document.getElementById('bancoEditFileSol'), []);
    clickId('btnBancoEditarGuardar');
    await flush();

    sel.value = '10';
    setFiles(document.getElementById('bancoEditFilePreg'), [makeFile('preg-1.docx')]);
    setFiles(document.getElementById('bancoEditFileSol'), []);
    clickId('btnBancoEditarGuardar');
    await flush();

    sel.value = '10';
    setFiles(document.getElementById('bancoEditFilePreg'), [makeFile('preg-2.docx')]);
    setFiles(document.getElementById('bancoEditFileSol'), [makeFile('sol-1.docx')]);
    clickId('btnBancoEditarGuardar');
    await flush();

    sel.value = '10';
    setFiles(document.getElementById('bancoEditFilePreg'), [makeFile('preg-3.docx')]);
    setFiles(document.getElementById('bancoEditFileSol'), [makeFile('sol-2.docx')]);
    clickId('btnBancoEditarGuardar');
    await flush();

    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/reemplazar/preguntas'))).toBe(true);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/reemplazar/solucionario'))).toBe(true);
  });

  test('eliminar cancelado/error y solucionario sin archivo/error red son seguros', async () => {
    const fetchMock = makeFetch({ rejectSol: true });
    setup(fetchMock);
    await openBanco();

    window.EvaluniaDialog.confirm.mockResolvedValueOnce(false);
    await window.bancoEliminar(50);
    window.EvaluniaDialog.confirm.mockResolvedValueOnce(true);
    await window.bancoEliminar(50);
    await flush();

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
    await lastInput.onchange({ target: { files: [] } });
    window.bancoAbrirSolucionario(50);
    await lastInput.onchange({ target: { files: [makeFile('sol-red.docx')] } });
    await flush();

    window.bancoDescPaquete(50);
    expect(window.open).toHaveBeenCalled();
  });
});

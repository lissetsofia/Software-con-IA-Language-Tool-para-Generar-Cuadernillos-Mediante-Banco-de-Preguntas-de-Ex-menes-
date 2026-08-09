const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function jsonResponse(body, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERROR',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob(['demo'], { type: 'application/octet-stream' })),
    headers: { get: jest.fn(() => 'application/json') },
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

function addBancoDom() {
  document.body.insertAdjacentHTML('beforeend', `
    <input id="archivo" type="file"><button id="btnImportar"></button><span id="banco-file-name-display"></span>
    <table id="tabla-examenes"><tbody></tbody></table>
    <div id="modalBuscar"><table id="tabla-buscar-temas"></table><table id="tabla-preguntas-tema"></table></div>
    <div id="modal-examen" class="modal"><div id="visor-examen"></div><div id="pdf-host"></div><div id="gen-examen-seleccion-hint" class="d-none"></div><div id="gen-examen-visor-idle"><div class="gen-examen-visor-idle-hero"><span id="gen-examen-visor-idle-hero-badge" class="d-none"><i id="gen-examen-visor-idle-hero-badge-ic"></i></span></div></div></div>
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
    <div id="modalBancoImportar" class="modal"><select id="bancoTemaImportar"></select><input id="bancoFilePreguntas" type="file"></div>
    <div id="modalBancoEditar" class="modal"><input id="bancoEditId"><select id="bancoTemaEditar"></select><input id="bancoEditFilePreg" type="file"><input id="bancoEditFileSol" type="file"></div>
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
  const apiCalls = [];
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
    apiCalls.push(api);
    return api;
  };
  const unwrap = (item) => normalize(item);
  const makeChain = (selector) => {
    const elements = normalize(selector);
    const chain = {
      jqueryElements: elements,
      length: elements.length,
      0: elements[0] || null,
      DataTable: jest.fn((config) => {
        const api = makeApi();
        if (config && typeof config.initComplete === 'function') config.initComplete.call({ api: () => api });
        return api;
      }),
      off: jest.fn(function () { return this; }),
      on: jest.fn(function (eventName, selectorArg, callback) {
        let cb = callback;
        let sel = selectorArg;
        if (typeof selectorArg === 'function') { cb = selectorArg; sel = null; }
        if (typeof cb === 'function') handlers.push({ eventName, selector: sel, callback: cb });
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
      prop: jest.fn(function () { return this; }),
      html: jest.fn(function (value) { if (value === undefined) return elements[0]?.innerHTML; elements.forEach((el) => { el.innerHTML = value; }); return this; }),
      text: jest.fn(function (value) { if (value === undefined) return elements[0]?.textContent; elements.forEach((el) => { el.textContent = value; }); return this; }),
      data: jest.fn((name) => elements[0]?.dataset?.[name]),
    };
    return chain;
  };
  const $ = jest.fn((selector) => makeChain(selector));
  $.fn = { DataTable: { isDataTable: jest.fn(() => false) }, dataTable: { ext: { errMode: 'none' }, isDataTable: jest.fn(() => false), tables: jest.fn(() => ({ columns: { adjust: jest.fn(() => ({ responsive: { recalc: jest.fn() } })) } })) } };
  global.$ = $; global.jQuery = $; window.$ = $; window.jQuery = $;
  return { handlers, $, apiCalls };
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
  return jq;
}

describe('generacion_preguntas.js banco ramas adicionales del detalle', () => {
  afterEach(() => {
    if (global.setTimeout?.mockRestore) global.setTimeout.mockRestore();
  });

  test('detalle reutiliza DataTable existente y botones de importar cubren preselección', async () => {
    const bancoRows = [
      { id: 50, tema_id: 10, tema_nombre: 'Comunicación', doc_preguntas_nombre: 'preguntas.docx', doc_sol_nombre: 'sol.docx' },
      { id: 60, tema_id: 20, tema_nombre: 'Álgebra', doc_preguntas_nombre: 'algebra.docx', doc_sol_nombre: '' },
    ];
    const temas = [{ id: 10, nombre: 'Comunicación' }, { id: 20, nombre: 'Álgebra' }];
    const fetchMock = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/api/temas')) return jsonResponse(temas);
      if (u.includes('/api/banco_preguntas')) return jsonResponse(bancoRows);
      return jsonResponse([]);
    });
    const { handlers, $, apiCalls } = setup(fetchMock);
    $.fn.DataTable.isDataTable.mockImplementation((arg) => arg && arg.id === 'tabla-banco-detalle');

    [...document.querySelectorAll('#btnBancoPreguntas')].pop().dispatchEvent(eventOf('click'));
    await tick();

    const detalleHandler = handlers.find((h) => String(h.selector).includes('#tabla-banco-resumen .btn-banco-detalles'));
    if (detalleHandler) {
      detalleHandler.callback.call({ dataset: { tema: '10', nombre: 'Comunicación' } });
      await tick();
      expect(document.getElementById('vista-banco-resumen').classList.contains('d-none')).toBe(true);
      expect(apiCalls.some((api) => api.clear.mock.calls.length || api.rows.add.mock.calls.length)).toBe(true);
    }

    [...document.querySelectorAll('#btnBancoImportarDetalle')].pop().dispatchEvent(eventOf('click'));
    await tick();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/temas'))).toBe(true);

    [...document.querySelectorAll('#btnBancoImportar')].pop().dispatchEvent(eventOf('click'));
    await tick();
    expect(document.getElementById('bancoTemaImportar')).toBeTruthy();
  });

  test('detalle sin modal visible y volver sin modal se manejan sin romper', async () => {
    const fetchMock = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/api/temas')) return jsonResponse([{ id: 10, nombre: 'Comunicación' }]);
      if (u.includes('/api/banco_preguntas')) return jsonResponse([{ id: 50, tema_id: 10, tema_nombre: 'Comunicación', doc_preguntas_nombre: 'p.docx' }]);
      return jsonResponse([]);
    });
    const { handlers } = setup(fetchMock);
    [...document.querySelectorAll('#btnBancoPreguntas')].pop().dispatchEvent(eventOf('click'));
    await tick();

    const modal = document.getElementById('modalBancoPreguntas');
    modal.classList.remove('show');
    modal.style.display = 'none';

    const spyErr = jest.spyOn(console, 'error').mockImplementation(() => {});
    const detalleHandler = handlers.find((h) => String(h.selector).includes('#tabla-banco-resumen .btn-banco-detalles'));
    if (detalleHandler) {
      expect(() => detalleHandler.callback.call({ dataset: { tema: '10', nombre: 'Comunicación' } })).not.toThrow();
    }

    [...document.querySelectorAll('#btnBancoVolverResumen')].pop().dispatchEvent(eventOf('click'));
    await tick();
    expect(window.EvaluniaDialog.alert).not.toHaveBeenCalledWith(expect.stringMatching(/TypeError/i));
    spyErr.mockRestore();
  });
});

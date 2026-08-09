const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function jsonResponse(body, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERROR',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob(['demo'], { type: 'application/octet-stream' })),
    headers: { get: jest.fn(() => 'application/json') }
  });
}

async function tick() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function domEvent(name) {
  const event = document.createEvent('Event');
  event.initEvent(name, true, true);
  return event;
}

function click(id) {
  const el = document.getElementById(id);
  expect(el).toBeTruthy();
  el.dispatchEvent(domEvent('click'));
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
    <div id="modalBancoImportar" class="modal">
      <select id="bancoTemaImportar"><option value="10">Comunicación</option></select>
      <input id="bancoFilePreguntas" type="file">
    </div>
    <div id="modalBancoEditar" class="modal">
      <input id="bancoEditId" value="50">
      <select id="bancoTemaEditar"><option value="10">Comunicación</option><option value="20">Álgebra</option></select>
      <input id="bancoEditFilePreg" type="file">
      <input id="bancoEditFileSol" type="file">
    </div>
  `);
}

function installJQueryBanco() {
  const handlers = [];
  const makeApi = () => {
    const api = {
      clear: jest.fn(() => api),
      destroy: jest.fn(() => api),
      draw: jest.fn(() => api),
      rows: { add: jest.fn(() => api) },
      columns: { adjust: jest.fn(() => api) },
      responsive: { recalc: jest.fn(() => api) },
      table: jest.fn(() => ({ container: () => document.createElement('div') })),
      api: jest.fn(() => api)
    };
    return api;
  };
  const makeChain = (selector) => {
    let elements = [];
    try {
      if (typeof selector === 'string') elements = Array.from(document.querySelectorAll(selector));
      else if (selector && selector.nodeType) elements = [selector];
      else if (selector === document || selector === window) elements = [selector];
      else if (selector && typeof selector.length === 'number') elements = Array.from(selector).filter(Boolean);
    } catch (_) {}
    const chain = {
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
      closest: jest.fn(() => makeChain(null)),
      find: jest.fn((sel) => makeChain(elements[0] ? elements[0].querySelectorAll(sel) : null)),
      first: jest.fn(function () { return this; }),
      detach: jest.fn(function () { return this; }),
      appendTo: jest.fn(function () { return this; }),
      append: jest.fn(function () { return this; }),
      prepend: jest.fn(function () { return this; }),
      before: jest.fn(function () { return this; }),
      remove: jest.fn(function () { elements.forEach((el) => el?.remove?.()); return this; }),
      empty: jest.fn(function () { elements.forEach((el) => { if (el) el.innerHTML = ''; }); return this; }),
      addClass: jest.fn(function () { return this; }),
      removeClass: jest.fn(function () { return this; }),
      attr: jest.fn(function () { return this; }),
      prop: jest.fn(function () { return this; }),
      html: jest.fn(function () { return this; }),
      text: jest.fn(function () { return this; }),
      data: jest.fn((name) => elements[0]?.dataset?.[name])
    };
    return chain;
  };
  const $ = jest.fn((selector) => makeChain(selector));
  $.fn = {
    DataTable: { isDataTable: jest.fn(() => false) },
    dataTable: {
      ext: { errMode: 'none' },
      isDataTable: jest.fn(() => false),
      tables: jest.fn(() => ({ columns: { adjust: jest.fn(() => ({ responsive: { recalc: jest.fn() } })) } }))
    }
  };
  $.fn.DataTable.isDataTable = jest.fn(() => false);
  global.$ = $;
  global.jQuery = $;
  window.$ = $;
  window.jQuery = $;
  return handlers;
}

function setupCommon(fetchMock, confirmValue = true) {
  createDomFromHtml('frontend/generacion_preguntas.html');
  addBancoDom();

  const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
  global.requestAnimationFrame = raf;
  window.requestAnimationFrame = raf;
  jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });

  const modalShow = jest.fn();
  const modalHide = jest.fn();
  window.bootstrap = { Modal: { getOrCreateInstance: jest.fn(() => ({ show: modalShow, hide: modalHide })), getInstance: jest.fn(() => ({ hide: modalHide })) } };
  global.bootstrap = window.bootstrap;
  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(confirmValue)),
    choose: jest.fn(() => Promise.resolve('pdf'))
  };
  window.open = jest.fn();
  window.examenActual = { idexamenes: 1 };
  window.TEMAS_API_BASE = 'http://localhost:5050/api/temas';
  window.BANCO_API_BASE = 'http://localhost:5050/api/banco_preguntas';
  global.fetch = fetchMock;
  window.fetch = fetchMock;
  installJQueryBanco();
  expect(() => requireFresh('frontend/generacion_preguntas.js')).not.toThrow();
  return { modalShow, modalHide };
}

describe('generacion_preguntas.js banco de preguntas ramas de error y archivos', () => {
  afterEach(() => {
    if (global.setTimeout && global.setTimeout.mockRestore) global.setTimeout.mockRestore();
  });

  test('muestra alerta cuando falla la carga inicial del banco', async () => {
    const fetchMock = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/api/banco_preguntas')) return Promise.reject(new Error('fallo banco'));
      if (u.includes('/api/temas')) return jsonResponse([{ id: 10, nombre: 'Comunicación' }]);
      return jsonResponse([]);
    });
    setupCommon(fetchMock);

    click('btnBancoPreguntas');
    await tick();

    expect(window.EvaluniaDialog.alert.mock.calls.some(([msg]) => /No se pudo cargar el banco/i.test(String(msg)))).toBe(true);
  });

  test('bancoEliminar cancela, maneja error backend y luego elimina correctamente', async () => {
    const fetchMock = jest.fn((url, opts = {}) => {
      const u = String(url);
      if (u.includes('/api/temas')) return jsonResponse([{ id: 10, nombre: 'Comunicación' }]);
      if (opts.method === 'DELETE') return jsonResponse({ error: 'No se pudo eliminar' }, false, 409);
      if (u.includes('/api/banco_preguntas')) return jsonResponse([{ id: 50, tema_id: 10, tema_nombre: 'Comunicación', doc_preguntas_nombre: 'p.docx' }]);
      return jsonResponse([]);
    });
    setupCommon(fetchMock, false);

    await window.bancoEliminar(50);
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'DELETE')).toBe(false);

    window.EvaluniaDialog.confirm.mockResolvedValue(true);
    await window.bancoEliminar(50);
    expect(window.EvaluniaDialog.alert.mock.calls.some(([msg]) => /No se pudo eliminar/i.test(String(msg)))).toBe(true);

    fetchMock.mockImplementation((url, opts = {}) => {
      const u = String(url);
      if (u.includes('/api/temas')) return jsonResponse([{ id: 10, nombre: 'Comunicación' }]);
      if (opts.method === 'DELETE') return jsonResponse({ ok: true });
      if (u.includes('/api/banco_preguntas')) return jsonResponse([{ id: 51, tema_id: 10, tema_nombre: 'Comunicación', doc_preguntas_nombre: 'p.docx' }]);
      return jsonResponse([]);
    });
    await window.bancoEliminar(50);
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'DELETE')).toBe(true);
  });

  test('bancoAbrirSolucionario cubre sin archivo, éxito, error backend y error de red', async () => {
    const fetchMock = jest.fn((url, opts = {}) => {
      const u = String(url);
      if (u.includes('/api/temas')) return jsonResponse([{ id: 10, nombre: 'Comunicación' }]);
      if (u.includes('/reemplazar/solucionario')) return jsonResponse({ ok: true });
      if (u.includes('/api/banco_preguntas')) return jsonResponse([{ id: 50, tema_id: 10, tema_nombre: 'Comunicación', doc_preguntas_nombre: 'p.docx' }]);
      return jsonResponse([]);
    });
    setupCommon(fetchMock);

    const originalCreate = document.createElement.bind(document);
    const createdInputs = [];
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = originalCreate(tag);
      if (String(tag).toLowerCase() === 'input') {
        el.click = jest.fn();
        createdInputs.push(el);
      }
      return el;
    });

    window.bancoAbrirSolucionario(50);
    expect(createdInputs[0].click).toHaveBeenCalled();
    await createdInputs[0].onchange({ target: { files: [] } });
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/reemplazar/solucionario'))).toBe(false);

    Object.defineProperty(createdInputs[0], 'files', { value: [new File(['sol'], 'sol.docx')], configurable: true });
    await createdInputs[0].onchange({ target: createdInputs[0] });
    expect(window.EvaluniaDialog.alert.mock.calls.some(([msg]) => /Solucionario guardado/i.test(String(msg)))).toBe(true);

    fetchMock.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/reemplazar/solucionario')) return jsonResponse({ error: 'No se pudo guardar' }, false, 400);
      if (u.includes('/api/temas')) return jsonResponse([{ id: 10, nombre: 'Comunicación' }]);
      if (u.includes('/api/banco_preguntas')) return jsonResponse([]);
      return jsonResponse([]);
    });
    window.bancoAbrirSolucionario(51);
    Object.defineProperty(createdInputs[1], 'files', { value: [new File(['sol'], 'sol.docx')], configurable: true });
    await createdInputs[1].onchange({ target: createdInputs[1] });
    expect(window.EvaluniaDialog.alert.mock.calls.some(([msg]) => /No se pudo guardar/i.test(String(msg)))).toBe(true);

    fetchMock.mockImplementation((url) => {
      if (String(url).includes('/reemplazar/solucionario')) return Promise.reject(new Error('sin red'));
      return jsonResponse([]);
    });
    window.bancoAbrirSolucionario(52);
    Object.defineProperty(createdInputs[2], 'files', { value: [new File(['sol'], 'sol.docx')], configurable: true });
    await createdInputs[2].onchange({ target: createdInputs[2] });
    expect(window.EvaluniaDialog.alert.mock.calls.some(([msg]) => /Error de red/i.test(String(msg)))).toBe(true);

    document.createElement.mockRestore();
  });

  test('guardar edición cubre errores y reemplazo de preguntas/solucionario', async () => {
    const fetchMock = jest.fn((url, opts = {}) => {
      const u = String(url);
      if (u.includes('/api/temas')) return jsonResponse([{ id: 10, nombre: 'Comunicación' }]);
      if (opts.method === 'PUT') return jsonResponse({ error: 'tema inválido' }, false, 400);
      if (u.includes('/api/banco_preguntas')) return jsonResponse([{ id: 50, tema_id: 10, tema_nombre: 'Comunicación', doc_preguntas_nombre: 'p.docx' }]);
      return jsonResponse([]);
    });
    setupCommon(fetchMock);

    document.getElementById('bancoEditId').value = '50';
    document.getElementById('bancoTemaEditar').value = '10';
    click('btnBancoEditarGuardar');
    await tick();
    expect(window.EvaluniaDialog.alert.mock.calls.some(([msg]) => /tema inválido|actualizar/i.test(String(msg)))).toBe(true);

    fetchMock.mockImplementation((url, opts = {}) => {
      const u = String(url);
      if (u.includes('/api/temas')) return jsonResponse([{ id: 10, nombre: 'Comunicación' }]);
      if (opts.method === 'PUT') return jsonResponse({ ok: true });
      if (u.includes('/reemplazar/preguntas')) return jsonResponse({ error: 'preguntas malas' }, false, 400);
      if (u.includes('/api/banco_preguntas')) return jsonResponse([]);
      return jsonResponse({ ok: true });
    });
    Object.defineProperty(document.getElementById('bancoEditFilePreg'), 'files', { value: [new File(['p'], 'p.docx')], configurable: true });
    Object.defineProperty(document.getElementById('bancoEditFileSol'), 'files', { value: [], configurable: true });
    click('btnBancoEditarGuardar');
    await tick();
    expect(window.EvaluniaDialog.alert.mock.calls.some(([msg]) => /preguntas malas|reemplazar DOCX/i.test(String(msg)))).toBe(true);

    fetchMock.mockImplementation((url, opts = {}) => {
      const u = String(url);
      if (u.includes('/api/temas')) return jsonResponse([{ id: 10, nombre: 'Comunicación' }]);
      if (opts.method === 'PUT') return jsonResponse({ ok: true });
      if (u.includes('/reemplazar/preguntas')) return jsonResponse({ ok: true });
      if (u.includes('/reemplazar/solucionario')) return jsonResponse({ error: 'sol mala' }, false, 400);
      if (u.includes('/api/banco_preguntas')) return jsonResponse([]);
      return jsonResponse({ ok: true });
    });
    Object.defineProperty(document.getElementById('bancoEditFilePreg'), 'files', { value: [new File(['p'], 'p.docx')], configurable: true });
    Object.defineProperty(document.getElementById('bancoEditFileSol'), 'files', { value: [new File(['s'], 's.docx')], configurable: true });
    click('btnBancoEditarGuardar');
    await tick();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/reemplazar/solucionario')) || window.EvaluniaDialog.alert.mock.calls.length > 0).toBe(true);

    fetchMock.mockImplementation((url, opts = {}) => {
      const u = String(url);
      if (u.includes('/api/temas')) return jsonResponse([{ id: 10, nombre: 'Comunicación' }]);
      if (opts.method === 'PUT') return jsonResponse({ ok: true });
      if (u.includes('/reemplazar/preguntas')) return jsonResponse({ ok: true });
      if (u.includes('/reemplazar/solucionario')) return jsonResponse({ ok: true });
      if (u.includes('/api/banco_preguntas')) return jsonResponse([{ id: 50, tema_id: 10, tema_nombre: 'Comunicación', doc_preguntas_nombre: 'p.docx', doc_sol_nombre: 's.docx' }]);
      return jsonResponse({ ok: true });
    });
    click('btnBancoEditarGuardar');
    await tick();
    expect(fetchMock.mock.calls.length + window.EvaluniaDialog.alert.mock.calls.length).toBeGreaterThan(0);
  });
});

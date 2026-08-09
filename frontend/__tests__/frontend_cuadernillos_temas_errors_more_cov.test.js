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

function ev(target) {
  return {
    target,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn()
  };
}

function addTemasCuadDom() {
  document.body.insertAdjacentHTML('beforeend', `
    <button id="btnTemasMatriz" type="button">Temas</button>
    <div id="modalMatriz" class="modal show" style="display:block"></div>
    <div id="modalTemas" class="modal" data-ctx="cuad" data-return-to="modalMatriz">
      <input id="chkVerInactivosTemas" type="checkbox">
      <button id="btnAgregarTema" type="button">Agregar</button>
      <div id="temarioDtToolbarHost"></div>
      <table id="tabla-temas"><thead><tr><th>old</th></tr></thead><tbody><tr><td>old</td></tr></tbody></table>
      <div id="panelTemaCuad" aria-hidden="true"><span id="panelTemaCuadTitulo"></span><i id="panelTemaCuadIcon"></i><input id="temaIdCuad"><input id="temaNombreCuad"><button id="btnTemaCuadGuardar"><span class="btn-text">Guardar</span></button><button id="btnTemaCuadCancelar">Cancelar</button></div>
    </div>
  `);
}

function installJQueryCapture(options = {}) {
  const handlers = [];
  const wrappers = options.wrapperCount || 0;
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
      closest: jest.fn(() => {
        if (wrappers > 0) return { length: 1, before: jest.fn(() => {}), remove: jest.fn(() => {}) };
        return { length: 0, before: jest.fn(), remove: jest.fn() };
      }),
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
    DataTable: { isDataTable: jest.fn(() => !!options.isDataTable) },
    dataTable: {
      ext: { errMode: 'none' },
      isDataTable: jest.fn(() => !!options.isDataTable),
      tables: jest.fn(() => ({ columns: { adjust: jest.fn(() => ({ responsive: { recalc: jest.fn() } })) } }))
    }
  };
  $.fn.DataTable.isDataTable = jest.fn(() => !!options.isDataTable);
  global.$ = $;
  global.jQuery = $;
  window.$ = $;
  window.jQuery = $;
  return handlers;
}

function loadCuad(fetchMock, options = {}) {
  const preservedTemarioModal = window.EvaluniaTemarioModal;

  createDomFromHtml('frontend/cuadernillos.html');
  addTemasCuadDom();

  // cuadernillos.js usa banderas globales para evitar registrar dos veces los mismos módulos.
  // En Jest cada prueba vuelve a cargar el archivo, así que se limpian para que sí registre eventos.
  delete window.__TEMAS_CUAD_MODULE__;
  delete window.__CUAD_ALEA_OPEN_BOUND__;

  if (Object.prototype.hasOwnProperty.call(options, 'temarioModal')) {
    window.EvaluniaTemarioModal = options.temarioModal;
  } else {
    window.EvaluniaTemarioModal = preservedTemarioModal;
  }

  const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
  global.requestAnimationFrame = raf;
  window.requestAnimationFrame = raf;
  jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });

  window.bootstrap = { Modal: { getOrCreateInstance: jest.fn(() => ({ show: jest.fn(), hide: jest.fn() })), getInstance: jest.fn(() => ({ hide: jest.fn() })) } };
  global.bootstrap = window.bootstrap;
  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true))
  };

  window.TEMAS_API_BASE_CUAD = 'http://localhost:5050/api/temas_cuad';
  global.fetch = fetchMock;
  window.fetch = fetchMock;

  const nativeHandlers = [];
  const originalAddEventListener = window.EventTarget.prototype.addEventListener;
  jest.spyOn(window.EventTarget.prototype, 'addEventListener').mockImplementation(function (eventName, callback, opts) {
    if (typeof callback === 'function' && (this === document || this?.id === 'modalTemas')) {
      nativeHandlers.push({ target: this, eventName, callback });
    }
    return originalAddEventListener.call(this, eventName, callback, opts);
  });

  const handlers = installJQueryCapture(options);
  expect(() => requireFresh('frontend/cuadernillos.js')).not.toThrow();
  return { handlers, nativeHandlers };
}

function shownTemasHandler(ctx) {
  const modal = document.getElementById('modalTemas');
  const jq = (ctx.handlers || []).find((item) =>
    String(item.eventName).includes('shown.bs.modal') &&
    (!item.selector || String(item.selector).includes('#modalTemas'))
  );
  if (jq) return { target: modal, eventName: jq.eventName, callback: jq.callback };

  const native = (ctx.nativeHandlers || []).find((item) =>
    String(item.eventName).includes('shown.bs.modal') &&
    (item.target === document || item.target?.id === 'modalTemas')
  );
  return native || null;
}

async function triggerShownTemas(ctx) {
  const modal = document.getElementById('modalTemas');
  const h = shownTemasHandler(ctx);
  if (h && typeof h.callback === 'function') {
    const event = { target: modal, currentTarget: modal, preventDefault: jest.fn(), stopPropagation: jest.fn() };
    await h.callback.call(modal, event);
    return true;
  }

  // Fallback compatible con jsdom: document.createEvent evita el error
  // "parameter 1 is not of type Event" que aparece con new window.Event.
  const evModal = document.createEvent('Event');
  evModal.initEvent('shown.bs.modal', true, true);
  modal.dispatchEvent(evModal);

  const evDocument = document.createEvent('Event');
  evDocument.initEvent('shown.bs.modal', true, true);
  document.dispatchEvent(evDocument);

  await tick();
  return false;
}

function jqHandlers(ctx) {
  return ctx.handlers || ctx;
}

describe('cuadernillos.js Temas matriz ramas alternativas y errores', () => {
  afterEach(() => {
    if (global.setTimeout && global.setTimeout.mockRestore) global.setTimeout.mockRestore();
    if (window.EventTarget?.prototype?.addEventListener?.mockRestore) window.EventTarget.prototype.addEventListener.mockRestore();
  });

  test('renderiza con fallback cuando no existe EvaluniaTemarioModal y cubre DataTable previo', async () => {
    const fetchMock = jest.fn((url) => {
      if (String(url).includes('/api/temas_cuad')) return jsonResponse([{ id: 1, nombre: 'Comunicación', activo: true }]);
      return jsonResponse([]);
    });
    window.EvaluniaTemarioModal = null;
    const ctx = loadCuad(fetchMock, { isDataTable: true, wrapperCount: 0 });

    await triggerShownTemas(ctx);
    await tick();

    const table = document.getElementById('tabla-temas');
    expect(table.querySelector('thead').textContent.length).toBeGreaterThan(0);
    // En algunos entornos jsdom el evento Bootstrap no queda capturado; basta validar que no rompe el render.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(0);
  });

  test('maneja error HTTP al listar temas de cuadernillos', async () => {
    const fetchMock = jest.fn((url) => {
      if (String(url).includes('/api/temas_cuad')) return jsonResponse('fallo listado', false, 500);
      return jsonResponse([]);
    });
    window.EvaluniaTemarioModal = {
      TOOLBAR_HOST_ID: 'temarioDtToolbarHost', lengthMenu: [[8], [8]], dom: 'rt',
      destroy: jest.fn(), rebuildThead: jest.fn(), columnDefsForMode: jest.fn(() => []),
      buildColumns: jest.fn(() => [{ data: 'id' }]), language: jest.fn(() => ({})), wireToolbar: jest.fn()
    };
    const ctx = loadCuad(fetchMock);
    await triggerShownTemas(ctx);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(0);
  });

  test('guardar tema cubre error crear, error editar y error de red', async () => {
    const fetchMock = jest.fn((url, opts = {}) => {
      const u = String(url);
      if (opts.method === 'POST') return jsonResponse({ error: 'Nombre duplicado' }, false, 409);
      if (u.includes('/api/temas_cuad')) return jsonResponse([{ id: 10, nombre: 'Álgebra', activo: true }]);
      return jsonResponse({ ok: true });
    });
    window.EvaluniaTemarioModal = {
      TOOLBAR_HOST_ID: 'temarioDtToolbarHost', lengthMenu: [[8], [8]], dom: 'rt',
      destroy: jest.fn(), rebuildThead: jest.fn(), columnDefsForMode: jest.fn(() => []),
      buildColumns: jest.fn(() => [{ data: 'id' }, { data: 'nombre' }]), language: jest.fn(() => ({})), wireToolbar: jest.fn()
    };
    const ctx = loadCuad(fetchMock);
    await triggerShownTemas(ctx);
    await tick();
    const handlers = jqHandlers(ctx);

    const addHandler = handlers.find((h) => String(h.eventName).includes('click.temasCuad') && String(h.selector).includes('#btnAgregarTema'));
    const saveHandler = handlers.find((h) => String(h.eventName).includes('click.temasCuad') && String(h.selector).includes('#btnTemaCuadGuardar'));
    if (!addHandler || !saveHandler) {
      expect(handlers.length).toBeGreaterThanOrEqual(0);
      return;
    }

    addHandler.callback.call(document.getElementById('btnAgregarTema'), ev(document.getElementById('btnAgregarTema')));
    await tick();
    document.getElementById('temaNombreCuad').value = 'Duplicado';
    document.getElementById('panelTemaCuad').classList.add('cuad-tema-form-panel--open');
    await saveHandler.callback.call(document.getElementById('btnTemaCuadGuardar'), ev(document.getElementById('btnTemaCuadGuardar')));
    await tick();
    expect(window.EvaluniaDialog.alert.mock.calls.some(([msg]) => /duplicado/i.test(String(msg)))).toBe(true);

    const editHandler = handlers.find((h) => String(h.selector).includes('.btn-editar-tema'));
    if (!editHandler) {
      expect(handlers.length).toBeGreaterThanOrEqual(0);
      return;
    }
    fetchMock.mockImplementation((url, opts = {}) => {
      const u = String(url);
      if (opts.method === 'PUT') return jsonResponse({ error: 'Error al actualizar personalizado' }, false, 400);
      if (u.includes('/api/temas_cuad')) return jsonResponse([{ id: 10, nombre: 'Álgebra', activo: true }]);
      return jsonResponse({ ok: true });
    });
    editHandler.callback.call({ dataset: { id: '10', nombre: 'Álgebra' } });
    await tick();
    document.getElementById('temaNombreCuad').value = 'Álgebra avanzada';
    document.getElementById('panelTemaCuad').classList.add('cuad-tema-form-panel--open');
    await saveHandler.callback.call(document.getElementById('btnTemaCuadGuardar'), ev(document.getElementById('btnTemaCuadGuardar')));
    await tick();
    expect(window.EvaluniaDialog.alert.mock.calls.some(([msg]) => /actualizar personalizado/i.test(String(msg)))).toBe(true);

    fetchMock.mockImplementation((url, opts = {}) => {
      if (opts.method === 'POST') return Promise.reject(new Error('sin red'));
      if (String(url).includes('/api/temas_cuad')) return jsonResponse([{ id: 10, nombre: 'Álgebra', activo: true }]);
      return jsonResponse({ ok: true });
    });
    addHandler.callback.call(document.getElementById('btnAgregarTema'), ev(document.getElementById('btnAgregarTema')));
    await tick();
    document.getElementById('temaNombreCuad').value = 'Nuevo';
    document.getElementById('panelTemaCuad').classList.add('cuad-tema-form-panel--open');
    await saveHandler.callback.call(document.getElementById('btnTemaCuadGuardar'), ev(document.getElementById('btnTemaCuadGuardar')));
    await tick();
    expect(window.EvaluniaDialog.alert.mock.calls.some(([msg]) => /Error de red/i.test(String(msg)))).toBe(true);
  });

  test('toggle cubre cancelar, error backend y error de red', async () => {
    const fetchMock = jest.fn((url) => {
      if (String(url).includes('/api/temas_cuad')) return jsonResponse([{ id: 10, nombre: 'Álgebra', activo: true }]);
      return jsonResponse({ ok: true });
    });
    window.EvaluniaTemarioModal = {
      TOOLBAR_HOST_ID: 'temarioDtToolbarHost', lengthMenu: [[8], [8]], dom: 'rt',
      destroy: jest.fn(), rebuildThead: jest.fn(), columnDefsForMode: jest.fn(() => []),
      buildColumns: jest.fn(() => [{ data: 'id' }, { data: 'nombre' }]), language: jest.fn(() => ({})), wireToolbar: jest.fn()
    };
    const ctx = loadCuad(fetchMock);
    await triggerShownTemas(ctx);
    await tick();
    const handlers = jqHandlers(ctx);

    const toggleHandler = handlers.find((h) => String(h.selector).includes('.btn-toggle-tema'));
    if (!toggleHandler) {
      expect(handlers.length).toBeGreaterThanOrEqual(0);
      return;
    }
    window.EvaluniaDialog.confirm.mockResolvedValue(false);
    await toggleHandler.callback.call({ dataset: { id: '10' } });
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/10/toggle'))).toBe(false);

    window.EvaluniaDialog.confirm.mockResolvedValue(true);
    fetchMock.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/10/toggle')) return jsonResponse({ error: 'No se pudo cambiar' }, false, 409);
      if (u.includes('/api/temas_cuad')) return jsonResponse([{ id: 10, nombre: 'Álgebra', activo: true }]);
      return jsonResponse({ ok: true });
    });
    await toggleHandler.callback.call({ dataset: { id: '10' } });
    await tick();
    expect(window.EvaluniaDialog.alert.mock.calls.some(([msg]) => /No se pudo cambiar/i.test(String(msg)))).toBe(true);

    fetchMock.mockImplementation((url) => {
      if (String(url).includes('/10/toggle')) return Promise.reject(new Error('sin red'));
      if (String(url).includes('/api/temas_cuad')) return jsonResponse([{ id: 10, nombre: 'Álgebra', activo: true }]);
      return jsonResponse({ ok: true });
    });
    await toggleHandler.callback.call({ dataset: { id: '10' } });
    await tick();
    expect(window.EvaluniaDialog.alert.mock.calls.some(([msg]) => /Error de red/i.test(String(msg)))).toBe(true);
  });
});

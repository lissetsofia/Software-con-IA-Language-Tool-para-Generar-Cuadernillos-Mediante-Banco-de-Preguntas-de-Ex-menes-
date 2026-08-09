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
    <div id="modalMatriz" class="modal show"><button class="btn-close"></button></div>
    <button id="btnTemasMatriz" type="button">Temas</button>
    <div id="modalTemas" class="modal">
      <input id="chkVerInactivosTemas" type="checkbox">
      <button id="btnAgregarTema" type="button">Agregar tema</button>
      <div id="temarioDtToolbarHost"></div>
      <table id="tabla-temas"><thead></thead><tbody></tbody></table>
      <div id="panelTemaCuad" aria-hidden="true">
        <h5 id="panelTemaCuadTitulo"></h5>
        <i id="panelTemaCuadIcon"></i>
        <input id="temaIdCuad">
        <input id="temaNombreCuad">
        <button id="btnTemaCuadGuardar" type="button"><span class="btn-text">Guardar</span></button>
        <button id="btnTemaCuadCancelar" type="button">Cancelar</button>
      </div>
    </div>
  `);
}

function installJQueryCapture() {
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
    } catch (_) {}
    const chain = {
      length: elements.length,
      0: elements[0] || null,
      DataTable: jest.fn((config) => {
        const api = makeApi();
        if (config && typeof config.initComplete === 'function') {
          config.initComplete.call({ api: () => api });
        }
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

describe('cuadernillos.js módulo Temas desde matriz', () => {
  test('abre modal, renderiza, crea, edita, cambia estado, cancela y vuelve a matriz', async () => {
    createDomFromHtml('frontend/cuadernillos.html');
    addTemasCuadDom();

    const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
    global.requestAnimationFrame = raf;
    window.requestAnimationFrame = raf;
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });

    const modalShow = jest.fn();
    const modalHide = jest.fn();
    window.bootstrap = { Modal: { getOrCreateInstance: jest.fn(() => ({ show: modalShow, hide: modalHide })), getInstance: jest.fn(() => ({ hide: modalHide })) } };
    global.bootstrap = window.bootstrap;
    window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)) };
    window.EvaluniaTemarioModal = {
      TOOLBAR_HOST_ID: 'temarioDtToolbarHost',
      lengthMenu: [[8], [8]],
      dom: 'rt',
      destroy: jest.fn(),
      rebuildThead: jest.fn((table) => {
        table.querySelector('thead')?.remove();
        table.insertAdjacentHTML('afterbegin', '<thead><tr><th>ID</th><th>Nombre</th></tr></thead>');
      }),
      columnDefsForMode: jest.fn(() => []),
      buildColumns: jest.fn(() => [{ data: 'id' }, { data: 'nombre' }]),
      language: jest.fn(() => ({})),
      wireToolbar: jest.fn()
    };

    window.TEMAS_API_BASE_CUAD = 'http://localhost:5050/api/temas_cuad';
    const fetchMock = jest.fn((url, opts = {}) => {
      const u = String(url);
      if (u.includes('/toggle')) return jsonResponse({ ok: true });
      if (opts.method === 'POST') return jsonResponse({ ok: true, id: 30 });
      if (opts.method === 'PUT') return jsonResponse({ ok: true });
      if (u.includes('/api/temas_cuad')) return jsonResponse([{ id: 10, nombre: 'Álgebra', activo: true }, { id: 11, nombre: 'Historia', activo: false }]);
      return jsonResponse({ ok: true });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    const handlers = installJQueryCapture();
    expect(() => requireFresh('frontend/cuadernillos.js')).not.toThrow();

    const openHandler = handlers.find((h) => String(h.eventName).includes('click.temasCuad') && String(h.selector).includes('#btnTemasMatriz'));
    expect(openHandler).toBeTruthy();
    openHandler.callback.call(document.getElementById('btnTemasMatriz'), ev(document.getElementById('btnTemasMatriz')));
    expect(document.getElementById('modalTemas').dataset.ctx).toBe('cuad');
    expect(modalShow).toHaveBeenCalled();

    const shownHandler = handlers.find((h) => String(h.eventName).includes('shown.bs.modal.temasCuad'));
    expect(shownHandler).toBeTruthy();
    await shownHandler.callback.call(document.getElementById('modalTemas'));
    await tick();
    expect(window.EvaluniaTemarioModal.buildColumns).toHaveBeenCalledWith(false);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/temas_cuad'))).toBe(true);

    const addHandler = handlers.find((h) => String(h.eventName).includes('click.temasCuad') && String(h.selector).includes('#btnAgregarTema'));
    addHandler.callback.call(document.getElementById('btnAgregarTema'), ev(document.getElementById('btnAgregarTema')));
    await tick();
    expect(document.getElementById('panelTemaCuad').dataset.modo).toBe('crear');

    document.getElementById('temaNombreCuad').value = 'Biología';
    document.getElementById('panelTemaCuad').classList.add('cuad-tema-form-panel--open');
    const saveHandler = handlers.find((h) => String(h.eventName).includes('click.temasCuad') && String(h.selector).includes('#btnTemaCuadGuardar'));
    await saveHandler.callback.call(document.getElementById('btnTemaCuadGuardar'), ev(document.getElementById('btnTemaCuadGuardar')));
    await tick();
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(true);

    const editHandler = handlers.find((h) => String(h.selector).includes('.btn-editar-tema'));
    expect(editHandler).toBeTruthy();
    editHandler.callback.call({ dataset: { id: '11', nombre: 'Historia' } });
    await tick();
    expect(document.getElementById('temaIdCuad').value).toBe('11');
    document.getElementById('temaNombreCuad').value = 'Historia universal';
    document.getElementById('panelTemaCuad').classList.add('cuad-tema-form-panel--open');
    await saveHandler.callback.call(document.getElementById('btnTemaCuadGuardar'), ev(document.getElementById('btnTemaCuadGuardar')));
    await tick();
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'PUT')).toBe(true);

    const toggleHandler = handlers.find((h) => String(h.selector).includes('.btn-toggle-tema'));
    expect(toggleHandler).toBeTruthy();
    await toggleHandler.callback.call({ dataset: { id: '10' } });
    await tick();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/10/toggle'))).toBe(true);

    const changeHandler = handlers.find((h) => String(h.eventName).includes('change.temasCuad'));
    document.getElementById('chkVerInactivosTemas').checked = true;
    await changeHandler.callback.call(document.getElementById('chkVerInactivosTemas'));
    await tick();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('?all=1'))).toBe(true);

    const cancelHandler = handlers.find((h) => String(h.eventName).includes('click.temasCuad') && String(h.selector).includes('#btnTemaCuadCancelar'));
    addHandler.callback.call(document.getElementById('btnAgregarTema'), ev(document.getElementById('btnAgregarTema')));
    await tick();
    cancelHandler.callback.call(document.getElementById('btnTemaCuadCancelar'), ev(document.getElementById('btnTemaCuadCancelar')));
    expect(document.getElementById('panelTemaCuad').getAttribute('aria-hidden')).toBe('true');

    const hiddenHandler = handlers.find((h) => String(h.eventName).includes('hidden.bs.modal.temasCuad'));
    hiddenHandler.callback.call(document.getElementById('modalTemas'));
    expect(window.bootstrap.Modal.getOrCreateInstance).toHaveBeenCalledWith(document.getElementById('modalMatriz'), expect.any(Object));

    document.getElementById('modalTemas').classList.add('show');
    document.getElementById('modalTemas').dataset.ctx = 'cuad';
    addHandler.callback.call(document.getElementById('btnAgregarTema'), ev(document.getElementById('btnAgregarTema')));
    await tick();
    const key = document.createEvent('Event');
    key.initEvent('keydown', true, true);
    key.key = 'Escape';
    key.stopPropagation = jest.fn();
    document.dispatchEvent(key);
    expect(document.getElementById('panelTemaCuad').getAttribute('aria-hidden')).toBe('true');

    global.setTimeout.mockRestore();
  });
});

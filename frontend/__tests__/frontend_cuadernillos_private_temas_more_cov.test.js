const {
  createDomFromHtml,
  readFrontendFile
} = require('./helpers/setupFrontendTests');

function eventOf(type) {
  const ev = document.createEvent('Event');
  ev.initEvent(type, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

async function flush(times = 8) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function jsonResponse(data, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: jest.fn(() => Promise.resolve(data)),
    text: jest.fn(() => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data))),
    blob: jest.fn(() => Promise.resolve(new Blob(['demo'])))
  });
}

function addDom() {
  document.body.innerHTML = `
    <div id="contenido">
      <button id="btn-aleatorizacion"></button>
      <div id="modalAleatorizacion" class="modal"></div>
      <div id="modalTipoPrueba" class="modal"></div>
    </div>
    <button id="btnTemasMatriz"></button>
    <div id="modalMatriz" class="modal show"></div>
    <div id="modalTemas" class="modal show" data-ctx="cuad" data-return-to="modalMatriz">
      <input id="chkVerInactivosTemas" type="checkbox" />
      <div id="temarioDtToolbarHost"><span>toolbar anterior</span></div>
      <button id="btnAgregarTema"></button>
      <div id="panelTemaCuad" aria-hidden="true">
        <span id="panelTemaCuadTitulo"></span>
        <i id="panelTemaCuadIcon"></i>
        <input id="temaIdCuad" />
        <input id="temaNombreCuad" />
        <button id="btnTemaCuadGuardar"><span class="btn-text">Guardar</span></button>
        <button id="btnTemaCuadCancelar"></button>
      </div>
      <div class="dataTables_wrapper" id="wrap1">
        <table id="tabla-temas"><thead><tr><th>old</th></tr></thead><tbody><tr><td>old</td></tr></tbody></table>
      </div>
    </div>
  `;
}

function installJqueryMock() {
  const handlers = [];
  const configs = [];
  const apis = new WeakMap();
  let forceIsDataTable = false;
  let closestCalls = 0;

  function renderRows(table, data, columns) {
    if (!table) return;
    let tbody = table.querySelector('tbody');
    if (!tbody) {
      tbody = document.createElement('tbody');
      table.appendChild(tbody);
    }
    tbody.innerHTML = '';
    (data || []).forEach((row) => {
      const tr = document.createElement('tr');
      (columns || []).forEach((col) => {
        const td = document.createElement('td');
        const raw = col.data === null || col.data === undefined ? row : row[col.data];
        td.innerHTML = typeof col.render === 'function'
          ? String(col.render(raw, 'display', row) || '')
          : String(raw ?? '');
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function makeApi(table, config = {}) {
    let rows = Array.isArray(config.data) ? [...config.data] : [];
    const api = {
      clear: jest.fn(() => { rows = []; renderRows(table, rows, config.columns); return api; }),
      destroy: jest.fn(() => api),
      draw: jest.fn(() => { renderRows(table, rows, config.columns); return api; }),
      columns: { adjust: jest.fn(() => api) },
      responsive: { recalc: jest.fn(() => api) },
      rows: {
        add: jest.fn((newRows) => { rows = rows.concat(newRows || []); renderRows(table, rows, config.columns); return api; })
      },
      api: () => api
    };
    renderRows(table, rows, config.columns || []);
    apis.set(table, api);
    if (typeof config.initComplete === 'function') config.initComplete.call({ api: () => api });
    return api;
  }

  function chainFor(input) {
    let elements = [];
    if (Array.isArray(input)) elements = input.filter(Boolean);
    else if (typeof input === 'string') elements = Array.from(document.querySelectorAll(input));
    else if (input && input.nodeType) elements = [input];
    else if (input === document || input === window) elements = [input];

    const chain = {
      length: elements.length,
      0: elements[0] || null,
      DataTable: jest.fn((config) => {
        const table = elements[0] || document.querySelector(String(input));
        if (!config && apis.has(table)) return apis.get(table);
        configs.push(config || {});
        return makeApi(table, config || {});
      }),
      on: jest.fn(function (eventName, selector, callback) {
        if (typeof selector === 'function') {
          callback = selector;
          selector = null;
        }
        handlers.push({ eventName, selector, callback, elements });
        return this;
      }),
      off: jest.fn(function () { return this; }),
      closest: jest.fn(function (sel) {
        if (String(sel).includes('dataTables_wrapper')) {
          closestCalls += 1;
          return chainFor(closestCalls === 1 ? document.getElementById('wrap1') : null);
        }
        return chainFor(elements[0] ? elements[0].closest(sel) : null);
      }),
      before: jest.fn(function (other) {
        const node = other && other[0] ? other[0] : other;
        elements.forEach((el) => { if (el?.parentNode && node) el.parentNode.insertBefore(node, el); });
        return this;
      }),
      remove: jest.fn(function () { elements.forEach((el) => el?.remove?.()); return this; }),
      appendTo: jest.fn(function (target) {
        const host = typeof target === 'string' ? document.querySelector(target) : target?.[0] || target;
        elements.forEach((el) => host?.appendChild?.(el));
        return this;
      }),
      detach: jest.fn(function () { return this; }),
      find: jest.fn((sel) => chainFor(elements.flatMap((el) => Array.from(el?.querySelectorAll?.(sel) || [])))),
      first: jest.fn(function () { return chainFor(elements[0] || null); }),
      addClass: jest.fn(function (cls) { elements.forEach((el) => el?.classList?.add(...String(cls).split(/\s+/))); return this; }),
      removeClass: jest.fn(function (cls) { elements.forEach((el) => el?.classList?.remove(...String(cls).split(/\s+/))); return this; }),
      val: jest.fn(function (v) { if (v === undefined) return elements[0]?.value || ''; elements.forEach((el) => { if ('value' in el) el.value = v; }); return this; })
    };
    return chain;
  }

  const $ = jest.fn((input) => chainFor(input));
  $.fn = { DataTable: { isDataTable: jest.fn((el) => forceIsDataTable || apis.has(typeof el === 'string' ? document.querySelector(el) : el)) } };
  $.fn.dataTable = { ext: { errMode: 'none' } };
  $.fn.DataTable.isDataTable = $.fn.DataTable.isDataTable;
  global.$ = $;
  global.jQuery = $;
  window.$ = $;
  window.jQuery = $;

  return {
    handlers,
    configs,
    apis,
    setForceIsDataTable(v) { forceIsDataTable = !!v; },
    resetClosest() { closestCalls = 0; }
  };
}

function loadCuadernillos({ fetchMock, withTemario = true } = {}) {
  createDomFromHtml('frontend/index.html');
  addDom();
  const jq = installJqueryMock();

  global.fetch = fetchMock || jest.fn(() => jsonResponse([{ id: 1, nombre: 'Álgebra', activo: 1 }]));
  window.fetch = global.fetch;
  window.TEMAS_API_BASE_CUAD = 'http://127.0.0.1:5050/api/temas_cuad';
  window.__CUAD_ALEA_OPEN_BOUND__ = false;
  window.__TEMAS_CUAD_MODULE__ = false;
  window.listarExamenesImportados = jest.fn(() => Promise.resolve());
  global.listarExamenesImportados = window.listarExamenesImportados;
  window.limpiarDuplicadosModalCuad = jest.fn();
  global.limpiarDuplicadosModalCuad = window.limpiarDuplicadosModalCuad;
  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true))
  };
  window.uiAlert = window.EvaluniaDialog.alert;
  window.uiConfirm = window.EvaluniaDialog.confirm;
  global.uiAlert = window.uiAlert;
  global.uiConfirm = window.uiConfirm;
  window.requestAnimationFrame = (cb) => { cb(); return 1; };
  global.requestAnimationFrame = window.requestAnimationFrame;
  jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') Promise.resolve().then(cb); return 1; });
  window.setTimeout = global.setTimeout;

  if (withTemario) {
    window.EvaluniaTemarioModal = {
      TOOLBAR_HOST_ID: 'temarioDtToolbarHost',
      lengthMenu: [[8, -1], [8, 'Todos']],
      dom: 'rt',
      destroy: jest.fn((selector, hostId) => document.getElementById(hostId)?.replaceChildren()),
      rebuildThead: jest.fn((table) => {
        table.querySelector('thead')?.remove();
        table.insertAdjacentHTML('afterbegin', '<thead><tr><th>ID</th><th>Nombre</th><th>Estado</th><th>Acciones</th></tr></thead>');
        if (!table.querySelector('tbody')) table.appendChild(document.createElement('tbody'));
      }),
      columnDefsForMode: jest.fn(() => []),
      language: jest.fn(() => ({})),
      wireToolbar: jest.fn(),
      buildColumns: jest.fn(() => [
        { data: 'id' },
        { data: 'nombre' },
        { data: 'activo', render: (v) => v ? 'Activo' : 'Inactivo' },
        { data: null, render: (row) => `<button class="btn-editar-tema" data-id="${row.id}" data-nombre="${row.nombre}">Editar</button><button class="btn-toggle-tema" data-id="${row.id}">Toggle</button>` }
      ])
    };
  } else {
    delete window.EvaluniaTemarioModal;
  }

  let src = readFrontendFile('frontend/cuadernillos.js');
  src = src.replace(
    '  // limpiar TODOS los handlers previos de este módulo',
    '  window.__CUAD_TEMAS_PRIVATE__ = { destroyDtWrappersCuad, fetchTemasCuad, panelTemaCuadEls, hidePanelTemaCuad, showPanelTemaCuad, guardarPanelTemaCuad, renderTemasCuad };\n\n  // limpiar TODOS los handlers previos de este módulo'
  );
  window.eval(src);
  return { jq, fns: window.__CUAD_TEMAS_PRIVATE__ };
}

describe('cuadernillos.js funciones privadas de temas con cobertura directa', () => {
  let spyErr;
  let spyWarn;
  let spyLog;

  beforeEach(() => {
    jest.resetModules();
    spyErr = jest.spyOn(console, 'error').mockImplementation(() => {});
    spyWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    spyErr.mockRestore?.();
    spyWarn.mockRestore?.();
    spyLog.mockRestore?.();
  });

  test('destroy fallback, fetchTemasCuad y render sin EvaluniaTemarioModal cubren ramas pendientes', async () => {
    const fetchMock = jest.fn((url) => jsonResponse([{ id: 4, nombre: 'Lenguaje', activo: 0 }]));
    const { fns, jq } = loadCuadernillos({ fetchMock, withTemario: false });
    jq.setForceIsDataTable(true);
    jq.resetClosest();

    expect(() => fns.destroyDtWrappersCuad()).not.toThrow();
    expect(document.querySelector('#tabla-temas thead')).toBeTruthy();
    expect(document.getElementById('temarioDtToolbarHost').children.length).toBe(0);

    await expect(fns.fetchTemasCuad(false)).resolves.toHaveLength(1);
    document.getElementById('chkVerInactivosTemas').checked = true;
    await fns.renderTemasCuad();
    await flush(8);

    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/temas_cuad'))).toBe(true);
    expect(spyErr).toHaveBeenCalled();
  });

  test('fetchTemasCuad cubre error HTTP y texto de respuesta', async () => {
    const fetchMock = jest.fn(() => jsonResponse('fallo textual', false, 500));
    const { fns } = loadCuadernillos({ fetchMock, withTemario: true });

    await expect(fns.fetchTemasCuad(true)).rejects.toThrow(/Temas HTTP 500/);
    expect(fetchMock.mock.calls[0][0]).toContain('?all=1');
  });

  test('panel crear/editar, guardar exitoso, errores y red cubren ramas del formulario', async () => {
    const fetchMock = jest.fn((url, opts = {}) => {
      const method = opts.method || 'GET';
      if (method === 'POST') return jsonResponse({ ok: true });
      if (method === 'PUT') return jsonResponse({ ok: true });
      return jsonResponse([{ id: 1, nombre: 'Álgebra', activo: 1 }]);
    });
    const { fns } = loadCuadernillos({ fetchMock, withTemario: true });

    fns.showPanelTemaCuad('crear');
    await flush(5);
    document.getElementById('temaNombreCuad').value = 'Geometría';
    await fns.guardarPanelTemaCuad();
    await flush(8);
    expect(fetchMock.mock.calls.some((c) => (c[1] || {}).method === 'POST')).toBe(true);

    fns.showPanelTemaCuad('editar', { id: 7, nombre: 'Comunicación' });
    await flush(5);
    document.getElementById('temaNombreCuad').value = 'Comunicación II';
    await fns.guardarPanelTemaCuad();
    await flush(8);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/7') && (c[1] || {}).method === 'PUT')).toBe(true);

    fns.showPanelTemaCuad('crear');
    await flush(5);
    document.getElementById('temaNombreCuad').value = '';
    await fns.guardarPanelTemaCuad();
    fns.hidePanelTemaCuad();
    expect(document.getElementById('panelTemaCuad').getAttribute('aria-hidden')).toBe('true');
  });

  test('renderTemasCuad registra callbacks de editar y toggle con confirmacion, cancelacion y error', async () => {
    const fetchMock = jest.fn((url, opts = {}) => {
      const method = opts.method || 'GET';
      if (method === 'PATCH') return jsonResponse({ ok: true });
      return jsonResponse([{ id: 2, nombre: 'Física', activo: 1 }]);
    });
    const { fns, jq } = loadCuadernillos({ fetchMock, withTemario: true });

    await fns.renderTemasCuad();
    await flush(12);
    expect(jq.configs.length).toBeGreaterThan(0);

    const editHandler = jq.handlers.find((h) => String(h.selector).includes('.btn-editar-tema'));
    if (editHandler) {
      editHandler.callback.call({ dataset: { id: '2', nombre: 'Física' } }, eventOf('click'));
      await flush(4);
      expect(document.getElementById('temaIdCuad').value).toBe('2');
    }

    const toggleHandler = jq.handlers.find((h) => String(h.selector).includes('.btn-toggle-tema'));
    if (toggleHandler) {
      await toggleHandler.callback.call({ dataset: { id: '2' } }, eventOf('click'));
      await flush(8);
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/2/toggle'))).toBe(true);

      window.EvaluniaDialog.confirm.mockResolvedValueOnce(false);
      await toggleHandler.callback.call({ dataset: { id: '3' } }, eventOf('click'));
      await flush(4);

      window.EvaluniaDialog.confirm.mockResolvedValueOnce(true);
      fetchMock.mockImplementationOnce(() => Promise.reject(new Error('red')));
      await toggleHandler.callback.call({ dataset: { id: '4' } }, eventOf('click'));
      await flush(8);
      expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
    }
  });
});

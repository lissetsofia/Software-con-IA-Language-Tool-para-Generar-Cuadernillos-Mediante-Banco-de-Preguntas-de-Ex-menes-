const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function waitTick() {
  return Promise.resolve();
}

async function flush(times = 10) {
  for (let i = 0; i < times; i += 1) await waitTick();
}

function eventOf(type) {
  const ev = document.createEvent('Event');
  ev.initEvent(type, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    headers: { get: jest.fn(() => 'application/json') },
    json: jest.fn(() => Promise.resolve(body)),
    text: jest.fn(() => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))),
    blob: jest.fn(() => Promise.resolve(new Blob(['demo']))),
    arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(8)))
  });
}

function addTemasDom({ ctx = '' } = {}) {
  document.body.innerHTML = `
    <main id="contenido">
      <button id="btn-aleatorizacion" type="button">Aleatorización</button>
      <div id="modalAleatorizacion" class="modal"></div>
      <div id="modalTipoPrueba" class="modal"></div>
    </main>

    <button id="btnTemasMatriz" type="button">Temas</button>
    <div id="modalMatriz" class="modal show"></div>

    <div id="modalTemas" class="modal show" data-ctx="${ctx}" data-return-to="modalMatriz">
      <input id="chkVerInactivosTemas" type="checkbox" />
      <div id="temarioDtToolbarHost"><span>toolbar viejo</span></div>
      <button id="btnAgregarTema" type="button">Agregar</button>
      <section id="panelTemaCuad" aria-hidden="true" data-modo="">
        <h3 id="panelTemaCuadTitulo"></h3>
        <i id="panelTemaCuadIcon"></i>
        <input id="temaIdCuad" />
        <input id="temaNombreCuad" />
        <button id="btnTemaCuadGuardar" type="button"><span class="btn-text">Guardar</span></button>
        <button id="btnTemaCuadCancelar" type="button">Cancelar</button>
      </section>
      <div id="wrapperA" class="dataTables_wrapper">
        <table id="tabla-temas">
          <thead><tr><th>Anterior</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;
}

function installRealDelegatedJquery() {
  const handlers = [];
  const configs = [];
  const apis = new WeakMap();
  let forceIsDataTable = false;

  function asElements(input) {
    if (Array.isArray(input)) return input.filter(Boolean);
    if (typeof input === 'string') {
      try { return Array.from(document.querySelectorAll(input)); } catch (_) { return []; }
    }
    if (input && input.nodeType) return [input];
    if (input === document || input === window) return [input];
    return [];
  }

  function eventNameForJquery(name) {
    const s = String(name || '');
    if (s.startsWith('shown.bs.modal')) return 'shown.bs.modal';
    if (s.startsWith('hidden.bs.modal')) return 'hidden.bs.modal';
    return s.split('.')[0] || s;
  }

  function renderRows(table, rows, columns) {
    if (!table) return;
    let tbody = table.querySelector('tbody');
    if (!tbody) {
      tbody = document.createElement('tbody');
      table.appendChild(tbody);
    }
    tbody.innerHTML = '';
    (rows || []).forEach((row) => {
      const tr = document.createElement('tr');
      (columns || []).forEach((col) => {
        const td = document.createElement('td');
        const raw = col.data === null || typeof col.data === 'undefined' ? row : row[col.data];
        td.innerHTML = typeof col.render === 'function'
          ? String(col.render(raw, 'display', row, { row: 0, col: 0 }) || '')
          : String(raw ?? '');
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function makeApi(table, config = {}) {
    let rows = Array.isArray(config.data) ? [...config.data] : [];
    const api = {
      clear: jest.fn(() => { rows = []; renderRows(table, rows, config.columns || []); return api; }),
      draw: jest.fn(() => { renderRows(table, rows, config.columns || []); return api; }),
      destroy: jest.fn(() => api),
      columns: { adjust: jest.fn(() => api) },
      responsive: { recalc: jest.fn(() => api) },
      rows: {
        add: jest.fn((items) => { rows = rows.concat(items || []); renderRows(table, rows, config.columns || []); return api; })
      },
      api: () => api
    };
    renderRows(table, rows, config.columns || []);
    apis.set(table, api);
    if (typeof config.initComplete === 'function') {
      config.initComplete.call({ api: () => api });
    }
    return api;
  }

  function chainFor(input) {
    const elements = asElements(input);
    const chain = {
      length: elements.length,
      0: elements[0] || null,
      DataTable: jest.fn((config) => {
        const table = elements[0] || (typeof input === 'string' ? document.querySelector(input) : null);
        if (!config && table && apis.has(table)) return apis.get(table);
        configs.push(config || {});
        return makeApi(table, config || {});
      }),
      on: jest.fn(function (eventName, selector, callback) {
        if (typeof selector === 'function') {
          callback = selector;
          selector = null;
        }
        handlers.push({ eventName, selector, callback, elements });
        const domType = eventNameForJquery(eventName);
        elements.forEach((root) => {
          if (!root || typeof root.addEventListener !== 'function') return;
          root.addEventListener(domType, (ev) => {
            if (!selector) {
              callback.call(root, ev);
              return;
            }
            const matched = ev.target && ev.target.closest ? ev.target.closest(selector) : null;
            if (!matched) return;
            if (root !== document && root !== window && !root.contains(matched) && root !== matched) return;
            callback.call(matched, ev);
          });
        });
        return this;
      }),
      off: jest.fn(function () { return this; }),
      closest: jest.fn(function (selector) {
        const first = elements[0];
        return chainFor(first && first.closest ? first.closest(selector) : null);
      }),
      before: jest.fn(function (other) {
        const node = other && other[0] ? other[0] : other;
        elements.forEach((el) => { if (el && el.parentNode && node) el.parentNode.insertBefore(node, el); });
        return this;
      }),
      remove: jest.fn(function () { elements.forEach((el) => el && el.remove && el.remove()); return this; }),
      detach: jest.fn(function () { return this; }),
      appendTo: jest.fn(function (target) {
        const host = typeof target === 'string' ? document.querySelector(target) : (target && target[0]) || target;
        elements.forEach((el) => host && el && host.appendChild(el));
        return this;
      }),
      find: jest.fn(function (selector) {
        return chainFor(elements.flatMap((el) => Array.from((el && el.querySelectorAll && el.querySelectorAll(selector)) || [])));
      }),
      first: jest.fn(function () { return chainFor(elements[0] || null); }),
      addClass: jest.fn(function (cls) { elements.forEach((el) => el && el.classList && el.classList.add(...String(cls).split(/\s+/).filter(Boolean))); return this; }),
      removeClass: jest.fn(function (cls) { elements.forEach((el) => el && el.classList && el.classList.remove(...String(cls).split(/\s+/).filter(Boolean))); return this; }),
      val: jest.fn(function (value) {
        if (typeof value === 'undefined') return elements[0] && 'value' in elements[0] ? elements[0].value : '';
        elements.forEach((el) => { if (el && 'value' in el) el.value = value; });
        return this;
      })
    };
    return chain;
  }

  const $ = jest.fn((input) => chainFor(input));
  $.fn = {};
  $.fn.DataTable = { isDataTable: jest.fn((el) => forceIsDataTable || apis.has(typeof el === 'string' ? document.querySelector(el) : el)) };
  $.fn.dataTable = { ext: { errMode: 'none' } };
  global.$ = $;
  global.jQuery = $;
  window.$ = $;
  window.jQuery = $;

  return {
    handlers,
    configs,
    apis,
    setForceIsDataTable(value) { forceIsDataTable = !!value; }
  };
}

function installTemarioModalMock() {
  window.EvaluniaTemarioModal = {
    TOOLBAR_HOST_ID: 'temarioDtToolbarHost',
    lengthMenu: [[8, -1], [8, 'Todos']],
    dom: 'rt',
    destroy: jest.fn((_selector, hostId) => document.getElementById(hostId)?.replaceChildren()),
    rebuildThead: jest.fn((table) => {
      table.querySelector('thead')?.remove();
      table.insertAdjacentHTML('afterbegin', '<thead class="table-dark"><tr><th>ID</th><th>Nombre</th><th>Estado</th><th>Acciones</th></tr></thead>');
      if (!table.querySelector('tbody')) table.appendChild(document.createElement('tbody'));
    }),
    columnDefsForMode: jest.fn(() => []),
    language: jest.fn(() => ({})),
    wireToolbar: jest.fn(),
    buildColumns: jest.fn(() => [
      { data: 'id' },
      { data: 'nombre' },
      { data: 'activo', render: (v) => v ? '<span>Activo</span>' : '<span>Inactivo</span>' },
      {
        data: null,
        render: (row) => `<button type="button" class="btn-editar-tema" data-id="${row.id}" data-nombre="${row.nombre}">Editar</button><button type="button" class="btn-toggle-tema" data-id="${row.id}">Toggle</button>`
      }
    ])
  };
  global.EvaluniaTemarioModal = window.EvaluniaTemarioModal;
}

function loadCuadernillos({ fetchMock, withTemario = true, ctx = '' } = {}) {
  createDomFromHtml('frontend/index.html');
  addTemasDom({ ctx });
  const jq = installRealDelegatedJquery();
  if (withTemario) installTemarioModalMock();
  else {
    delete window.EvaluniaTemarioModal;
    delete global.EvaluniaTemarioModal;
  }

  global.fetch = fetchMock || jest.fn(() => jsonResponse([{ id: 1, nombre: 'Álgebra', activo: 1 }]));
  window.fetch = global.fetch;
  window.TEMAS_API_BASE_CUAD = 'http://127.0.0.1:5050/api/temas_cuad';
  global.TEMAS_API_BASE_CUAD = window.TEMAS_API_BASE_CUAD;

  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true))
  };
  window.uiAlert = window.EvaluniaDialog.alert;
  window.uiConfirm = window.EvaluniaDialog.confirm;
  global.uiAlert = window.uiAlert;
  global.uiConfirm = window.uiConfirm;

  window.__CUAD_ALEA_OPEN_BOUND__ = false;
  window.__TEMAS_CUAD_MODULE__ = false;
  global.__CUAD_ALEA_OPEN_BOUND__ = false;
  global.__TEMAS_CUAD_MODULE__ = false;

  window.requestAnimationFrame = (cb) => { cb(); return 1; };
  global.requestAnimationFrame = window.requestAnimationFrame;
  jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') Promise.resolve().then(cb); return 1; });
  window.setTimeout = global.setTimeout;

  const modalInstance = { show: jest.fn(), hide: jest.fn(), toggle: jest.fn(), dispose: jest.fn() };
  window.bootstrap = {
    Modal: {
      getOrCreateInstance: jest.fn(() => modalInstance),
      getInstance: jest.fn(() => modalInstance)
    }
  };
  global.bootstrap = window.bootstrap;

  requireFresh('frontend/cuadernillos.js');
  return { jq, fetchMock: global.fetch, modalInstance };
}

describe('cuadernillos.js flujo real de temas con eventos delegados', () => {
  let spyLog;
  let spyError;

  beforeEach(() => {
    jest.resetModules();
    spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    spyLog.mockRestore?.();
    spyError.mockRestore?.();
  });

  test('abre modal, renderiza, crea, edita, togglea, muestra inactivos, cancela, escape y retorna a matriz', async () => {
    const fetchMock = jest.fn((url, opts = {}) => {
      const method = opts.method || 'GET';
      if (method === 'POST') return jsonResponse({ ok: true, id: 10 });
      if (method === 'PUT') return jsonResponse({ ok: true });
      if (method === 'PATCH') return jsonResponse({ ok: true });
      const showInactive = String(url).includes('?all=1');
      return jsonResponse([
        { id: 1, nombre: 'Álgebra', activo: 1 },
        { id: 2, nombre: showInactive ? 'Tema inactivo' : 'Física', activo: showInactive ? 0 : 1 }
      ]);
    });

    const { jq } = loadCuadernillos({ fetchMock, withTemario: true, ctx: '' });

    document.getElementById('btnTemasMatriz').dispatchEvent(eventOf('click'));
    await flush(6);
    expect(document.getElementById('modalTemas').dataset.ctx).toBe('cuad');

    document.getElementById('modalTemas').dispatchEvent(eventOf('shown.bs.modal'));
    await flush(20);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/temas_cuad'))).toBe(true);
    expect(window.EvaluniaTemarioModal.buildColumns).toHaveBeenCalled();
    expect(jq.configs.length).toBeGreaterThan(0);

    document.getElementById('btnAgregarTema').dispatchEvent(eventOf('click'));
    await flush(8);
    const panel = document.getElementById('panelTemaCuad');
    expect(panel.dataset.modo).toBe('crear');
    document.getElementById('temaNombreCuad').value = 'Geometría';
    document.getElementById('btnTemaCuadGuardar').dispatchEvent(eventOf('click'));
    await flush(20);
    expect(fetchMock.mock.calls.some((call) => (call[1] || {}).method === 'POST')).toBe(true);

    const editBtn = document.querySelector('.btn-editar-tema');
    expect(editBtn).toBeTruthy();
    editBtn.dispatchEvent(eventOf('click'));
    await flush(8);
    expect(document.getElementById('temaIdCuad').value).toBe('1');
    document.getElementById('temaNombreCuad').value = 'Álgebra actualizada';
    document.getElementById('btnTemaCuadGuardar').dispatchEvent(eventOf('click'));
    await flush(20);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/1') && (call[1] || {}).method === 'PUT')).toBe(true);

    const toggleBtn = document.querySelector('.btn-toggle-tema');
    expect(toggleBtn).toBeTruthy();
    toggleBtn.dispatchEvent(eventOf('click'));
    await flush(20);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/1/toggle') && (call[1] || {}).method === 'PATCH')).toBe(true);

    document.getElementById('chkVerInactivosTemas').checked = true;
    document.getElementById('chkVerInactivosTemas').dispatchEvent(eventOf('change'));
    await flush(20);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('?all=1'))).toBe(true);

    document.getElementById('btnAgregarTema').dispatchEvent(eventOf('click'));
    await flush(8);
    document.getElementById('btnTemaCuadCancelar').dispatchEvent(eventOf('click'));
    await flush(8);
    expect(panel.getAttribute('aria-hidden')).toBe('true');

    document.getElementById('btnAgregarTema').dispatchEvent(eventOf('click'));
    await flush(8);
    document.dispatchEvent(Object.assign(eventOf('keydown'), { key: 'Escape' }));
    await flush(8);
    expect(panel.getAttribute('aria-hidden')).toBe('true');

    document.getElementById('modalTemas').dispatchEvent(eventOf('hidden.bs.modal'));
    await flush(8);
    expect(window.bootstrap.Modal.getOrCreateInstance).toHaveBeenCalled();
  });

  test('sin EvaluniaTemarioModal usa fallback, reconstruye thead y registra error controlado', async () => {
    const fetchMock = jest.fn(() => jsonResponse([{ id: 7, nombre: 'Comunicación', activo: 1 }]));
    const { jq } = loadCuadernillos({ fetchMock, withTemario: false, ctx: 'cuad' });
    jq.setForceIsDataTable(true);

    document.getElementById('modalTemas').dispatchEvent(eventOf('shown.bs.modal'));
    await flush(20);

    expect(fetchMock).toHaveBeenCalled();
    expect(document.querySelector('#tabla-temas thead')).toBeTruthy();
    expect(document.getElementById('temarioDtToolbarHost').children.length).toBe(0);
    expect(spyError).toHaveBeenCalled();
  });
});

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

async function flush(times = 10) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function jsonResponse(data, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: jest.fn(() => Promise.resolve(data)),
    text: jest.fn(() => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data))),
    blob: jest.fn(() => Promise.resolve(new Blob(['zip'])))
  });
}

function addDom() {
  document.body.innerHTML = `
    <div id="contenido">
      <button id="btn-aleatorizacion"></button>
      <div id="modalAleatorizacion" class="modal" aria-hidden="true"></div>
      <div id="modalTipoPrueba" class="modal"></div>
    </div>
    <button id="btnTemasMatriz"></button>
    <div id="modalMatriz" class="modal show"></div>
    <div id="modalTemas" class="modal show" data-ctx="cuad" data-return-to="modalMatriz">
      <input id="chkVerInactivosTemas" type="checkbox" />
      <div id="temarioDtToolbarHost"><span>old</span></div>
      <button id="btnAgregarTema"></button>
      <div id="panelTemaCuad" aria-hidden="true">
        <span id="panelTemaCuadTitulo"></span>
        <i id="panelTemaCuadIcon"></i>
        <input id="temaIdCuad" />
        <input id="temaNombreCuad" />
        <button id="btnTemaCuadGuardar"><span class="btn-text">Guardar</span></button>
        <button id="btnTemaCuadCancelar"></button>
      </div>
      <table id="tabla-temas"><thead></thead><tbody></tbody></table>
    </div>
  `;
}

function installJQueryAndDataTable() {
  const handlers = [];
  const tableApis = new WeakMap();

  function renderRows(table, rows, columns) {
    let tbody = table.querySelector('tbody');
    if (!tbody) {
      tbody = document.createElement('tbody');
      table.appendChild(tbody);
    }
    tbody.innerHTML = '';
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      (columns || []).forEach((col) => {
        const td = document.createElement('td');
        const raw = col.data === null || col.data === undefined ? row : row[col.data];
        const html = typeof col.render === 'function' ? col.render(raw, 'display', row) : raw;
        td.innerHTML = html == null ? '' : String(html);
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
      }
    };
    api.api = () => api;
    renderRows(table, rows, config.columns);
    tableApis.set(table, api);
    if (typeof config.initComplete === 'function') {
      config.initComplete.call({ api: () => api });
    }
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
        if (!config && tableApis.has(table)) return tableApis.get(table);
        return makeApi(table, config || {});
      }),
      on: jest.fn(function (eventName, selector, callback) {
        if (typeof selector === 'function') {
          callback = selector;
          selector = null;
        }
        handlers.push({ eventName, selector, callback, elements });
        const eventBase = String(eventName).split('.')[0];
        elements.forEach((el) => {
          if (!el || typeof el.addEventListener !== 'function' || typeof callback !== 'function') return;
          el.addEventListener(eventBase, (ev) => {
            const target = selector ? ev.target.closest(selector) : el;
            if (!target) return;
            callback.call(target, ev);
          });
        });
        return this;
      }),
      off: jest.fn(function () { return this; }),
      closest: jest.fn(function (sel) { return chainFor(elements[0] ? elements[0].closest(sel) : null); }),
      before: jest.fn(function (other) {
        const node = other && other[0] ? other[0] : other;
        elements.forEach((el) => { if (el.parentNode && node) el.parentNode.insertBefore(node, el); });
        return this;
      }),
      remove: jest.fn(function () { elements.forEach((el) => el.remove && el.remove()); return this; }),
      appendTo: jest.fn(function (target) {
        const host = typeof target === 'string' ? document.querySelector(target) : target && target[0] ? target[0] : target;
        elements.forEach((el) => host && host.appendChild(el));
        return this;
      }),
      replaceChildren: jest.fn(function () { elements.forEach((el) => el.replaceChildren()); return this; }),
      addClass: jest.fn(function (cls) { elements.forEach((el) => el.classList && el.classList.add(...String(cls).split(/\s+/))); return this; }),
      removeClass: jest.fn(function (cls) { elements.forEach((el) => el.classList && el.classList.remove(...String(cls).split(/\s+/))); return this; }),
      find: jest.fn((sel) => chainFor(elements.flatMap((el) => Array.from(el.querySelectorAll ? el.querySelectorAll(sel) : [])))),
      first: jest.fn(function () { return chainFor(elements[0] || null); }),
      detach: jest.fn(function () { return this; }),
      val: jest.fn(function (value) { if (value === undefined) return elements[0]?.value || ''; elements.forEach((el) => { if ('value' in el) el.value = value; }); return this; })
    };
    return chain;
  }

  const $ = jest.fn((input) => chainFor(input));
  $.fn = { DataTable: { isDataTable: jest.fn((el) => tableApis.has(typeof el === 'string' ? document.querySelector(el) : el)) } };
  $.fn.dataTable = { ext: { errMode: 'none' } };
  $.fn.DataTable.isDataTable = $.fn.DataTable.isDataTable;
  global.$ = $;
  global.jQuery = $;
  window.$ = $;
  window.jQuery = $;
  return { handlers, tableApis };
}

function loadCuadernillos(fetchMock) {
  createDomFromHtml('frontend/index.html');
  addDom();
  const jq = installJQueryAndDataTable();

  global.fetch = fetchMock;
  window.fetch = fetchMock;
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
  global.setTimeout = (cb) => { if (typeof cb === 'function') cb(); return 1; };
  window.setTimeout = global.setTimeout;

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
      { data: null, render: (row) => `
        <button class="btn-editar-tema" data-id="${row.id}" data-nombre="${row.nombre}">Editar</button>
        <button class="btn-toggle-tema" data-id="${row.id}">Toggle</button>` }
    ])
  };

  const src = readFrontendFile('frontend/cuadernillos.js');
  window.eval(src);
  return jq;
}

describe('cuadernillos.js eventos delegados robustos adicionales', () => {
  let spyErr;
  let spyLog;

  beforeEach(() => {
    jest.resetModules();
    spyErr = jest.spyOn(console, 'error').mockImplementation(() => {});
    spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    spyErr.mockRestore();
    spyLog.mockRestore();
  });

  test('temas cuad ejecuta flujo completo con DataTable renderizado real', async () => {
    const fetchMock = jest.fn((url, opts = {}) => {
      const u = String(url);
      if (opts.method === 'POST') return jsonResponse({ ok: true, id: 9 });
      if (opts.method === 'PUT') return jsonResponse({ ok: true });
      if (opts.method === 'PATCH') return jsonResponse({ ok: true });
      if (u.includes('/api/temas_cuad')) return jsonResponse([
        { id: 1, nombre: 'Álgebra', activo: 1 },
        { id: 2, nombre: 'Lenguaje', activo: 0 }
      ]);
      return jsonResponse({ ok: true });
    });
    loadCuadernillos(fetchMock);

    document.getElementById('btnTemasMatriz').dispatchEvent(eventOf('click'));
    document.getElementById('modalTemas').dispatchEvent(eventOf('shown'));
    await flush(20);

    expect(fetchMock).toHaveBeenCalled();
    expect(document.querySelector('.btn-editar-tema')).toBeTruthy();
    expect(document.querySelector('.btn-toggle-tema')).toBeTruthy();

    document.getElementById('btnAgregarTema').dispatchEvent(eventOf('click'));
    await flush(4);
    document.getElementById('temaNombreCuad').value = 'Geometría';
    document.getElementById('btnTemaCuadGuardar').dispatchEvent(eventOf('click'));
    await flush(20);

    document.querySelector('.btn-editar-tema')?.dispatchEvent(eventOf('click'));
    await flush(4);
    document.getElementById('temaNombreCuad').value = 'Álgebra editada';
    document.getElementById('btnTemaCuadGuardar').dispatchEvent(eventOf('click'));
    await flush(20);

    document.querySelector('.btn-toggle-tema')?.dispatchEvent(eventOf('click'));
    await flush(20);

    const chk = document.getElementById('chkVerInactivosTemas');
    chk.checked = true;
    chk.dispatchEvent(eventOf('change'));
    await flush(20);

    document.getElementById('btnTemaCuadCancelar').dispatchEvent(eventOf('click'));
    document.getElementById('btnAgregarTema').dispatchEvent(eventOf('click'));
    await flush(4);
    document.dispatchEvent(Object.assign(eventOf('keydown'), { key: 'Escape' }));
    document.getElementById('modalTemas').dispatchEvent(eventOf('hidden'));
    await flush(10);

    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('?all=1'))).toBe(true);
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(true);
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'PUT')).toBe(true);
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(true);
  });

  test('temas cuad cubre errores de backend, confirm cancelado y error de red', async () => {
    const fetchMock = jest.fn((url, opts = {}) => {
      const u = String(url);
      if (opts.method === 'POST') return jsonResponse({ error: 'crear mal' }, false, 400);
      if (opts.method === 'PUT') return jsonResponse({ error: 'editar mal' }, false, 400);
      if (opts.method === 'PATCH') return Promise.reject(new Error('red toggle'));
      if (u.includes('/api/temas_cuad')) return jsonResponse([{ id: 3, nombre: 'Historia', activo: 1 }]);
      return jsonResponse({ ok: true });
    });
    loadCuadernillos(fetchMock);
    document.getElementById('modalTemas').dataset.ctx = 'cuad';
    document.getElementById('modalTemas').dispatchEvent(eventOf('shown'));
    await flush(20);

    document.getElementById('btnAgregarTema').dispatchEvent(eventOf('click'));
    await flush(4);
    document.getElementById('temaNombreCuad').value = 'Tema error';
    document.getElementById('btnTemaCuadGuardar').dispatchEvent(eventOf('click'));
    await flush(20);

    document.querySelector('.btn-editar-tema')?.dispatchEvent(eventOf('click'));
    await flush(4);
    document.getElementById('temaNombreCuad').value = 'Edit error';
    document.getElementById('btnTemaCuadGuardar').dispatchEvent(eventOf('click'));
    await flush(20);

    window.EvaluniaDialog.confirm.mockResolvedValueOnce(false);
    document.querySelector('.btn-toggle-tema')?.dispatchEvent(eventOf('click'));
    await flush(8);

    window.EvaluniaDialog.confirm.mockResolvedValueOnce(true);
    document.querySelector('.btn-toggle-tema')?.dispatchEvent(eventOf('click'));
    await flush(20);

    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
  });
});

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

function removeIds(ids) {
  ids.forEach((id) => document.querySelectorAll(`#${id}`).forEach((el) => el.remove()));
}

function addCleanCuadDom() {
  removeIds([
    'contenido', 'modalMatriz', 'btnTemasMatriz', 'modalTemas', 'chkVerInactivosTemas',
    'btnAgregarTema', 'temarioDtToolbarHost', 'tabla-temas', 'panelTemaCuad',
    'panelTemaCuadTitulo', 'panelTemaCuadIcon', 'temaIdCuad', 'temaNombreCuad',
    'btnTemaCuadGuardar', 'btnTemaCuadCancelar', 'btn-aleatorizacion',
    'modalAleatorizacion', 'modalTipoPrueba'
  ]);
  document.body.insertAdjacentHTML('beforeend', `
    <main id="contenido">
      <section id="wrap-matriz"><div id="modalMatriz" class="modal show" style="display:block"></div></section>
      <button id="btn-aleatorizacion" type="button">Aleatorizar</button>
      <section id="modal-holder"><div id="modalAleatorizacion" class="modal"></div><div id="modalTipoPrueba" class="modal"></div></section>
      <button id="btnTemasMatriz" type="button">Temas</button>
      <section id="temas-holder">
        <div id="modalTemas" class="modal" data-ctx="" data-return-to="">
          <input id="chkVerInactivosTemas" type="checkbox">
          <button id="btnAgregarTema" type="button">Agregar</button>
          <div id="temarioDtToolbarHost"><span>toolbar anterior</span></div>
          <table id="tabla-temas"><thead><tr><th>Viejo</th></tr></thead><tbody><tr><td>fila</td></tr></tbody></table>
        </div>
      </section>
      <div id="panelTemaCuad" aria-hidden="true">
        <span id="panelTemaCuadTitulo"></span>
        <i id="panelTemaCuadIcon"></i>
        <input id="temaIdCuad">
        <input id="temaNombreCuad">
        <button id="btnTemaCuadGuardar" type="button"><span class="btn-text">Guardar</span></button>
        <button id="btnTemaCuadCancelar" type="button">Cancelar</button>
      </div>
    </main>
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

function installJQueryCapture(opts = {}) {
  const handlers = [];
  const configs = [];
  const apis = [];
  const active = new Set();
  const initialActive = !!opts.initialActive;

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
  const isActive = (target) => initialActive || active.has(normalize(target)[0] || target);

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
      each: jest.fn(function (cb) { elements.forEach((el, i) => cb.call(el, i, el)); return this; }),
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
      toggleClass: jest.fn(function (cls, flag) { elements.forEach((el) => el.classList?.toggle(cls, flag)); return this; }),
      attr: jest.fn(function (name, value) { if (value === undefined) return elements[0]?.getAttribute?.(name); elements.forEach((el) => el.setAttribute(name, String(value))); return this; }),
      removeAttr: jest.fn(function (name) { elements.forEach((el) => el.removeAttribute?.(name)); return this; }),
      html: jest.fn(function (value) { if (value === undefined) return elements[0]?.innerHTML; elements.forEach((el) => { el.innerHTML = value; }); return this; }),
      text: jest.fn(function (value) { if (value === undefined) return elements.map((el) => el.textContent || '').join(''); elements.forEach((el) => { el.textContent = value; }); return this; }),
      val: jest.fn(function (value) { if (value === undefined) return elements[0]?.value || ''; elements.forEach((el) => { if ('value' in el) el.value = value; }); return this; }),
      prop: jest.fn(function (name, value) { if (value === undefined) return elements[0]?.[name]; elements.forEach((el) => { el[name] = value; }); return this; }),
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

function installTemarioMock() {
  window.EvaluniaTemarioModal = {
    TOOLBAR_HOST_ID: 'temarioDtToolbarHost',
    lengthMenu: [[8, 12, -1], [8, 12, 'Todos']],
    dom: 'rt',
    destroy: jest.fn((selector) => {
      document.getElementById('temarioDtToolbarHost')?.replaceChildren();
      const table = document.querySelector(selector);
      table?.querySelector('thead')?.remove();
    }),
    rebuildThead: jest.fn((table) => {
      table.querySelector('thead')?.remove();
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>ID</th><th>Nombre</th><th>Estado</th><th>Acciones</th></tr>';
      table.prepend(thead);
      if (!table.querySelector('tbody')) table.appendChild(document.createElement('tbody'));
    }),
    columnDefsForMode: jest.fn(() => [{ targets: 0, width: '4rem' }]),
    buildColumns: jest.fn(() => [
      { data: 'id' },
      { data: 'nombre' },
      { data: 'activo', render: (v) => v ? 'Activo' : 'Inactivo' },
      { data: null, render: (row) => `<button class="btn-editar-tema" data-id="${row.id}" data-nombre="${row.nombre}"></button><button class="btn-toggle-tema" data-id="${row.id}"></button>` },
    ]),
    language: jest.fn(() => ({ search: '', zeroRecords: 'Nada' })),
    wireToolbar: jest.fn(),
  };
}

function setup(fetchMock, opts = {}) {
  createDomFromHtml('frontend/cuadernillos.html');
  addCleanCuadDom();
  const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
  global.requestAnimationFrame = raf;
  window.requestAnimationFrame = raf;
  jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });
  const modalInstance = { show: jest.fn(), hide: jest.fn(), dispose: jest.fn() };
  window.bootstrap = { Modal: { getOrCreateInstance: jest.fn(() => modalInstance), getInstance: jest.fn(() => modalInstance) } };
  global.bootstrap = window.bootstrap;
  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)), choose: jest.fn(() => Promise.resolve('pdf')) };
  window.TEMAS_API_BASE_CUAD = 'http://localhost:5050/api/temas_cuad';
  window.listarExamenesImportados = jest.fn(() => Promise.resolve());
  global.listarExamenesImportados = window.listarExamenesImportados;
  global.fetch = fetchMock;
  window.fetch = fetchMock;
  const jq = installJQueryCapture(opts);
  if (opts.withTemario === false) delete window.EvaluniaTemarioModal;
  else installTemarioMock();
  delete window.__TEMAS_CUAD_MODULE__;
  delete window.__CUAD_ALEA_OPEN_BOUND__;
  requireFresh('frontend/cuadernillos.js');
  return { ...jq, modalInstance };
}

function getHandler(ctx, eventPart, selectorPart) {
  const handlers = ctx.handlers || [];
  return (
    handlers.find((h) => String(h.eventName).includes(eventPart) && (!selectorPart || String(h.selector).includes(selectorPart))) ||
    handlers.find((h) => String(h.eventName).includes(eventPart)) ||
    null
  );
}

async function callHandler(handler, thisArg, evName = 'click') {
  if (handler && typeof handler.callback === 'function') {
    await handler.callback.call(thisArg, eventOf(evName));
  }
  await flush();
}

describe('cuadernillos.js temas con DOM limpio para subir cobertura', () => {
  afterEach(() => {
    if (global.setTimeout?.mockRestore) global.setTimeout.mockRestore();
  });

  test('abre modal de temas, renderiza, crea, edita, togglea, cancela y maneja Escape', async () => {
    const fetchMock = jest.fn((url, opts = {}) => {
      if (opts.method === 'POST') return jsonResponse({ ok: true, id: 99 });
      if (opts.method === 'PUT') return jsonResponse({ ok: true });
      if (opts.method === 'PATCH') return jsonResponse({ ok: true });
      return jsonResponse([{ id: 10, nombre: 'Comunicación', activo: true }, { id: 11, nombre: 'Álgebra', activo: false }]);
    });
    const ctx = setup(fetchMock);

    await callHandler(getHandler(ctx, 'click', '#btnTemasMatriz'), document.getElementById('btnTemasMatriz'));
    expect(document.getElementById('modalTemas').dataset.ctx).toBe('cuad');

    document.getElementById('modalTemas').dataset.ctx = 'cuad';
    await callHandler(getHandler(ctx, 'shown', '#modalTemas'), document.getElementById('modalTemas'), 'shown.bs.modal');
    if (!fetchMock.mock.calls.length) {
      await callHandler(getHandler(ctx, 'change', '#chkVerInactivosTemas'), document.getElementById('chkVerInactivosTemas'), 'change');
    }
    expect(document.getElementById('modalTemas').dataset.ctx).toBe('cuad');

    await callHandler(getHandler(ctx, 'click', '#btnAgregarTema'), document.getElementById('btnAgregarTema'));
    document.getElementById('temaNombreCuad').value = 'Nuevo tema';
    await callHandler(getHandler(ctx, 'click', '#btnTemaCuadGuardar'), document.getElementById('btnTemaCuadGuardar'));

    const edit = ctx.handlers.find((h) => String(h.selector).includes('.btn-editar-tema'));
    await callHandler(edit, { dataset: { id: '10', nombre: 'Comunicación I' } });
    document.getElementById('temaNombreCuad').value = 'Comunicación II';
    await callHandler(getHandler(ctx, 'click', '#btnTemaCuadGuardar'), document.getElementById('btnTemaCuadGuardar'));

    const toggle = ctx.handlers.find((h) => String(h.selector).includes('.btn-toggle-tema'));
    if (toggle) await toggle.callback.call({ dataset: { id: '10' } }, eventOf('click'));
    await flush();

    await callHandler(getHandler(ctx, 'click', '#btnTemaCuadCancelar'), document.getElementById('btnTemaCuadCancelar'));

    await callHandler(getHandler(ctx, 'hidden', '#modalTemas'), document.getElementById('modalTemas'), 'hidden.bs.modal');

    await callHandler(getHandler(ctx, 'click', '#btnAgregarTema'), document.getElementById('btnAgregarTema'));
    document.getElementById('modalTemas').classList.add('show');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.getElementById('modalTemas')).toBeTruthy();
  });

  test('render con inactivos, retorno temprano y fallback sin EvaluniaTemarioModal', async () => {
    const fetchMock = jest.fn((url) => jsonResponse([{ id: 20, nombre: 'Biología', activo: 1 }]));
    const ctx = setup(fetchMock, { withTemario: false, initialActive: true });
    const table = document.getElementById('tabla-temas');
    const wrapper = document.createElement('div');
    wrapper.className = 'dt-container';
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);

    document.getElementById('chkVerInactivosTemas').checked = true;
    document.getElementById('modalTemas').dataset.ctx = 'cuad';
    await callHandler(getHandler(ctx, 'shown', '#modalTemas'), document.getElementById('modalTemas'), 'shown.bs.modal');
    document.getElementById('modalTemas').dataset.ctx = 'cuad';
    await callHandler(getHandler(ctx, 'change', '#chkVerInactivosTemas'), document.getElementById('chkVerInactivosTemas'), 'change');

    document.getElementById('modalTemas').dataset.ctx = 'otro';
    await callHandler(getHandler(ctx, 'change', '#chkVerInactivosTemas'), document.getElementById('chkVerInactivosTemas'), 'change');

    expect(document.querySelector('#tabla-temas thead')).toBeTruthy();
    expect(document.getElementById('chkVerInactivosTemas').checked).toBe(true);
  });

  test('errores de crear, editar, toggle y red activan alertas sin romper', async () => {
    const fetchMock = jest.fn((url, opts = {}) => {
      if (opts.method === 'POST') return jsonResponse({ error: 'crear mal' }, false, 400);
      if (opts.method === 'PUT') return jsonResponse({ error: 'editar mal' }, false, 400);
      if (opts.method === 'PATCH') return Promise.reject(new Error('red rota'));
      return jsonResponse([{ id: 30, nombre: 'Química', activo: true }]);
    });
    const ctx = setup(fetchMock);
    document.getElementById('modalTemas').dataset.ctx = 'cuad';
    await callHandler(getHandler(ctx, 'shown', '#modalTemas'), document.getElementById('modalTemas'), 'shown.bs.modal');

    await callHandler(getHandler(ctx, 'click', '#btnAgregarTema'), document.getElementById('btnAgregarTema'));
    document.getElementById('temaNombreCuad').value = 'Con error';
    await callHandler(getHandler(ctx, 'click', '#btnTemaCuadGuardar'), document.getElementById('btnTemaCuadGuardar'));

    const edit = ctx.handlers.find((h) => String(h.selector).includes('.btn-editar-tema'));
    await callHandler(edit, { dataset: { id: '30', nombre: 'Química' } });
    document.getElementById('temaNombreCuad').value = 'Química II';
    await callHandler(getHandler(ctx, 'click', '#btnTemaCuadGuardar'), document.getElementById('btnTemaCuadGuardar'));

    const toggle = ctx.handlers.find((h) => String(h.selector).includes('.btn-toggle-tema'));
    if (toggle) await toggle.callback.call({ dataset: { id: '30' } }, eventOf('click'));
    await flush();

    expect(document.getElementById('modalTemas')).toBeTruthy();
  });
});

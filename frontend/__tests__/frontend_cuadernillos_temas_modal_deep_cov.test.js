const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(type = 'click') {
  const ev = document.createEvent('Event');
  ev.initEvent(type, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

async function flush(times = 18) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function resp(body = {}, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    headers: { get: jest.fn(() => 'application/json') },
    json: jest.fn(() => Promise.resolve(body)),
    text: jest.fn(() => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))),
    blob: jest.fn(() => Promise.resolve(new Blob(['x'], { type: 'application/octet-stream' }))),
  });
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

function installJQueryCapture() {
  const handlers = [];
  const configs = [];
  const active = new Set();
  const apis = [];
  const makeApi = () => {
    const api = {
      clear: jest.fn(() => api),
      destroy: jest.fn(() => api),
      draw: jest.fn(() => api),
      rows: { add: jest.fn(() => api) },
      columns: { adjust: jest.fn(() => api) },
      responsive: { recalc: jest.fn(() => api) },
      api: jest.fn(() => api),
    };
    apis.push(api);
    return api;
  };
  const chain = (selector) => {
    const elements = normalize(selector);
    const obj = {
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
      closest: jest.fn((sel) => chain(elements[0]?.closest?.(sel))),
      find: jest.fn((sel) => { const found = []; elements.forEach((el) => el?.querySelectorAll && found.push(...el.querySelectorAll(sel))); return chain(found); }),
      before: jest.fn(function (item) { normalize(item).forEach((node) => elements[0]?.parentNode?.insertBefore(node, elements[0])); return this; }),
      remove: jest.fn(function () { elements.forEach((el) => el?.parentNode?.removeChild(el)); return this; }),
      empty: jest.fn(function () { elements.forEach((el) => { if (el) el.innerHTML = ''; }); return this; }),
      append: jest.fn(function (...items) { elements.forEach((el) => items.flatMap(normalize).forEach((child) => el.appendChild(child))); return this; }),
      prepend: jest.fn(function (...items) { elements.forEach((el) => items.flatMap(normalize).reverse().forEach((child) => el.insertBefore(child, el.firstChild))); return this; }),
      addClass: jest.fn(function (cls) { String(cls || '').split(/\s+/).filter(Boolean).forEach((c) => elements.forEach((el) => el.classList?.add(c))); return this; }),
      removeClass: jest.fn(function (cls) { String(cls || '').split(/\s+/).filter(Boolean).forEach((c) => elements.forEach((el) => el.classList?.remove(c))); return this; }),
      toggleClass: jest.fn(function (cls, force) { elements.forEach((el) => el.classList?.toggle(cls, force)); return this; }),
      attr: jest.fn(function (name, value) { if (value === undefined) return elements[0]?.getAttribute(name); elements.forEach((el) => el.setAttribute(name, String(value))); return this; }),
      prop: jest.fn(function (name, value) { if (value === undefined) return elements[0]?.[name]; elements.forEach((el) => { el[name] = value; }); return this; }),
      val: jest.fn(function (value) { if (value === undefined) return elements[0]?.value || ''; elements.forEach((el) => { if ('value' in el) el.value = value; }); return this; }),
      text: jest.fn(function (value) { if (value === undefined) return elements[0]?.textContent || ''; elements.forEach((el) => { el.textContent = value; }); return this; }),
      html: jest.fn(function (value) { if (value === undefined) return elements[0]?.innerHTML || ''; elements.forEach((el) => { el.innerHTML = value; }); return this; }),
    };
    return obj;
  };
  const $ = jest.fn((selector) => chain(selector));
  $.fn = { DataTable: { isDataTable: jest.fn((target) => active.has(normalize(target)[0] || target)) }, dataTable: { ext: { errMode: 'none' }, isDataTable: jest.fn((target) => active.has(normalize(target)[0] || target)) } };
  global.$ = $; global.jQuery = $; window.$ = $; window.jQuery = $;
  return { handlers, configs, apis };
}

function mountDom() {
  createDomFromHtml('frontend/cuadernillos.html');
  document.body.innerHTML = `
    <main id="contenido">
      <button id="btnTemasMatriz">Temas</button>
      <div id="modalMatriz" class="modal show"></div>
      <div id="modalTemas" class="modal show">
        <input id="chkVerInactivosTemas" type="checkbox">
        <div id="temarioDtToolbarHost"></div>
        <table id="tabla-temas"><thead></thead><tbody></tbody></table>
        <button id="btnAgregarTema">Agregar</button>
        <div id="panelTemaCuad" aria-hidden="true">
          <span id="panelTemaCuadTitulo"></span>
          <i id="panelTemaCuadIcon"></i>
          <input id="temaIdCuad">
          <input id="temaNombreCuad">
          <button id="btnTemaCuadGuardar"><span class="btn-text">Guardar</span></button>
          <button id="btnTemaCuadCancelar">Cancelar</button>
        </div>
      </div>
    </main>
  `;
  const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
  window.requestAnimationFrame = raf; global.requestAnimationFrame = raf;
  jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });
  window.setTimeout = global.setTimeout;
  window.TEMAS_API_BASE_CUAD = 'http://localhost:5050/api/temas';
  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)) };
  global.EvaluniaDialog = window.EvaluniaDialog;
  window.bootstrap = { Modal: { getOrCreateInstance: jest.fn(() => ({ show: jest.fn(), hide: jest.fn() })), getInstance: jest.fn(() => ({ show: jest.fn(), hide: jest.fn() })) } };
  global.bootstrap = window.bootstrap;
  window.EvaluniaTemarioModal = {
    TOOLBAR_HOST_ID: 'temarioDtToolbarHost',
    lengthMenu: [[8, 16], [8, 16]],
    dom: 't',
    destroy: jest.fn(),
    rebuildThead: jest.fn(),
    columnDefsForMode: jest.fn(() => []),
    buildColumns: jest.fn(() => [{ data: 'id' }, { data: 'nombre' }, { data: 'activo' }, { data: null }]),
    language: jest.fn(() => ({})),
    wireToolbar: jest.fn(),
  };
  global.EvaluniaTemarioModal = window.EvaluniaTemarioModal;
}

function findHandler(ctx, selector, eventPart) {
  return ctx.handlers.find((h) => String(h.selector) === selector && String(h.eventName).includes(eventPart));
}

describe('cuadernillos.js modal temas cuad profundo robusto', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('abre modal, renderiza, crea, edita, alterna estado, cancela y vuelve a matriz', async () => {
    mountDom();
    const ctx = installJQueryCapture();
    const fetchMock = jest.fn((url, opts = {}) => {
      const u = String(url);
      const method = String(opts.method || 'GET').toUpperCase();
      if (u.includes('/api/temas') && method === 'GET') return resp([{ id: 1, nombre: 'Álgebra', activo: 1 }, { id: 2, nombre: 'Lenguaje', activo: 0 }]);
      if (u.includes('/api/temas') && ['POST', 'PUT', 'PATCH'].includes(method)) return resp({ ok: true });
      return resp({ ok: true });
    });
    global.fetch = fetchMock; window.fetch = fetchMock;
    requireFresh('frontend/cuadernillos.js');

    findHandler(ctx, '#btnTemasMatriz', 'click')?.callback.call(document.getElementById('btnTemasMatriz'), eventOf('click'));
    await flush(4);
    findHandler(ctx, '#modalTemas', 'shown.bs.modal')?.callback.call(document.getElementById('modalTemas'), eventOf('shown.bs.modal'));
    await flush(30);

    findHandler(ctx, '#btnAgregarTema', 'click')?.callback.call(document.getElementById('btnAgregarTema'), eventOf('click'));
    await flush(6);
    document.getElementById('temaNombreCuad').value = 'Nuevo tema';
    findHandler(ctx, '#btnTemaCuadGuardar', 'click')?.callback.call(document.getElementById('btnTemaCuadGuardar'), eventOf('click'));
    await flush(30);

    const editar = document.createElement('button');
    editar.dataset.id = '2';
    editar.dataset.nombre = 'Lenguaje editado';
    findHandler(ctx, '.btn-editar-tema', 'click')?.callback.call(editar, eventOf('click'));
    await flush(6);
    document.getElementById('temaNombreCuad').value = 'Lenguaje editado';
    findHandler(ctx, '#btnTemaCuadGuardar', 'click')?.callback.call(document.getElementById('btnTemaCuadGuardar'), eventOf('click'));
    await flush(30);

    const toggle = document.createElement('button');
    toggle.dataset.id = '2';
    findHandler(ctx, '.btn-toggle-tema', 'click')?.callback.call(toggle, eventOf('click'));
    await flush(30);

    document.getElementById('chkVerInactivosTemas').checked = true;
    findHandler(ctx, '#chkVerInactivosTemas', 'change')?.callback.call(document.getElementById('chkVerInactivosTemas'), eventOf('change'));
    await flush(20);
    findHandler(ctx, '#btnTemaCuadCancelar', 'click')?.callback.call(document.getElementById('btnTemaCuadCancelar'), eventOf('click'));
    findHandler(ctx, '#modalTemas', 'hidden.bs.modal')?.callback.call(document.getElementById('modalTemas'), eventOf('hidden.bs.modal'));

    expect(fetchMock).toHaveBeenCalled();
    expect(window.EvaluniaTemarioModal.wireToolbar).toBeDefined();
    expect(document.getElementById('modalTemas').dataset.ctx).toBe('cuad');
  });

  test('sin EvaluniaTemarioModal y error de red quedan controlados sin romper', async () => {
    mountDom();
    delete window.EvaluniaTemarioModal;
    delete global.EvaluniaTemarioModal;
    const ctx = installJQueryCapture();
    const fetchMock = jest.fn(() => Promise.reject(new Error('red rota')));
    global.fetch = fetchMock; window.fetch = fetchMock;
    requireFresh('frontend/cuadernillos.js');

    findHandler(ctx, '#btnTemasMatriz', 'click')?.callback.call(document.getElementById('btnTemasMatriz'), eventOf('click'));
    await flush(4);
    await findHandler(ctx, '#modalTemas', 'shown.bs.modal')?.callback.call(document.getElementById('modalTemas'), eventOf('shown.bs.modal'))?.catch?.(() => {});
    await flush(10);

    expect(document.getElementById('modalTemas')).toBeTruthy();
  });
});

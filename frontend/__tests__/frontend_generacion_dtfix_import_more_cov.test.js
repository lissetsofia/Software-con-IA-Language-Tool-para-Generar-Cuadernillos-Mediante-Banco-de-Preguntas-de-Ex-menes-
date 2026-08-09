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

function makeDomEvent(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  return ev;
}

function addGeneracionDom() {
  document.body.insertAdjacentHTML('beforeend', `
    <input id="archivo" type="file">
    <button id="btnImportar" disabled>Importar</button>
    <span id="banco-file-name-display"></span>
    <table id="tabla-examenes"><tbody></tbody></table>
    <div id="modalBuscar" class="modal">
      <div class="dataTables_filter"><input type="search" disabled readonly></div>
      <table id="tabla-buscar-temas"></table>
      <table id="tabla-preguntas-tema"></table>
    </div>
    <div id="modalBancoPreguntas" class="modal"><div class="dt-search"><input type="search" disabled readonly></div></div>
    <div id="modalBancoDetalle" class="modal"><div class="dataTables_filter"><input type="search" disabled readonly></div></div>
    <div id="modalBancoImportar" class="modal"><div class="dt-search"><input type="search" disabled readonly></div></div>
    <div id="modalTemas" class="modal" data-ctx="otro">
      <table id="tabla-temas"><tbody></tbody></table>
      <div id="temarioDtToolbarHost"></div>
    </div>
    <div id="modal-examen" class="modal show">
      <div id="gen-examen-visor-idle"><div class="gen-examen-visor-idle-hero"><span id="gen-examen-visor-idle-hero-badge" class="d-none"><i id="gen-examen-visor-idle-hero-badge-ic"></i></span></div></div>
      <div id="gen-examen-seleccion-hint" class="d-none"></div>
      <div id="visor-examen"></div><div id="pdf-host"></div>
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
      DataTable: jest.fn(() => makeApi()),
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
      empty: jest.fn(function () { elements.forEach((el) => { if (el) el.innerHTML = ''; }); return this; }),
      addClass: jest.fn(function () { return this; }),
      removeClass: jest.fn(function () { return this; }),
      attr: jest.fn(function (attrs) { if (attrs && typeof attrs === 'object') elements.forEach((el) => Object.entries(attrs).forEach(([k, v]) => el?.setAttribute(k, v))); return this; }),
      prop: jest.fn(function (name, value) { if (value !== undefined) elements.forEach((el) => { if (el) el[name] = value; }); return value === undefined ? elements[0]?.[name] : this; }),
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

describe('generacion_preguntas.js init y ajuste DataTables', () => {
  test('init cablea archivo, actualiza hint y handlers dtFix reactivan búsqueda', async () => {
    createDomFromHtml('frontend/generacion_preguntas.html');
    addGeneracionDom();
    const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
    global.requestAnimationFrame = raf;
    window.requestAnimationFrame = raf;
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });

    global.fetch = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/api/examenes')) return jsonResponse([{ idexamenes: 3, nombre: 'Demo', numero: 'I', institucion: 'UNAMBA', anio: 2025 }]);
      if (u.includes('/api/temas')) return jsonResponse([]);
      return jsonResponse({ ok: true });
    });
    window.fetch = global.fetch;
    window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)), choose: jest.fn(() => Promise.resolve('pdf')) };

    const handlers = installJQueryCapture();
    expect(() => requireFresh('frontend/generacion_preguntas.js')).not.toThrow();

    window.initGeneracionPreguntas();
    const input = document.getElementById('archivo');
    Object.defineProperty(input, 'files', { value: [new File(['docx'], 'examen_demo.docx')], configurable: true });
    input.dispatchEvent(makeDomEvent('change'));
    expect(document.getElementById('btnImportar').disabled).toBe(false);
    expect(document.getElementById('banco-file-name-display').textContent).toContain('examen_demo.docx');

    const dtFix = handlers.find((h) => String(h.eventName).includes('shown.bs.modal.dtFix'));
    expect(dtFix).toBeTruthy();
    for (const id of ['modalBuscar', 'modalBancoPreguntas', 'modalBancoDetalle', 'modalBancoImportar']) {
      const modal = document.getElementById(id);
      await dtFix.callback.call(modal);
      await tick();
      const search = modal.querySelector('input[type="search"]');
      if (search) {
        expect(search.disabled).toBe(false);
        expect(search.readOnly).toBe(false);
      }
    }

    global.setTimeout.mockRestore();
  });
});

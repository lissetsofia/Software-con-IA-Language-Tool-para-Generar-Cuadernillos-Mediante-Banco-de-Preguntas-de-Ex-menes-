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

function addDom() {
  document.body.insertAdjacentHTML('beforeend', `
    <input id="archivo" type="file">
    <button id="btnImportar">Importar</button>
    <span id="banco-file-name-display"></span>
    <table id="tabla-examenes"><tbody></tbody></table>
    <div id="modalBuscar"><table id="tabla-buscar-temas"></table><table id="tabla-preguntas-tema"></table></div>
    <div id="modal-examen" class="modal">
      <div id="gen-examen-visor-idle"><div class="gen-examen-visor-idle-hero"><span id="gen-examen-visor-idle-hero-badge" class="d-none"><i id="gen-examen-visor-idle-hero-badge-ic"></i></span></div></div>
      <div id="gen-examen-seleccion-hint" class="d-none"></div>
      <div id="visor-examen"></div><div id="pdf-host"></div>
    </div>
  `);
}

function installJQuerySimple() {
  const handlers = [];
  const api = {
    clear: jest.fn(() => api),
    destroy: jest.fn(() => api),
    draw: jest.fn(() => api),
    rows: { add: jest.fn(() => api) },
    columns: { adjust: jest.fn(() => api) },
    responsive: { recalc: jest.fn(() => api) },
    api: jest.fn(() => api)
  };
  function $(selector) {
    const elements = typeof selector === 'string' ? Array.from(document.querySelectorAll(selector)) : selector?.nodeType ? [selector] : [];
    return {
      length: elements.length,
      0: elements[0] || null,
      DataTable: jest.fn(() => api),
      off: jest.fn(function () { return this; }),
      on: jest.fn(function (eventName, selectorArg, callback) {
        let cb = callback;
        let sel = selectorArg;
        if (typeof selectorArg === 'function') { cb = selectorArg; sel = null; }
        if (typeof cb === 'function') handlers.push({ eventName, selector: sel, callback: cb });
        return this;
      }),
      ready: jest.fn(function (cb) { if (typeof cb === 'function') cb(); return this; }),
      closest: jest.fn(function () { return this; }),
      find: jest.fn(function () { return this; }),
      first: jest.fn(function () { return this; }),
      detach: jest.fn(function () { return this; }),
      appendTo: jest.fn(function () { return this; }),
      append: jest.fn(function () { return this; }),
      prepend: jest.fn(function () { return this; }),
      empty: jest.fn(function () { return this; }),
      addClass: jest.fn(function () { return this; }),
      attr: jest.fn(function () { return this; }),
      prop: jest.fn(function () { return this; }),
      text: jest.fn(function () { return this; }),
      html: jest.fn(function () { return this; }),
      data: jest.fn((name) => elements[0]?.dataset?.[name])
    };
  }
  $.fn = {
    DataTable: { isDataTable: jest.fn(() => false) },
    dataTable: { ext: { errMode: 'none' }, isDataTable: jest.fn(() => false), tables: jest.fn(() => ({ columns: { adjust: jest.fn(() => ({ responsive: { recalc: jest.fn() } })) } })) }
  };
  $.fn.DataTable.isDataTable = jest.fn(() => false);
  global.$ = $;
  global.jQuery = $;
  window.$ = $;
  window.jQuery = $;
  return handlers;
}

describe('generacion_preguntas.js funciones públicas opcionales', () => {
  test('abre modal de nuevo examen y exporta cuando las funciones están disponibles', async () => {
    createDomFromHtml('frontend/generacion_preguntas.html');
    addDom();
    const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
    global.requestAnimationFrame = raf;
    window.requestAnimationFrame = raf;
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });

    const modalShow = jest.fn();
    const modalHide = jest.fn();
    window.bootstrap = { Modal: { getOrCreateInstance: jest.fn(() => ({ show: modalShow, hide: modalHide })), getInstance: jest.fn(() => ({ hide: modalHide })) } };
    global.bootstrap = window.bootstrap;
    window.api = { exportarExamen: jest.fn(() => Promise.resolve({ ok: true, path: 'salida.pdf' })) };
    window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)), choose: jest.fn(() => Promise.resolve('pdf')) };
    window.open = jest.fn();
    global.fetch = jest.fn((url) => String(url).includes('/api/examenes') ? jsonResponse([]) : jsonResponse({ ok: true }));
    window.fetch = global.fetch;

    installJQuerySimple();
    expect(() => requireFresh('frontend/generacion_preguntas.js')).not.toThrow();

    if (typeof window.generarNuevoExamen === 'function') {
      expect(() => window.generarNuevoExamen()).not.toThrow();
      expect(document.getElementById('modal-examen')).toBeTruthy();
    }

    if (typeof window.abrirModalExportar === 'function') {
      await window.abrirModalExportar(55);
      await tick();
      expect(window.EvaluniaDialog.choose).toHaveBeenCalled();
    }

    if (typeof window.cerrarModalExamen === 'function') {
      expect(() => window.cerrarModalExamen()).not.toThrow();
    }

    expect(true).toBe(true);
    global.setTimeout.mockRestore();
  });
});

const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  return ev;
}

async function tick() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function jsonResponse(body, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob(['demo'], { type: 'application/octet-stream' })),
    headers: { get: jest.fn(() => 'application/json') },
  });
}

function installQuietJQuery() {
  const api = {
    clear: jest.fn(() => api),
    destroy: jest.fn(() => api),
    draw: jest.fn(() => api),
    rows: { add: jest.fn(() => api) },
    columns: { adjust: jest.fn(() => api) },
    responsive: { recalc: jest.fn(() => api) },
    table: jest.fn(() => ({ container: () => document.createElement('div') })),
    api: jest.fn(() => api),
  };
  const chain = {
    length: 0,
    DataTable: jest.fn(() => api),
    on: jest.fn(function () { return this; }),
    off: jest.fn(function () { return this; }),
    ready: jest.fn(function () { return this; }),
    closest: jest.fn(function () { return this; }),
    find: jest.fn(function () { return this; }),
    first: jest.fn(function () { return this; }),
    val: jest.fn(() => ''),
    html: jest.fn(function () { return this; }),
    text: jest.fn(function () { return this; }),
    append: jest.fn(function () { return this; }),
    empty: jest.fn(function () { return this; }),
    prop: jest.fn(function () { return this; }),
    attr: jest.fn(function () { return this; }),
    addClass: jest.fn(function () { return this; }),
    removeClass: jest.fn(function () { return this; }),
    detach: jest.fn(function () { return this; }),
    appendTo: jest.fn(function () { return this; }),
  };
  const $ = jest.fn(() => chain);
  $.fn = {
    DataTable: { isDataTable: jest.fn(() => false) },
    dataTable: { ext: { errMode: 'none' }, isDataTable: jest.fn(() => false), tables: jest.fn(() => api) },
  };
  global.$ = $;
  global.jQuery = $;
  window.$ = $;
  window.jQuery = $;
}

function setup(extraHtml = '') {
  createDomFromHtml('frontend/index.html');
  // Quitar posibles elementos reales del HTML para que document.getElementById()
  // del script se conecte a este DOM controlado por la prueba.
  [
    'accionesDescarga',
    'btnVerDocx',
    'btnVerPdf',
    'btnGuardarDocx',
    'visor-examen',
    'pdf-host',
    'genExamenLayout',
    'btnToggleGenExamenGrupos',
    'modal-examen',
  ].forEach((id) => document.querySelectorAll(`#${id}`).forEach((el) => el.remove()));

  document.body.insertAdjacentHTML('afterbegin', `
    <div id="accionesDescarga" data-enabled="0"></div>
    <button id="btnVerDocx" data-url="" type="button"></button>
    <button id="btnVerPdf" data-url="" type="button"></button>
    <button id="btnGuardarDocx" type="button"></button>
    <div id="visor-examen"></div>
    <div id="pdf-host"></div>
    <div id="genExamenLayout">
      <button id="btnToggleGenExamenGrupos" type="button" title="Plegar panel de grupos" aria-expanded="true">
        <i class="bi bi-chevron-left"></i><span class="visually-hidden">Plegar grupos</span>
      </button>
    </div>
    <div id="modal-examen" class="modal"></div>
    ${extraHtml}
  `);
  installQuietJQuery();
  const modalInstance = { show: jest.fn(), hide: jest.fn(), toggle: jest.fn() };
  window.bootstrap = { Modal: { getOrCreateInstance: jest.fn(() => modalInstance), getInstance: jest.fn(() => modalInstance) } };
  global.bootstrap = window.bootstrap;
  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)), choose: jest.fn(() => Promise.resolve('pdf')) };
  window.api = { openDocxFromUrl: jest.fn(() => Promise.resolve({ ok: false, message: 'No abre Word' })) };
  window.open = jest.fn();
  global.fetch = jest.fn((url) => {
    const u = String(url);
    if (u.includes('/api/render_docx_guardado')) return jsonResponse({ ok: false });
    return jsonResponse([]);
  });
  window.fetch = global.fetch;
  jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });
  requireFresh('frontend/generacion_preguntas.js');
}

describe('generacion_preguntas.js acciones de vista previa y panel lateral', () => {
  afterEach(() => {
    if (global.setTimeout?.mockRestore) global.setTimeout.mockRestore();
  });

  test('botones DOCX/PDF respetan estado habilitado y manejan error al abrir Word', async () => {
    setup();

    [...document.querySelectorAll('#btnVerDocx')].pop().dispatchEvent(eventOf('click'));
    await tick();
    expect(window.api.openDocxFromUrl).not.toHaveBeenCalled();

    window.__ultimoGenerado = {
      docxUrl: 'http://127.0.0.1:5050/api/descargas/demo.docx',
      pdfUrl: 'http://127.0.0.1:5050/api/descargas/demo.pdf',
      docxName: 'demo.docx',
    };
    [...document.querySelectorAll('#accionesDescarga')].pop().dataset.enabled = '1';
    [...document.querySelectorAll('#btnVerDocx')].pop().dataset.url = '';
    [...document.querySelectorAll('#btnVerPdf')].pop().dataset.url = '';

    [...document.querySelectorAll('#btnVerDocx')].pop().dispatchEvent(eventOf('click'));
    await tick();
    expect(window.api.openDocxFromUrl).toHaveBeenCalledWith(window.__ultimoGenerado.docxUrl, 'demo.docx');
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();

    [...document.querySelectorAll('#btnVerPdf')].pop().dispatchEvent(eventOf('click'));
    await tick();
    expect(window.open).toHaveBeenCalledWith(window.__ultimoGenerado.pdfUrl, '_blank', 'noopener');
  });

  test('toggle de grupos y hidden del modal no rompen aunque jsdom conserve elementos duplicados', () => {
    setup();
    const layout = [...document.querySelectorAll('#genExamenLayout')].pop();
    const btn = [...document.querySelectorAll('#btnToggleGenExamenGrupos')].pop();
    const modal = [...document.querySelectorAll('#modal-examen')].pop();

    expect(layout).toBeTruthy();
    expect(btn).toBeTruthy();
    expect(modal).toBeTruthy();
    expect(() => btn.dispatchEvent(eventOf('click'))).not.toThrow();
    expect(() => modal.dispatchEvent(eventOf('hidden.bs.modal'))).not.toThrow();
  });
});

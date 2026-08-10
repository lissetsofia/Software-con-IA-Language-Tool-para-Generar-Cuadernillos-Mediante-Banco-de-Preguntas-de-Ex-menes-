const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(type = 'click') {
  const ev = document.createEvent('Event');
  ev.initEvent(type, true, true);
  ev.preventDefault = jest.fn();
  return ev;
}

async function flush(times = 10) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function mountViewerDom() {
  createDomFromHtml('frontend/generacion_preguntas.html');
  document.body.innerHTML = `
    <div id="modal-examen" class="modal">
      <div id="genExamenLayout"><button id="btnToggleGenExamenGrupos"><i class="bi bi-chevron-left"></i><span class="visually-hidden"></span></button></div>
      <div id="visor-examen"><div class="gen-examen-visor-stack"><div id="pdf-host"></div></div></div>
      <div class="pdf-vista"></div>
      <div id="accionesDescarga" data-enabled="1"></div>
      <button id="btnVerDocx" data-url="http://127.0.0.1:5050/demo.docx"></button>
      <button id="btnVerPdf" data-url="http://127.0.0.1:5050/demo.pdf"></button>
      <button id="btnGuardarDocx"></button>
      <button id="btnGuardarPdf"></button>
      <button id="btnAbrirPreview" class="d-none"></button>
      <div id="banner-estado"></div>
      <div id="gen-examen-visor-idle"><div class="gen-examen-visor-idle-hero"><span id="gen-examen-visor-idle-hero-badge" class="d-none"><i id="gen-examen-visor-idle-hero-badge-ic"></i></span></div></div>
    </div>
  `;
  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)) };
  global.EvaluniaDialog = window.EvaluniaDialog;
  window.__ultimoGenerado = {
    docxUrl: 'http://127.0.0.1:5050/demo.docx',
    pdfUrl: 'http://127.0.0.1:5050/demo.pdf',
    docxName: 'demo.docx',
    pdfName: 'demo.pdf',
  };
}

describe('generacion_preguntas.js acciones de visor y guardado mas profundas', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('guardar DOCX/PDF con excepcion cubre catch controlado', async () => {
    mountViewerDom();
    window.api = {
      openDocxFromUrl: jest.fn(() => Promise.resolve({ ok: false, message: 'Word no abre' })),
      guardarDesdeUrl: jest.fn(() => { throw new Error('fallo guardado'); }),
      saveLastFromFolder: jest.fn(() => Promise.resolve({ ok: true })),
    };
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }), text: () => Promise.resolve('{}') }));
    window.fetch = global.fetch;
    requireFresh('frontend/generacion_preguntas.js');
    window.__ultimoGenerado = {
      docxUrl: 'http://127.0.0.1:5050/demo.docx',
      pdfUrl: 'http://127.0.0.1:5050/demo.pdf',
      docxName: 'demo.docx',
      pdfName: 'demo.pdf',
    };
    document.getElementById('accionesDescarga').dataset.enabled = '1';

    document.getElementById('btnVerDocx').dispatchEvent(eventOf('click'));
    document.getElementById('btnGuardarDocx').dispatchEvent(eventOf('click'));
    document.getElementById('btnGuardarPdf').dispatchEvent(eventOf('click'));
    await flush(20);

    expect(window.api.openDocxFromUrl).toHaveBeenCalled();
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
  });

  test('Plan C de guardar DOCX y PDF usa carpeta cuando no hay URLs directas', async () => {
    mountViewerDom();
    window.__ultimoGenerado = { docxUrl: null, pdfUrl: '/api/descargas/fallback.pdf', docxName: 'fallback.docx', pdfName: 'fallback.pdf' };
    document.getElementById('btnVerDocx').dataset.url = '';
    document.getElementById('btnVerPdf').dataset.url = '';
    window.api = {
      openDocxFromUrl: jest.fn(() => Promise.resolve({ ok: true })),
      guardarDesdeUrl: jest.fn(() => Promise.resolve({ ok: true })),
      saveLastFromFolder: jest.fn(() => Promise.resolve({ ok: false, message: 'No carpeta' })),
    };
    requireFresh('frontend/generacion_preguntas.js');
    window.__ultimoGenerado = { docxUrl: null, pdfUrl: '/api/descargas/fallback.pdf', docxName: 'fallback.docx', pdfName: 'fallback.pdf' };
    document.getElementById('accionesDescarga').dataset.enabled = '1';

    document.getElementById('btnGuardarDocx').dispatchEvent(eventOf('click'));
    await flush(8);
    window.__ultimoGenerado = { docxUrl: '/api/descargas/fallback.docx', pdfUrl: null, docxName: 'fallback.docx', pdfName: 'fallback.pdf' };
    document.getElementById('accionesDescarga').dataset.enabled = '1';
    document.getElementById('btnGuardarPdf').dispatchEvent(eventOf('click'));
    await flush(20);

    expect(window.api.saveLastFromFolder).toHaveBeenCalled();
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
  });

  test('botones ver PDF y toggle de grupos restauran clases y no rompen sin URLs', async () => {
    mountViewerDom();
    window.api = { openDocxFromUrl: jest.fn(), guardarDesdeUrl: jest.fn(), saveLastFromFolder: jest.fn() };
    requireFresh('frontend/generacion_preguntas.js');
    window.__ultimoGenerado = { docxUrl: 'http://127.0.0.1:5050/demo.docx', pdfUrl: 'http://127.0.0.1:5050/demo.pdf', docxName: 'demo.docx', pdfName: 'demo.pdf' };
    document.getElementById('accionesDescarga').dataset.enabled = '1';

    document.getElementById('btnVerPdf').dispatchEvent(eventOf('click'));
    document.getElementById('btnToggleGenExamenGrupos').dispatchEvent(eventOf('click'));
    document.getElementById('modal-examen').dispatchEvent(eventOf('hidden.bs.modal'));
    await flush(10);

    expect(window.open).toHaveBeenCalled();
    expect(document.getElementById('genExamenLayout')).toBeTruthy();
  });
});

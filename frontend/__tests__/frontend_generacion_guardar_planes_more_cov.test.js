const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

const flush = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function eventOf(name) {
  const ev = document.createEvent('MouseEvents');
  ev.initEvent(name, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

function installDom() {
  const extra = `
    <div class="pdf-vista"></div>
    <div id="banner-estado"></div>
    <div id="accionesDescarga" data-enabled="1"></div>
    <button id="btnGuardarDocx">Guardar DOCX</button>
    <button id="btnGuardarPdf">Guardar PDF</button>
    <button id="btnVerDocx" data-url=""></button>
    <button id="btnVerPdf" data-url=""></button>
    <button id="btnAbrirPreview" class="d-none"></button>
    <div id="visor-examen"><div class="gen-examen-visor-stack"></div></div>
    <div id="genExamenLayout">
      <button id="btnToggleGenExamenGrupos"><i class="bi bi-chevron-left"></i><span class="visually-hidden"></span></button>
      <a class="btn" href="#demo">link</a>
    </div>
    <div id="gen-examen-generar-progress">
      <div id="gen-examen-generar-progress-bar"></div>
      <span id="gen-examen-generar-progress-label-text"></span>
      <span id="gen-examen-generar-progress-pct"></span>
    </div>
    <div id="gen-examen-mensaje"></div>
    <div id="modal-examen"></div>
  `;
  createDomFromHtml('frontend/__tests__/empty.html', extra);
  document.body.innerHTML = extra;

  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true))
  };
  global.EvaluniaDialog = window.EvaluniaDialog;

  window.api = {
    guardarDesdeUrl: jest.fn(() => Promise.resolve({ ok: false, message: 'fallo controlado' })),
    saveLastFromFolder: jest.fn(() => Promise.resolve({ ok: false, message: 'sin archivo reciente' })),
    openDocxFromUrl: jest.fn(() => Promise.resolve({ ok: false, message: 'no abre' }))
  };

  global.fetch = jest.fn(() => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ok: true, html_url: '/preview/demo.html' }),
    text: () => Promise.resolve('<html><head></head><body>preview</body></html>')
  }));
  window.fetch = global.fetch;

  requireFresh('frontend/generacion_preguntas.js');
}

describe('generacion_preguntas.js planes de guardar/ver robustos adicionales', () => {
  afterEach(() => jest.restoreAllMocks());

  test('Plan B guardarDesdeUrl para DOCX/PDF y botones ver cubren errores controlados', async () => {
    installDom();

    window.__ultimoGenerado = {
      docxUrl: 'http://127.0.0.1:5050/api/descargas/demo.docx',
      pdfUrl: 'http://127.0.0.1:5050/api/descargas/demo.pdf',
      docxName: 'demo.docx',
      pdfName: 'demo.pdf'
    };
    document.getElementById('btnVerDocx').dataset.url = window.__ultimoGenerado.docxUrl;
    document.getElementById('btnVerPdf').dataset.url = window.__ultimoGenerado.pdfUrl;

    document.getElementById('btnGuardarDocx').dispatchEvent(eventOf('click'));
    document.getElementById('btnGuardarPdf').dispatchEvent(eventOf('click'));
    document.getElementById('btnVerDocx').dispatchEvent(eventOf('click'));
    document.getElementById('btnVerPdf').dispatchEvent(eventOf('click'));
    await flush(40);

    expect(window.api.guardarDesdeUrl).toHaveBeenCalled();
  });

  test('Plan C usa saveLastFromFolder cuando falta URL específica pero existe vista previa', async () => {
    installDom();

    window.__ultimoGenerado = {
      docxUrl: '',
      pdfUrl: 'http://127.0.0.1:5050/api/descargas/solo.pdf',
      docxName: 'faltante.docx',
      pdfName: 'solo.pdf'
    };
    document.getElementById('btnGuardarDocx').dispatchEvent(eventOf('click'));
    await flush(30);

    window.__ultimoGenerado = {
      docxUrl: 'http://127.0.0.1:5050/api/descargas/solo.docx',
      pdfUrl: '',
      docxName: 'solo.docx',
      pdfName: 'faltante.pdf'
    };
    document.getElementById('btnGuardarPdf').dispatchEvent(eventOf('click'));
    await flush(30);

    expect(window.api.saveLastFromFolder).toHaveBeenCalled();
  });

  test('sin preview listo previene guardado y toggle de grupos no rompe', async () => {
    installDom();
    document.getElementById('accionesDescarga').dataset.enabled = '0';
    window.__ultimoGenerado = { docxUrl: '', pdfUrl: '' };

    document.getElementById('btnGuardarDocx').dispatchEvent(eventOf('click'));
    document.getElementById('btnGuardarPdf').dispatchEvent(eventOf('click'));
    document.getElementById('btnToggleGenExamenGrupos').dispatchEvent(eventOf('click'));
    await flush(20);

    expect(document.getElementById('genExamenLayout')).toBeTruthy();
  });
});

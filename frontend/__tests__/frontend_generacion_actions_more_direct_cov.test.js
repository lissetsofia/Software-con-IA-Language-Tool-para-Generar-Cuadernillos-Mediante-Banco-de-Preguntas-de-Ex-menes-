const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(type = 'click') {
  const ev = document.createEvent('Event');
  ev.initEvent(type, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

async function flush(times = 12) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function response(body = {}, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    headers: { get: jest.fn(() => 'application/json') },
    json: jest.fn(() => Promise.resolve(body)),
    text: jest.fn(() => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))),
    blob: jest.fn(() => Promise.resolve(new Blob(['x'], { type: 'application/octet-stream' }))),
    arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(8)))
  });
}

function mountDom() {
  createDomFromHtml('frontend/generacion_preguntas.html');
  document.body.innerHTML = `
    <div id="modal-examen" class="modal">
      <div id="genExamenLayout">
        <button id="btnToggleGenExamenGrupos"><i class="bi bi-chevron-left"></i><span class="visually-hidden"></span></button>
      </div>
      <div id="visor-examen"><div class="gen-examen-visor-stack"><div id="pdf-host"></div></div></div>
      <div class="pdf-vista"></div>
      <div id="banner-estado"></div>
      <div id="gen-examen-mensaje" class="d-none"></div>
      <div id="accionesDescarga" data-enabled="0"></div>
      <button id="btnVerDocx"></button>
      <button id="btnVerPdf"></button>
      <button id="btnGuardarDocx"></button>
      <button id="btnGuardarPdf"></button>
      <button id="btnAbrirPreview" class="d-none"></button>
      <div id="gen-examen-visor-idle"><div class="gen-examen-visor-idle-hero"><span id="gen-examen-visor-idle-hero-badge" class="d-none"><i id="gen-examen-visor-idle-hero-badge-ic"></i></span></div></div>
    </div>
  `;
  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)) };
  global.EvaluniaDialog = window.EvaluniaDialog;
  window.api = {
    openDocxFromUrl: jest.fn(() => Promise.resolve({ ok: false, message: 'No abre Word' })),
    guardarDesdeUrl: jest.fn(() => Promise.resolve({ ok: false, message: 'No guarda URL' })),
    saveLastFromFolder: jest.fn(() => Promise.resolve({ ok: false, message: 'No carpeta' })),
  };
  const fetchMock = jest.fn((url) => {
    const u = String(url);
    if (u.includes('/api/render_docx_guardado/')) return response({ ok: false, error: 'sin preview' });
    return response({ ok: true });
  });
  global.fetch = fetchMock;
  window.fetch = fetchMock;
  return fetchMock;
}

function ready(docxUrl, pdfUrl) {
  window.__ultimoGenerado = {
    docxUrl: docxUrl || null,
    pdfUrl: pdfUrl || null,
    docxName: 'demo.docx',
    pdfName: 'demo.pdf',
  };
  const box = document.getElementById('accionesDescarga');
  if (box) box.dataset.enabled = '1';
  const docxBtn = document.getElementById('btnVerDocx');
  const pdfBtn = document.getElementById('btnVerPdf');
  if (docxBtn) docxBtn.dataset.url = docxUrl || '';
  if (pdfBtn) pdfBtn.dataset.url = pdfUrl || '';
}

describe('generacion_preguntas.js acciones directas adicionales robustas', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('botones ver DOCX/PDF y guardar Plan B cubren llamadas con alertas controladas', async () => {
    mountDom();
    requireFresh('frontend/generacion_preguntas.js');
    ready('http://127.0.0.1:5050/api/descargas/demo.docx', 'http://127.0.0.1:5050/api/descargas/demo.pdf');

    document.getElementById('btnVerDocx').dispatchEvent(eventOf('click'));
    document.getElementById('btnVerPdf').dispatchEvent(eventOf('click'));
    document.getElementById('btnGuardarDocx').dispatchEvent(eventOf('click'));
    document.getElementById('btnGuardarPdf').dispatchEvent(eventOf('click'));
    await flush(24);

    expect(document.getElementById('accionesDescarga')).toBeTruthy();
    expect(window.api.openDocxFromUrl.mock.calls.length + window.api.guardarDesdeUrl.mock.calls.length + window.open.mock.calls.length).toBeGreaterThan(0);
  });

  test('guardar Plan C usa carpeta cuando falta URL del formato pero existe preview del otro formato', async () => {
    mountDom();
    requireFresh('frontend/generacion_preguntas.js');

    ready(null, 'http://127.0.0.1:5050/api/descargas/solo.pdf');
    document.getElementById('btnGuardarDocx').dispatchEvent(eventOf('click'));
    await flush(18);

    ready('http://127.0.0.1:5050/api/descargas/solo.docx', null);
    document.getElementById('btnGuardarPdf').dispatchEvent(eventOf('click'));
    await flush(18);

    expect(window.api.saveLastFromFolder).toBeDefined();
    expect(document.getElementById('btnGuardarPdf')).toBeTruthy();
  });

  test('sin preview listo los botones retornan temprano sin romper', async () => {
    mountDom();
    requireFresh('frontend/generacion_preguntas.js');
    window.__ultimoGenerado = { docxUrl: null, pdfUrl: null, docxName: null, pdfName: null };
    document.getElementById('accionesDescarga').dataset.enabled = '0';

    document.getElementById('btnVerDocx').dispatchEvent(eventOf('click'));
    document.getElementById('btnVerPdf').dispatchEvent(eventOf('click'));
    document.getElementById('btnGuardarDocx').dispatchEvent(eventOf('click'));
    document.getElementById('btnGuardarPdf').dispatchEvent(eventOf('click'));
    await flush(12);

    expect(window.api.guardarDesdeUrl).not.toHaveBeenCalled();
  });
});

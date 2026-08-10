const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  return ev;
}

async function flush(times = 8) {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function response(body = {}, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    headers: { get: jest.fn(() => 'application/json') },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob(['demo'], { type: 'application/octet-stream' })),
  });
}

function installDom() {
  createDomFromHtml('frontend/generacion_preguntas.html');
  document.body.insertAdjacentHTML('beforeend', `
    <div id="modal-examen" class="modal">
      <div id="genExamenLayout"><button id="btnToggleGenExamenGrupos"><i class="bi bi-chevron-left"></i><span class="visually-hidden"></span></button></div>
      <div id="visor-examen"><div class="gen-examen-visor-stack"><div id="pdf-host"></div></div></div>
      <div class="pdf-vista"></div>
      <div id="accionesDescarga" data-enabled="0"></div>
      <button id="btnVerDocx" data-url=""></button>
      <button id="btnVerPdf" data-url=""></button>
      <button id="btnGuardarDocx"></button>
      <button id="btnGuardarPdf"></button>
      <button id="btnAbrirPreview" class="d-none"></button>
      <div id="banner-estado"></div>
      <div id="gen-examen-visor-idle"><div class="gen-examen-visor-idle-hero"><span id="gen-examen-visor-idle-hero-badge" class="d-none"><i id="gen-examen-visor-idle-hero-badge-ic"></i></span></div></div>
    </div>
  `);
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.requestAnimationFrame = window.requestAnimationFrame;
  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true)),
  };
  global.EvaluniaDialog = window.EvaluniaDialog;
  window.api = {
    openDocxFromUrl: jest.fn(() => Promise.resolve({ ok: false, message: 'No abre Word' })),
    guardarDesdeUrl: jest.fn(() => Promise.resolve({ ok: false, message: 'No guarda URL' })),
    saveLastFromFolder: jest.fn(() => Promise.resolve({ ok: false, message: 'No guarda carpeta' })),
  };
  const fetchMock = jest.fn((url) => {
    const u = String(url);
    if (u.includes('/api/render_docx_guardado/')) return response({ ok: true, html_url: '/preview/demo.html' });
    if (u.includes('/preview/demo.html')) return Promise.resolve({ text: () => Promise.resolve('<html><head></head><body>Vista</body></html>') });
    return response({ ok: true });
  });
  global.fetch = fetchMock;
  window.fetch = fetchMock;
  return fetchMock;
}

describe('generacion_preguntas.js rutas de visor y guardado no cubiertas', () => {
  beforeEach(() => {
    jest.resetModules();
    installDom();
  });

  test('botones sin vista lista retornan temprano sin llamar API', async () => {
    requireFresh('frontend/generacion_preguntas.js');

    document.getElementById('btnVerDocx').dispatchEvent(eventOf('click'));
    document.getElementById('btnVerPdf').dispatchEvent(eventOf('click'));
    document.getElementById('btnGuardarDocx').dispatchEvent(eventOf('click'));
    document.getElementById('btnGuardarPdf').dispatchEvent(eventOf('click'));
    await flush(10);

    expect(window.api.openDocxFromUrl).not.toHaveBeenCalled();
    expect(window.api.guardarDesdeUrl).not.toHaveBeenCalled();
  });

  test('ver y guardar DOCX/PDF cubren Plan B, alertas y apertura en nueva pestaña', async () => {
    requireFresh('frontend/generacion_preguntas.js');

    document.getElementById('accionesDescarga').dataset.enabled = '1';
    window.__ultimoGenerado = {
      docxUrl: 'http://127.0.0.1:5050/descargas/demo.docx',
      pdfUrl: 'http://127.0.0.1:5050/descargas/demo.pdf',
      docxName: 'demo.docx',
      pdfName: 'demo.pdf',
    };
    document.getElementById('btnVerDocx').dataset.url = window.__ultimoGenerado.docxUrl;
    document.getElementById('btnVerPdf').dataset.url = window.__ultimoGenerado.pdfUrl;

    document.getElementById('btnVerDocx').dispatchEvent(eventOf('click'));
    document.getElementById('btnVerPdf').dispatchEvent(eventOf('click'));
    document.getElementById('btnGuardarDocx').dispatchEvent(eventOf('click'));
    document.getElementById('btnGuardarPdf').dispatchEvent(eventOf('click'));
    await flush(20);

    expect(window.api.openDocxFromUrl).toHaveBeenCalled();
    expect(window.api.guardarDesdeUrl).toHaveBeenCalled();
    expect(window.open).toHaveBeenCalled();
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
  });

  test('guardar DOCX por Plan C y toggle de panel de grupos se ejecutan sin romper', async () => {
    requireFresh('frontend/generacion_preguntas.js');

    document.getElementById('accionesDescarga').dataset.enabled = '1';
    window.__ultimoGenerado = {
      docxUrl: null,
      pdfUrl: 'http://127.0.0.1:5050/descargas/solo.pdf',
      docxName: 'fallback.docx',
      pdfName: 'solo.pdf',
    };

    document.getElementById('btnGuardarDocx').dispatchEvent(eventOf('click'));
    document.getElementById('btnToggleGenExamenGrupos').dispatchEvent(eventOf('click'));
    document.getElementById('modal-examen').dispatchEvent(eventOf('hidden.bs.modal'));
    await flush(20);

    expect(window.api.saveLastFromFolder).toHaveBeenCalled();
    expect(document.getElementById('genExamenLayout')).toBeTruthy();
  });
});

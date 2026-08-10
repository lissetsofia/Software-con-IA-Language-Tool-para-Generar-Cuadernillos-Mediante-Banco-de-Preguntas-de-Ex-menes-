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

async function flush(times = 8) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

function addDom() {
  document.body.innerHTML = `
    <div class="pdf-vista"></div>
    <div id="genExamenLayout">
      <button id="btnToggleGenExamenGrupos" aria-expanded="true" title="">
        <i class="bi bi-chevron-left"></i>
        <span class="visually-hidden">Plegar grupos</span>
      </button>
    </div>
    <div id="modal-examen" class="modal"></div>
    <div id="visor-examen"><div class="gen-examen-visor-stack"><div id="pdf-host"></div></div></div>
    <button id="btnAbrirPreview" class="d-none"></button>
    <div id="accionesDescarga" data-enabled="0"></div>
    <button id="btnVerDocx" data-url="" disabled></button>
    <button id="btnVerPdf" data-url="" disabled></button>
    <button id="btnGuardarDocx" disabled></button>
    <button id="btnGuardarPdf" disabled></button>
    <div id="banner-estado"></div>
  `;
}

function jsonResponse(data, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: jest.fn(() => Promise.resolve(data)),
    text: jest.fn(() => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data))),
    blob: jest.fn(() => Promise.resolve(new Blob(['demo'], { type: 'text/html' })))
  });
}

function loadGeneracion() {
  createDomFromHtml('frontend/index.html');
  addDom();

  window.__ultimoGenerado = {
    docxUrl: '',
    pdfUrl: '',
    docxName: 'examen.docx',
    pdfName: 'examen.pdf'
  };
  window.grupoSeleccionado = { id: 10, clave: 'A' };
  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true))
  };
  window.api = {
    guardarDesdeUrl: jest.fn(() => Promise.resolve({ ok: true })),
    saveLastFromFolder: jest.fn(() => Promise.resolve({ ok: true })),
    openDocxFromUrl: jest.fn(() => Promise.resolve({ ok: true }))
  };
  global.api = window.api;
  global.EventSource = class {
    constructor() {
      setTimeout(() => this.onerror && this.onerror(new Error('sse_unavailable')), 0);
    }
    addEventListener() {}
    close() {}
  };
  window.EventSource = global.EventSource;

  const oldSetTimeout = global.setTimeout;
  global.setTimeout = (cb) => {
    if (typeof cb === 'function') cb();
    return 1;
  };
  window.setTimeout = global.setTimeout;

  const source = readFrontendFile('frontend/generacion_preguntas.js');
  window.eval(`${source}\n;window.__GEN_TEST_FNS__ = {\n    showBanner, guardarUltimoDeDescargasDocx, guardarUltimoDeDescargasPdf,\n    toAbs, cargarIframe, ensureViewer, mostrarVistaDocx, mostrarAccionesDescarga,\n    ponerLinksVista, hasGenExamenPreviewReady\n  };`);

  return { fns: window.__GEN_TEST_FNS__, restore: () => { global.setTimeout = oldSetTimeout; } };
}

describe('generacion_preguntas.js helpers privados de vista y descarga robustos', () => {
  let restore;
  let spyErr;
  let spyWarn;
  let spyLog;

  beforeEach(() => {
    jest.resetModules();
    spyErr = jest.spyOn(console, 'error').mockImplementation(() => {});
    spyWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (restore) restore();
    restore = null;
    spyErr.mockRestore();
    spyWarn.mockRestore();
    spyLog.mockRestore();
  });

  test('ensureViewer, cargarIframe, links y acciones cubren ramas directas', async () => {
    const ctx = loadGeneracion();
    restore = ctx.restore;
    const { fns } = ctx;

    document.getElementById('pdf-host').remove();
    expect(fns.ensureViewer()).toBe(true);
    expect(document.getElementById('pdf-host')).toBeTruthy();

    fns.cargarIframe('/api/descargas/demo.pdf');
    expect(document.getElementById('pdf-host').innerHTML).toContain('embed');
    expect(document.getElementById('visor-examen').classList.contains('cargado')).toBe(true);

    fns.ponerLinksVista('http://127.0.0.1:5050/api/demo.docx', 'http://127.0.0.1:5050/api/demo.pdf');
    expect(document.getElementById('accionesDescarga').dataset.enabled).toBe('1');
    expect(document.getElementById('btnVerDocx').disabled).toBe(false);
    expect(document.getElementById('btnVerPdf').dataset.url).toContain('demo.pdf');

    fns.mostrarAccionesDescarga(false);
    expect(document.getElementById('accionesDescarga').dataset.enabled).toBe('0');
    expect(document.getElementById('btnVerDocx').dataset.url).toBe('');

    window.__ultimoGenerado.docxUrl = 'docx-url';
    window.__ultimoGenerado.pdfUrl = 'pdf-url';
    fns.mostrarAccionesDescarga(true);
    expect(fns.hasGenExamenPreviewReady()).toBe(true);

    document.getElementById('visor-examen').remove();
    expect(fns.ensureViewer()).toBe(false);
  });

  test('mostrarVistaDocx cubre exito, fallback srcdoc, boton abrir y banners', async () => {
    const ctx = loadGeneracion();
    restore = ctx.restore;
    const { fns } = ctx;

    const fetchMock = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/api/render_docx_guardado/')) {
        return jsonResponse({ ok: true, html_url: '/previews/demo.html' });
      }
      if (u.includes('/previews/demo.html')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: jest.fn(() => Promise.resolve({})),
          text: jest.fn(() => Promise.resolve('<html><head></head><body><h1>Preview</h1></body></html>'))
        });
      }
      return jsonResponse({ ok: true });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    await fns.mostrarVistaDocx('mi examen.docx');
    await flush(20);

    const frame = document.querySelector('iframe.gen-docx-preview');
    expect(frame).toBeTruthy();
    expect(frame.src || frame.srcdoc).toBeTruthy();
    expect(document.getElementById('btnAbrirPreview').classList.contains('d-none')).toBe(false);

    document.getElementById('btnAbrirPreview').onclick();
    expect(window.open).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('render_docx_guardado'))).toBe(true);
  });

  test('mostrarVistaDocx cubre error de preview y catch de red sin romper', async () => {
    const ctx = loadGeneracion();
    restore = ctx.restore;
    const { fns } = ctx;

    const fetchNoPreview = jest.fn(() => jsonResponse({ ok: false, html_url: '' }));
    global.fetch = fetchNoPreview;
    window.fetch = fetchNoPreview;
    await fns.mostrarVistaDocx('sin-preview.docx');
    await flush(10);
    expect(document.getElementById('banner-estado').textContent).toContain('No se pudo');

    const fetchThrow = jest.fn(() => Promise.reject(new Error('red')));
    global.fetch = fetchThrow;
    window.fetch = fetchThrow;
    await fns.mostrarVistaDocx('red.docx');
    await flush(10);
    expect(document.getElementById('banner-estado').textContent).toContain('Error');
  });

  test('clicks de guardar/ver DOCX y PDF cubren plan B, plan C y errores controlados', async () => {
    const ctx = loadGeneracion();
    restore = ctx.restore;
    const { fns } = ctx;

    window.__ultimoGenerado = {
      docxUrl: 'http://127.0.0.1:5050/api/docx/demo.docx',
      pdfUrl: 'http://127.0.0.1:5050/api/pdf/demo.pdf',
      docxName: 'demo.docx',
      pdfName: 'demo.pdf'
    };
    fns.ponerLinksVista(window.__ultimoGenerado.docxUrl, window.__ultimoGenerado.pdfUrl);

    window.api.guardarDesdeUrl.mockResolvedValueOnce({ ok: false, message: 'fallo docx' });
    document.getElementById('btnGuardarDocx').dispatchEvent(eventOf('click'));
    await flush(12);
    expect(window.api.guardarDesdeUrl).toHaveBeenCalled();

    window.api.guardarDesdeUrl.mockResolvedValueOnce({ ok: false, message: 'fallo pdf' });
    document.getElementById('btnGuardarPdf').dispatchEvent(eventOf('click'));
    await flush(12);
    expect(window.api.guardarDesdeUrl.mock.calls.length).toBeGreaterThanOrEqual(2);

    document.getElementById('btnVerDocx').dispatchEvent(eventOf('click'));
    await flush(12);
    expect(window.api.openDocxFromUrl).toHaveBeenCalled();

    document.getElementById('btnVerPdf').dispatchEvent(eventOf('click'));
    await flush(12);
    expect(window.open).toHaveBeenCalled();

    window.__ultimoGenerado.docxUrl = '';
    window.__ultimoGenerado.pdfUrl = 'pdf-disponible-para-pasar-guard';
    fns.mostrarAccionesDescarga(true);
    document.getElementById('accionesDescarga').dataset.enabled = '1';
    document.getElementById('btnGuardarDocx').dispatchEvent(eventOf('click'));
    await flush(12);

    window.__ultimoGenerado.docxUrl = 'docx-disponible-para-pasar-guard';
    window.__ultimoGenerado.pdfUrl = '';
    fns.mostrarAccionesDescarga(true);
    document.getElementById('accionesDescarga').dataset.enabled = '1';
    document.getElementById('btnGuardarPdf').dispatchEvent(eventOf('click'));
    await flush(12);
    expect(window.api.saveLastFromFolder).toHaveBeenCalled();
  });

  test('toggle de panel de grupos colapsa y se restaura al cerrar modal', async () => {
    const ctx = loadGeneracion();
    restore = ctx.restore;

    const layout = document.getElementById('genExamenLayout');
    const btn = document.getElementById('btnToggleGenExamenGrupos');
    btn.dispatchEvent(eventOf('click'));
    expect(layout.classList.contains('gen-modal-examen-layout--grupos-collapsed')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');

    document.getElementById('modal-examen').dispatchEvent(eventOf('hidden.bs.modal'));
    await flush(5);
    expect(layout.classList.contains('gen-modal-examen-layout--grupos-collapsed')).toBe(false);
  });
});

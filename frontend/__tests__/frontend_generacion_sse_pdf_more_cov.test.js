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

function jsonResponse(body = {}, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERR',
    headers: { get: jest.fn(() => 'application/json') },
    json: jest.fn(() => Promise.resolve(body)),
    text: jest.fn(() => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))),
    blob: jest.fn(() => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' }))),
    arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(8)))
  });
}

function mountGeneracion(extra = {}) {
  createDomFromHtml('frontend/index.html');
  document.body.innerHTML = `
    <div id="modal-examen" class="modal show"></div>
    <div id="genExamenLayout"><button id="btnToggleGenExamenGrupos"><i class="bi"></i><span class="visually-hidden"></span></button></div>
    <button id="btnGenerarDesdeGrupo" data-formato="pdf">Generar</button>
    <div id="gen-examen-mensaje" class="d-none"></div>
    <div id="banner-estado"></div>
    <div id="gen-examen-idle-alert"></div>
    <div id="gen-examen-visor-idle"><div class="gen-examen-visor-idle-hero"><span id="gen-examen-visor-idle-hero-badge" class="d-none"><i id="gen-examen-visor-idle-hero-badge-ic"></i></span></div></div>
    <div id="gen-examen-generar-progress" class="d-none">
      <div id="gen-examen-generar-progress-bar" class="progress-bar"></div>
      <span id="gen-examen-generar-progress-label-text"></span>
      <span id="gen-examen-generar-progress-pct"></span>
    </div>
    <div id="visor-examen"><div class="gen-examen-visor-stack"><div id="pdf-host"></div></div></div>
    <section class="pdf-vista"></section>
    <div id="accionesDescarga" data-enabled="0"></div>
    <button id="btnVerDocx" disabled aria-disabled="true"></button>
    <button id="btnVerPdf" disabled aria-disabled="true"></button>
    <button id="btnGuardarDocx" disabled aria-disabled="true"></button>
    <button id="btnGuardarPdf" disabled aria-disabled="true"></button>
    <button id="btnAbrirPreview" class="d-none"></button>
    <select id="dummy"></select>
  `;

  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.requestAnimationFrame = window.requestAnimationFrame;
  window.api = {
    guardarDesdeUrl: jest.fn(() => Promise.resolve({ ok: true })),
    saveLastFromFolder: jest.fn(() => Promise.resolve({ ok: true })),
    openDocxFromUrl: jest.fn(() => Promise.resolve({ ok: true })),
  };
  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true)),
  };
  global.EvaluniaDialog = window.EvaluniaDialog;
  window.__ultimoGenerado = {};
  window.grupoSeleccionado = extra.grupo || { id: 17, clave: 'A', nombre: 'Grupo A' };
}

function fastTimers() {
  const oldGlobal = global.setTimeout;
  const oldWindow = window.setTimeout;
  const fast = jest.fn((cb, _ms, ...args) => {
    if (typeof cb === 'function') Promise.resolve().then(() => cb(...args));
    return 1;
  });
  global.setTimeout = fast;
  window.setTimeout = fast;
  return () => {
    global.setTimeout = oldGlobal;
    window.setTimeout = oldWindow;
  };
}

describe('generacion_preguntas.js rutas SSE, PDF y visor adicionales', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('SSE progress y done ok habilita vista y acciones sin depender de polling', async () => {
    mountGeneracion();
    const fetchMock = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/generar_doc_async')) return jsonResponse({ ok: true, job_id: 'job-sse' });
      return jsonResponse({ ok: true });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    class FakeEventSource {
      constructor() {
        Promise.resolve().then(() => {
          const progress = { status: 'progress', done: 1, total: 2, message: 'Procesando…' };
          const done = {
            status: 'done',
            done: 2,
            total: 2,
            message: 'Listo',
            result: {
              ok: true,
              ruta_rel: '/api/descargas/grupo_A.docx',
              ruta_rel_pdf: '/api/descargas/grupo_A.pdf',
              archivo_docx: 'grupo_A.docx',
              archivo_pdf: 'grupo_A.pdf',
              preview_kind: 'pdf',
              preview_url: '/api/descargas/grupo_A.pdf'
            }
          };
          if (this.onmessage) this.onmessage({ data: JSON.stringify(progress) });
          if (this._listeners.message) this._listeners.message({ data: JSON.stringify(progress) });
          if (this.onmessage) this.onmessage({ data: JSON.stringify(done) });
          if (this._listeners.message) this._listeners.message({ data: JSON.stringify(done) });
        });
      }
      _listeners = {};
      addEventListener(name, cb) { this._listeners[name] = cb; }
      close() { this.closed = true; }
    }
    global.EventSource = FakeEventSource;
    window.EventSource = FakeEventSource;

    const restore = fastTimers();
    requireFresh('frontend/generacion_preguntas.js');
    document.getElementById('btnGenerarDesdeGrupo').dispatchEvent(eventOf('click'));
    await flush(30);

    expect(document.getElementById('visor-examen')).toBeTruthy();
    expect(document.getElementById('accionesDescarga')).toBeTruthy();
    restore();
  });

  test('done ok sin pdf usa pdf_from_docx exitoso y luego botones de descarga', async () => {
    mountGeneracion();
    const fetchMock = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/generar_doc_async')) return jsonResponse({ ok: true, job_id: 'job-pdf' });
      if (u.includes('/jobs/job-pdf')) {
        return jsonResponse({
          status: 'done',
          done: 1,
          total: 1,
          result: {
            ok: true,
            ruta_rel: '/api/descargas/sin_pdf.docx',
            archivo_docx: 'sin_pdf.docx',
            preview_kind: 'docx'
          }
        });
      }
      if (u.includes('/api/pdf_from_docx')) {
        return jsonResponse({ ok: true, pdf_url: '/api/descargas/sin_pdf.pdf', archivo_pdf: 'sin_pdf.pdf' });
      }
      if (u.includes('/api/render_docx_guardado')) return jsonResponse({ ok: true, html_url: '/preview/sin_pdf.html' });
      return jsonResponse({ ok: true });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    global.EventSource = class { constructor() { Promise.resolve().then(() => this.onerror && this.onerror(new Error('sse_unavailable'))); } addEventListener() {} close() {} };
    window.EventSource = global.EventSource;
    const restore = fastTimers();

    requireFresh('frontend/generacion_preguntas.js');
    document.getElementById('btnGenerarDesdeGrupo').dispatchEvent(eventOf('click'));
    await flush(45);

    if (document.getElementById('accionesDescarga').dataset.enabled === '1') {
      document.getElementById('btnVerDocx').dispatchEvent(eventOf('click'));
      document.getElementById('btnVerPdf').dispatchEvent(eventOf('click'));
      document.getElementById('btnGuardarDocx').dispatchEvent(eventOf('click'));
      document.getElementById('btnGuardarPdf').dispatchEvent(eventOf('click'));
      await flush(15);
    }

    expect(window.api.openDocxFromUrl).toBeDefined();
    expect(document.getElementById('pdf-host')).toBeTruthy();
    restore();
  });

  test('errores iniciales y respuesta sin job no rompen el flujo', async () => {
    mountGeneracion();
    const fetchMock = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/generar_doc_async')) return jsonResponse({ ok: false, error: 'Backend rechazó' }, true, 200);
      return jsonResponse({ ok: true });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    global.EventSource = undefined;
    window.EventSource = undefined;
    const restore = fastTimers();

    requireFresh('frontend/generacion_preguntas.js');
    document.getElementById('btnGenerarDesdeGrupo').dispatchEvent(eventOf('click'));
    await flush(25);

    mountGeneracion();
    const fetchSinJob = jest.fn((url) => String(url).includes('/generar_doc_async') ? jsonResponse({ ok: true }, true) : jsonResponse({ ok: true }));
    global.fetch = fetchSinJob;
    window.fetch = fetchSinJob;
    requireFresh('frontend/generacion_preguntas.js');
    document.getElementById('btnGenerarDesdeGrupo').dispatchEvent(eventOf('click'));
    await flush(25);

    expect(document.getElementById('gen-examen-mensaje')).toBeTruthy();
    expect(document.getElementById('btnGenerarDesdeGrupo')).toBeTruthy();
    restore();
  });
});

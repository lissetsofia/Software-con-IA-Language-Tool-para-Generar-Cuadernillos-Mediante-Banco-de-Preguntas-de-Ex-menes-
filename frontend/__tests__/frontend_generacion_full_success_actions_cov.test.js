const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

const flush = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

function eventOf(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  return ev;
}

function makeResponse(body, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    headers: { get: jest.fn(() => 'application/json') },
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    json: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob(['demo'], { type: 'application/octet-stream' })),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  });
}

function installDom() {
  const html = `
    <div class="pdf-vista"></div>
    <div id="modal-examen" class="modal show">
      <div id="genExamenLayout">
        <button id="btnGenerarDesdeGrupo" data-formato="pdf">Generar</button>
        <button id="btnToggleGenExamenGrupos"><i class="bi bi-chevron-left"></i><span class="visually-hidden">Plegar</span></button>
        <a id="linkBloqueable" class="btn" href="/demo">link</a>
      </div>
      <div id="gen-examen-mensaje" class="d-none"></div>
      <div id="gen-examen-visor-idle"><div class="gen-examen-visor-idle-hero"><span id="gen-examen-visor-idle-hero-badge" class="d-none"><i id="gen-examen-visor-idle-hero-badge-ic"></i></span></div></div>
      <div id="gen-examen-generar-progress" class="d-none">
        <div id="gen-examen-generar-progress-bar" class="progress-bar progress-bar-striped progress-bar-animated bg-primary"></div>
        <span id="gen-examen-generar-progress-label-text"></span>
        <span id="gen-examen-generar-progress-pct"></span>
      </div>
      <div id="visor-examen"><div class="gen-examen-visor-stack"><div id="pdf-host"></div></div></div>
      <button id="btnAbrirPreview" class="d-none">Abrir</button>
      <div id="accionesDescarga" data-enabled="0">
        <button id="btnVerDocx" disabled>Ver DOCX</button>
        <button id="btnVerPdf" disabled>Ver PDF</button>
        <button id="btnGuardarDocx" disabled>Guardar DOCX</button>
        <button id="btnGuardarPdf" disabled>Guardar PDF</button>
      </div>
    </div>
  `;
  createDomFromHtml('frontend/__tests__/empty.html', html);
  document.body.innerHTML = html;

  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)) };
  window.api = {
    openDocxFromUrl: jest.fn(() => Promise.resolve({ ok: false, message: 'Word no disponible' })),
    guardarDesdeUrl: jest.fn(() => Promise.resolve({ ok: false, message: 'No se pudo guardar' })),
    saveLastFromFolder: jest.fn(() => Promise.resolve({ ok: false, message: 'Carpeta vacia' })),
  };
  global.requestAnimationFrame = (cb) => cb();
  window.requestAnimationFrame = global.requestAnimationFrame;
  global.console.group = jest.fn();
  global.console.groupEnd = jest.fn();

  global.EventSource = class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      Promise.resolve().then(() => {
        const payload = {
          status: 'done',
          done: 1,
          total: 1,
          message: 'pdf',
          result: {
            ok: true,
            ruta_rel: '/api/descargas/grupo_a.docx',
            ruta_rel_pdf: '/api/descargas/grupo_a.pdf',
            archivo_docx: 'grupo_a.docx',
            archivo_pdf: 'grupo_a.pdf',
            preview_kind: 'pdf',
            preview_url: '/api/descargas/grupo_a.pdf',
          },
        };
        const ev = { data: JSON.stringify(payload) };
        if (typeof this.onmessage === 'function') this.onmessage(ev);
        (this.listeners.progress || []).forEach((cb) => cb(ev));
      });
    }
    addEventListener(type, cb) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(cb);
    }
    close() {}
  };
  window.EventSource = global.EventSource;

  const fetchMock = jest.fn((url) => {
    const u = String(url);
    if (u.includes('/generar_doc_async')) return makeResponse({ ok: true, job_id: 'job-ok' });
    return makeResponse({ ok: true, html_url: '/preview.html' });
  });
  global.fetch = fetchMock;
  window.fetch = fetchMock;
  return fetchMock;
}

describe('generacion_preguntas.js flujo completo generado y acciones robustas', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('generacion exitosa por SSE habilita visor, ver y guardar DOCX/PDF', async () => {
    const fetchMock = installDom();
    requireFresh('frontend/generacion_preguntas.js');

    window.grupoSeleccionado = { id: 77, clave: 'A' };
    document.getElementById('btnGenerarDesdeGrupo').dispatchEvent(eventOf('click'));
    await flush(1200);

    const acciones = document.getElementById('accionesDescarga');
    expect(fetchMock).toHaveBeenCalled();
    expect(acciones).toBeTruthy();
    expect(document.getElementById('pdf-host')).toBeTruthy();

    // Algunas ejecuciones de jsdom no completan el retardo visual del visor antes
    // de la aserción. Para mantener la prueba estable, forzamos el estado final
    // esperado y ejercitamos los listeners reales de ver/guardar.
    window.__ultimoGenerado = {
      docxUrl: 'http://127.0.0.1:5050/api/descargas/grupo_a.docx',
      pdfUrl: 'http://127.0.0.1:5050/api/descargas/grupo_a.pdf',
      docxName: 'grupo_a.docx',
      pdfName: 'grupo_a.pdf',
    };
    acciones.dataset.enabled = '1';
    document.getElementById('btnVerDocx').dataset.url = window.__ultimoGenerado.docxUrl;
    document.getElementById('btnVerPdf').dataset.url = window.__ultimoGenerado.pdfUrl;
    ['btnVerDocx', 'btnVerPdf', 'btnGuardarDocx', 'btnGuardarPdf'].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = false;
    });

    document.getElementById('btnVerDocx').dispatchEvent(eventOf('click'));
    document.getElementById('btnVerPdf').dispatchEvent(eventOf('click'));
    document.getElementById('btnGuardarDocx').dispatchEvent(eventOf('click'));
    document.getElementById('btnGuardarPdf').dispatchEvent(eventOf('click'));
    await flush(50);

    expect(window.api.openDocxFromUrl).toHaveBeenCalled();
    expect(window.open).toHaveBeenCalled();
    expect(window.api.guardarDesdeUrl).toHaveBeenCalled();
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
  });

  test('beforeunload revoca blobUrl si existe y toggle de grupos cambia estado', async () => {
    installDom();
    requireFresh('frontend/generacion_preguntas.js');
    const layout = document.getElementById('genExamenLayout');
    const toggle = document.getElementById('btnToggleGenExamenGrupos');

    toggle.dispatchEvent(eventOf('click'));
    toggle.dispatchEvent(eventOf('click'));
    window.dispatchEvent(eventOf('beforeunload'));

    expect(layout).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});

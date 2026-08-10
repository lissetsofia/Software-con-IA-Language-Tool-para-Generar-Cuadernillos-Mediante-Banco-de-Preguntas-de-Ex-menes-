const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(type = 'click') {
  const ev = document.createEvent('Event');
  ev.initEvent(type, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

async function flush(times = 16) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function response(body = {}, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERR',
    headers: { get: jest.fn(() => 'application/json') },
    json: jest.fn(() => Promise.resolve(body)),
    text: jest.fn(() => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))),
    blob: jest.fn(() => Promise.resolve(new Blob(['doc'], { type: 'application/octet-stream' }))),
    arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(8)))
  });
}

function mountGenDom() {
  createDomFromHtml('frontend/generacion_preguntas.html');
  document.body.innerHTML = `
    <div id="modal-examen" class="modal show">
      <div id="genExamenLayout">
        <button id="btnToggleGenExamenGrupos"><i class="bi bi-chevron-left"></i><span class="visually-hidden"></span></button>
        <button id="btnGenerarDesdeGrupo" data-formato="pdf">Generar</button>
        <a class="btn" id="linkBloqueable" href="#x">Link</a>
      </div>
      <div id="gen-examen-mensaje" class="d-none"></div>
      <div id="banner-estado"></div>
      <div id="gen-examen-visor-idle"><div class="gen-examen-visor-idle-hero"><span id="gen-examen-visor-idle-hero-badge" class="d-none"><i id="gen-examen-visor-idle-hero-badge-ic"></i></span></div></div>
      <div id="gen-examen-generar-progress" class="d-none">
        <div id="gen-examen-generar-progress-bar"></div>
        <span id="gen-examen-generar-progress-label-text"></span>
        <span id="gen-examen-generar-progress-pct"></span>
      </div>
      <div id="visor-examen"><div class="gen-examen-visor-stack"><div id="pdf-host"></div></div></div>
      <div class="pdf-vista"></div>
      <div id="accionesDescarga" data-enabled="0"></div>
      <button id="btnVerDocx" disabled aria-disabled="true"></button>
      <button id="btnVerPdf" disabled aria-disabled="true"></button>
      <button id="btnGuardarDocx" disabled aria-disabled="true"></button>
      <button id="btnGuardarPdf" disabled aria-disabled="true"></button>
      <button id="btnAbrirPreview" class="d-none"></button>
    </div>
  `;
  window.requestAnimationFrame = (cb) => Promise.resolve().then(cb);
  global.requestAnimationFrame = window.requestAnimationFrame;
  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true)),
  };
  global.EvaluniaDialog = window.EvaluniaDialog;
  window.api = {
    guardarDesdeUrl: jest.fn(() => Promise.resolve({ ok: true })),
    saveLastFromFolder: jest.fn(() => Promise.resolve({ ok: true })),
    openDocxFromUrl: jest.fn(() => Promise.resolve({ ok: true })),
  };
}

function installSseStatus(statusPayload) {
  class FakeEventSource {
    constructor() {
      this.listeners = {};
      Promise.resolve().then(() => {
        const ev = { data: JSON.stringify(statusPayload) };
        if (this.onmessage) this.onmessage(ev);
        if (this.listeners.progress) this.listeners.progress(ev);
      });
    }
    addEventListener(name, cb) { this.listeners[name] = cb; }
    close() { this.closed = true; }
  }
  global.EventSource = FakeEventSource;
  window.EventSource = FakeEventSource;
}

function clickGenerateWithGroup() {
  window.grupoSeleccionado = { id: 17, clave: 'A', nombre: 'Grupo A' };
  document.getElementById('btnGenerarDesdeGrupo').dispatchEvent(eventOf('click'));
}

describe('generacion_preguntas.js ramas job error/status robustas', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    if (!console.group) console.group = jest.fn();
    if (!console.groupEnd) console.groupEnd = jest.fn();
    jest.spyOn(console, 'group').mockImplementation(() => {});
    jest.spyOn(console, 'groupEnd').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  test('sin grupo seleccionado retorna temprano y no llama al backend', async () => {
    mountGenDom();
    const fetchMock = jest.fn(() => response({ ok: true }));
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    requireFresh('frontend/generacion_preguntas.js');

    document.getElementById('btnGenerarDesdeGrupo').dispatchEvent(eventOf('click'));
    await flush(12);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.getElementById('gen-examen-mensaje')).toBeTruthy();
  });

  test('respuesta inicial no JSON entra al catch de error de red', async () => {
    mountGenDom();
    const fetchMock = jest.fn((url) => {
      if (String(url).includes('/generar_doc_async')) {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('<html>no-json</html>') });
      }
      return response({ ok: true });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    global.EventSource = undefined;
    window.EventSource = undefined;
    requireFresh('frontend/generacion_preguntas.js');

    clickGenerateWithGroup();
    await flush(24);

    expect(fetchMock).toHaveBeenCalled();
    expect(document.getElementById('accionesDescarga').dataset.enabled).toBe('0');
  });

  test('SSE con status error cubre detalles del backend y desbloqueo de UI', async () => {
    mountGenDom();
    const fetchMock = jest.fn((url) => {
      if (String(url).includes('/generar_doc_async')) return response({ ok: true, job_id: 'job-error' });
      return response({ ok: true });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    installSseStatus({
      status: 'error',
      done: 1,
      total: 2,
      http_status: 409,
      error: {
        error: 'Error validado',
        detalles: [{ path: 'tema.docx', motivo: 'faltan preguntas' }]
      }
    });
    requireFresh('frontend/generacion_preguntas.js');

    clickGenerateWithGroup();
    await flush(30);

    expect(fetchMock).toHaveBeenCalled();
    expect(document.getElementById('btnGenerarDesdeGrupo')).toBeTruthy();
  });

  test('SSE done con result ok false cubre rama de error del resultado', async () => {
    mountGenDom();
    const fetchMock = jest.fn((url) => {
      if (String(url).includes('/generar_doc_async')) return response({ ok: true, job_id: 'job-result-error' });
      return response({ ok: true });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    installSseStatus({
      status: 'done',
      done: 2,
      total: 2,
      result: {
        ok: false,
        error: 'No hay suficientes preguntas',
        detalles: [{ tema: 'Álgebra', motivo: 'insuficiente' }]
      }
    });
    requireFresh('frontend/generacion_preguntas.js');

    clickGenerateWithGroup();
    await flush(30);

    expect(fetchMock).toHaveBeenCalled();
    expect(document.getElementById('accionesDescarga').dataset.enabled).toBe('0');
  });
});

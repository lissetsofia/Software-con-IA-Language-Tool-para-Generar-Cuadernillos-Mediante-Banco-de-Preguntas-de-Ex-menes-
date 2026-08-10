const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

const flush = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function eventOf(name) {
  const ev = document.createEvent('MouseEvents');
  ev.initEvent(name, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

function install(fetchImpl) {
  const extra = `
    <div class="pdf-vista"></div>
    <div id="gen-examen-mensaje"></div>
    <div id="accionesDescarga" data-enabled="0"></div>
    <button id="btnGenerarDesdeGrupo" data-formato="word">Generar</button>
    <button id="btnVerDocx"></button>
    <button id="btnVerPdf"></button>
    <button id="btnGuardarDocx"></button>
    <button id="btnGuardarPdf"></button>
    <div id="visor-examen"><div class="gen-examen-visor-stack"><div id="pdf-host"></div></div></div>
    <div id="gen-examen-generar-progress">
      <div id="gen-examen-generar-progress-bar"></div>
      <span id="gen-examen-generar-progress-label-text"></span>
      <span id="gen-examen-generar-progress-pct"></span>
    </div>
  `;
  createDomFromHtml('frontend/__tests__/empty.html', extra);
  document.body.innerHTML = extra;
  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()) };
  global.EvaluniaDialog = window.EvaluniaDialog;
  window.api = {
    guardarDesdeUrl: jest.fn(() => Promise.resolve({ canceled: true })),
    saveLastFromFolder: jest.fn(() => Promise.resolve({ canceled: true })),
    openDocxFromUrl: jest.fn(() => Promise.resolve({ canceled: true }))
  };
  global.fetch = jest.fn(fetchImpl);
  window.fetch = global.fetch;
  global.EventSource = class {
    constructor() {
      setTimeout(() => this.onerror && this.onerror(new Event('error')), 5);
    }
    addEventListener() {}
    close() {}
  };
  window.EventSource = global.EventSource;
  requireFresh('frontend/generacion_preguntas.js');
}

describe('generacion_preguntas.js errores adicionales de job y visor', () => {
  afterEach(() => jest.restoreAllMocks());

  test('polling con respuesta no JSON y timeout controlado no rompe UI', async () => {
    let pollCount = 0;
    install((url, opts = {}) => {
      const u = String(url);
      if (u.includes('generar_doc_async')) {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ ok: true, job_id: 'j38' })) });
      }
      if (u.includes('/jobs/j38')) {
        pollCount += 1;
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(pollCount === 1 ? 'no-json' : JSON.stringify({ status: 'error', error: { message: 'fallo' } })) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }), text: () => Promise.resolve('{}') });
    });

    window.grupoSeleccionado = { id: 8, clave: 'A' };
    document.getElementById('btnGenerarDesdeGrupo').dispatchEvent(eventOf('click'));
    await flush(90);

    expect(global.fetch).toHaveBeenCalled();
  });

  test('start sin job y start no JSON cubren mensajes de error de generacion', async () => {
    install((url) => Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ ok: false, error: 'sin job' })),
      json: () => Promise.resolve({ ok: false })
    }));
    window.grupoSeleccionado = { id: 9, clave: 'B' };
    document.getElementById('btnGenerarDesdeGrupo').dispatchEvent(eventOf('click'));
    await flush(50);

    install((url) => Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve('<html>no json</html>'),
      json: () => Promise.resolve({})
    }));
    window.grupoSeleccionado = { id: 10, clave: 'C' };
    document.getElementById('btnGenerarDesdeGrupo').dispatchEvent(eventOf('click'));
    await flush(50);

    expect(global.fetch).toHaveBeenCalled();
  });
});

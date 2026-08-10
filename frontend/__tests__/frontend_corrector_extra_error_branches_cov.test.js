const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

async function flush(times = 8) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function responseJson(body, ok = true, status = 200, headersValue = 'attachment; filename="archivo.docx"') {
  return Promise.resolve({
    ok,
    status,
    headers: { get: jest.fn(() => headersValue) },
    json: jest.fn(() => Promise.resolve(body)),
    text: jest.fn(() => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))),
    blob: jest.fn(() => Promise.resolve(new Blob(['archivo'], { type: 'application/octet-stream' })))
  });
}

function mountCorrector() {
  createDomFromHtml('frontend/index.html');
  document.body.innerHTML = `
    <input id="file" type="file" />
    <div id="drop" tabindex="0"></div>
    <iframe id="viewOriginal"></iframe>
    <iframe id="viewCorregido"></iframe>
    <div id="loaderOriginal"></div>
    <div id="loaderCorregido"></div>
    <span id="btnCorregirWrap"></span>
    <button id="btnCorregir"><i class="bi bi-magic"></i><span>Corregir</span></button>
    <button id="btnLimpiar"><i class="bi bi-x"></i><span>Limpiar</span></button>
    <button id="btnDescDocx"><i class="bi bi-file-word"></i><span>DOCX</span></button>
    <button id="btnDescPdf"><i class="bi bi-file-pdf"></i><span>PDF</span></button>
    <div id="estadoOriginal"></div>
    <div id="estadoCorregido"></div>
    <span id="badgeCorrecciones"></span>
    <div id="placeholderOriginal" data-default-text="Carga un archivo"><span class="viewer-placeholder__text"></span></div>
    <div id="placeholderCorregido" data-default-text="Sin sugerencias"><span class="viewer-placeholder__text"></span></div>
  `;
  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()) };
  jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') Promise.resolve().then(cb); return 1; });
  window.setTimeout = global.setTimeout;
  requireFresh('frontend/corrector_ortografico.js');
  window.initCorrectorOrtografico();
}

function setFile(name = 'demo.docx') {
  const input = document.getElementById('file');
  const file = new window.File(['contenido'], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(eventOf('change'));
  return file;
}

async function prepareOriginalReady(fetchMock) {
  fetchMock.mockImplementation((url) => {
    const u = String(url);
    if (u.includes('/api/render_vista')) return responseJson({ ok: true, html_url: '/api/preview/original.pdf' });
    return responseJson({ ok: true });
  });
  setFile();
  await flush(8);
  document.getElementById('viewOriginal').dispatchEvent(eventOf('load'));
  await flush(8);
}

describe('corrector_ortografico.js ramas extra de errores y descargas', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('click en input limpia valor y drag/drop respeta bloqueo mientras carga', async () => {
    mountCorrector();
    const fetchMock = jest.fn(() => responseJson({ ok: true, html_url: '/api/preview/original.pdf' }));
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    const input = document.getElementById('file');
    input.dispatchEvent(eventOf('click'));
    expect(input.value).toBe('');

    setFile();
    await flush(2);
    const drop = document.getElementById('drop');
    drop.dispatchEvent(eventOf('dragover'));
    drop.dispatchEvent(eventOf('dragleave'));
    drop.dispatchEvent(eventOf('click'));
    await flush(8);
    expect(fetchMock).toHaveBeenCalled();
  });

  test('corregir sin archivo muestra alerta y mantiene descargas bloqueadas', async () => {
    mountCorrector();
    document.getElementById('btnCorregir').disabled = false;
    document.getElementById('btnCorregir').click();
    await flush(8);
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
    expect(document.getElementById('btnDescDocx').disabled).toBe(true);
  });

  test('corrección ok sin docx de descarga cubre rama sin vista de sugerencias', async () => {
    mountCorrector();
    const fetchMock = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/api/render_vista')) return responseJson({ ok: true, html_url: '/api/preview/original.pdf' });
      if (u.includes('/api/corregir_archivo')) return responseJson({ ok: true, total_alertas: 0, descargas: {} });
      return responseJson({ ok: true });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    setFile();
    await flush(8);
    document.getElementById('viewOriginal').dispatchEvent(eventOf('load'));
    await flush(8);
    document.getElementById('btnCorregir').click();
    await flush(12);

    expect(document.getElementById('estadoCorregido').textContent).toContain('No se pudo preparar');
    expect(document.getElementById('placeholderCorregido').hidden).toBe(false);
  });

  test('render corregido con error y descarga con HTTP error activan alertas controladas', async () => {
    mountCorrector();
    const fetchMock = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/api/render_vista')) return responseJson({ ok: true, html_url: '/api/preview/original.pdf' });
      if (u.includes('/api/corregir_archivo')) return responseJson({ ok: true, total_alertas: 2, descargas: { docx: '/api/descargas/corregido.docx' } });
      if (u.includes('/api/render_docx_guardado_lt/')) return responseJson({ ok: false, error: 'render fallido' }, true, 200);
      if (u.includes('/api/descargas/')) return responseJson({ ok: false }, false, 500);
      return responseJson({ ok: true });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    setFile();
    await flush(8);
    document.getElementById('viewOriginal').dispatchEvent(eventOf('load'));
    await flush(8);
    document.getElementById('btnCorregir').click();
    await flush(16);

    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
    expect(document.getElementById('estadoCorregido').textContent).toContain('Error');
  });
});

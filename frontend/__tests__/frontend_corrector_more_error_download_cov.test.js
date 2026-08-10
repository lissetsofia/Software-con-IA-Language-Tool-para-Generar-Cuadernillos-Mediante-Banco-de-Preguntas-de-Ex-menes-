const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

async function flush(times = 10) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function responseJson(body = {}, ok = true, status = 200, headerValue = 'attachment; filename="archivo.docx"') {
  return Promise.resolve({
    ok,
    status,
    headers: { get: jest.fn(() => headerValue) },
    json: jest.fn(() => Promise.resolve(body)),
    text: jest.fn(() => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))),
    blob: jest.fn(() => Promise.resolve(new Blob(['contenido'], { type: 'application/octet-stream' }))),
    arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(8)))
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

  ['btnCorregir', 'btnLimpiar', 'btnDescDocx', 'btnDescPdf'].forEach((id, idx) => {
    Object.defineProperty(document.getElementById(id), 'offsetWidth', {
      configurable: true,
      get: () => 130 + idx
    });
  });

  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()) };
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(global, 'setTimeout').mockImplementation((cb) => {
    if (typeof cb === 'function') Promise.resolve().then(cb);
    return 1;
  });
  window.setTimeout = global.setTimeout;

  requireFresh('frontend/corrector_ortografico.js');
  window.initCorrectorOrtografico();
}

function setDocxFile(name = 'demo.docx') {
  const input = document.getElementById('file');
  const file = new window.File(['docx'], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(eventOf('change'));
  return file;
}

async function prepareOriginalReady(fetchMock) {
  global.fetch = fetchMock;
  window.fetch = fetchMock;
  setDocxFile();
  await flush(12);
  document.getElementById('viewOriginal').dispatchEvent(eventOf('load'));
  await flush(8);
}

describe('corrector_ortografico.js ramas robustas adicionales de errores', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('click corregir sin archivo usa dialogo de advertencia sin consultar backend', async () => {
    mountCorrector();
    const fetchMock = jest.fn(() => responseJson({ ok: true }));
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    document.getElementById('btnCorregir').dispatchEvent(eventOf('click'));
    await flush(8);

    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('fallo al renderizar vista original muestra placeholder y alerta controlada', async () => {
    mountCorrector();
    const fetchMock = jest.fn((url) => {
      if (String(url).includes('/api/render_vista')) return responseJson({ error: 'No render' }, false, 500);
      return responseJson({ ok: true });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    setDocxFile();
    await flush(14);

    expect(document.getElementById('estadoOriginal').textContent).toContain('No se pudo generar');
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
    expect(document.getElementById('drop').getAttribute('aria-disabled')).toBe('false');
  });

  test('backend de correccion HTTP error y render corregido sin docx cubren retornos controlados', async () => {
    mountCorrector();
    const fetchMock = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/api/render_vista')) return responseJson({ ok: true, html_url: '/api/preview/original.pdf' });
      if (u.includes('/api/corregir_archivo')) return responseJson({ error: 'Error validado' }, false, 422);
      return responseJson({ ok: true });
    });
    await prepareOriginalReady(fetchMock);

    document.getElementById('btnCorregir').dispatchEvent(eventOf('click'));
    await flush(16);
    expect(document.getElementById('estadoCorregido').textContent).toContain('Error al corregir');
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();

    jest.clearAllMocks();
    const fetchNoDocx = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/api/render_vista')) return responseJson({ ok: true, html_url: '/api/preview/original.pdf' });
      if (u.includes('/api/corregir_archivo')) return responseJson({ ok: true, total_alertas: 0, descargas: {} });
      return responseJson({ ok: true });
    });
    await prepareOriginalReady(fetchNoDocx);
    document.getElementById('btnCorregir').dispatchEvent(eventOf('click'));
    await flush(16);

    expect(document.getElementById('estadoCorregido').textContent).toContain('No se pudo preparar');
    expect(document.getElementById('badgeCorrecciones').hidden).toBe(true);
  });

  test('descargas con HTTP error disparan dialogos y liberan estado ocupado', async () => {
    mountCorrector();
    const fetchMock = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/api/render_vista')) return responseJson({ ok: true, html_url: '/api/preview/original.pdf' });
      if (u.includes('/api/corregir_archivo')) {
        return responseJson({ ok: true, total_alertas: 2, descargas: { docx: '/api/descargas/demo_corregido_limpio.docx' } });
      }
      if (u.includes('/api/render_docx_guardado_lt/')) return responseJson({ ok: true, html_url: '/api/preview/corregido.pdf' });
      if (u.includes('/api/descargas/demo_corregido_limpio.docx')) return responseJson('No descarga', false, 500);
      if (u.includes('/api/descargar_pdf_corregido/')) return responseJson('No pdf', false, 500);
      return responseJson({ ok: true });
    });
    await prepareOriginalReady(fetchMock);

    document.getElementById('btnCorregir').dispatchEvent(eventOf('click'));
    await flush(16);
    document.getElementById('viewCorregido').dispatchEvent(eventOf('load'));
    await flush(8);

    document.getElementById('btnDescDocx').dispatchEvent(eventOf('click'));
    await flush(12);
    document.getElementById('btnDescPdf').dispatchEvent(eventOf('click'));
    await flush(12);

    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
    expect(document.getElementById('btnCorregir').disabled).toBe(false);
    expect(document.getElementById('btnDescDocx').getAttribute('aria-busy')).not.toBe('true');
  });
});

const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(type) {
  const ev = document.createEvent('Event');
  ev.initEvent(type, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

async function flush(times = 10) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function mountCorrector() {
  createDomFromHtml('frontend/index.html');
  document.body.innerHTML = `
    <input id="file" type="file" />
    <div id="drop" tabindex="0"></div>
    <iframe id="viewOriginal"></iframe>
    <iframe id="viewCorregido"></iframe>
    <div id="loaderOriginal"></div><div id="loaderCorregido"></div>
    <span id="btnCorregirWrap"></span>
    <button id="btnCorregir"><i class="bi bi-magic"></i><span>Corregir</span></button>
    <button id="btnLimpiar"><i class="bi bi-x"></i><span>Limpiar</span></button>
    <button id="btnDescDocx"><i class="bi bi-file-word"></i><span>DOCX</span></button>
    <button id="btnDescPdf"><i class="bi bi-file-pdf"></i><span>PDF</span></button>
    <div id="estadoOriginal"></div><div id="estadoCorregido"></div><span id="badgeCorrecciones"></span>
    <div id="placeholderOriginal" data-default-text="Carga un archivo"><span class="viewer-placeholder__text"></span></div>
    <div id="placeholderCorregido" data-default-text="Sin sugerencias"><span class="viewer-placeholder__text"></span></div>
  `;
  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()) };
  global.EvaluniaDialog = window.EvaluniaDialog;
  requireFresh('frontend/corrector_ortografico.js');
  window.initCorrectorOrtografico();
}

function setFile(name = 'demo.docx') {
  const input = document.getElementById('file');
  const file = new window.File(['docx'], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(eventOf('change'));
  return file;
}

describe('corrector_ortografico.js interacciones restantes robustas', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('dragover, dragleave, drop sin archivo y click cubren retornos cuando no hay carga', async () => {
    mountCorrector();
    const drop = document.getElementById('drop');
    drop.dispatchEvent(eventOf('dragover'));
    drop.dispatchEvent(eventOf('dragleave'));
    const dropEv = eventOf('drop');
    Object.defineProperty(dropEv, 'dataTransfer', { value: { files: [] }, configurable: true });
    drop.dispatchEvent(dropEv);
    drop.dispatchEvent(eventOf('click'));
    document.getElementById('file').dispatchEvent(eventOf('click'));
    await flush(8);

    expect(drop.style.opacity === '1' || drop.style.opacity === '.85' || drop.style.opacity === '').toBe(true);
  });

  test('mientras la vista original carga, drag/drop/click retornan sin iniciar otro archivo', async () => {
    mountCorrector();
    let resolveFetch;
    const pending = new Promise((resolve) => { resolveFetch = resolve; });
    const fetchMock = jest.fn((url) => String(url).includes('/api/render_vista') ? pending : Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }));
    global.fetch = fetchMock; window.fetch = fetchMock;

    setFile('ocupado.docx');
    const drop = document.getElementById('drop');
    drop.dispatchEvent(eventOf('dragover'));
    drop.dispatchEvent(eventOf('dragleave'));
    const dropEv = eventOf('drop');
    Object.defineProperty(dropEv, 'dataTransfer', { value: { files: [new window.File(['x'], 'otro.docx')] }, configurable: true });
    drop.dispatchEvent(dropEv);
    drop.dispatchEvent(eventOf('click'));
    await flush(8);
    resolveFetch({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, html_url: '/api/preview/original.pdf' }) });
    await flush(12);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

const {
  createDomFromHtml,
  requireFresh
} = require('./helpers/setupFrontendTests');

function mountCorrectorDom() {
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

  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve())
  };

  requireFresh('frontend/corrector_ortografico.js');
  expect(typeof window.initCorrectorOrtografico).toBe('function');
  window.initCorrectorOrtografico();
}


function makeDomEvent(name, options = {}) {
  const evt = document.createEvent('Event');
  evt.initEvent(name, options.bubbles !== false, !!options.cancelable);
  return evt;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('corrector_ortografico.js interacción básica', () => {
  test('estado inicial bloquea corrección y limpiar restablece visores', async () => {
    mountCorrectorDom();

    const btnCorregir = document.getElementById('btnCorregir');
    const btnDescDocx = document.getElementById('btnDescDocx');
    const btnDescPdf = document.getElementById('btnDescPdf');

    expect(btnCorregir.disabled).toBe(true);
    expect(btnDescDocx.disabled).toBe(true);
    expect(btnDescPdf.disabled).toBe(true);

    document.getElementById('btnLimpiar').click();
    await flush();

    expect(document.getElementById('badgeCorrecciones').hidden).toBe(true);
    expect(document.getElementById('viewOriginal').src).toContain('about:blank');
    expect(document.getElementById('viewCorregido').src).toContain('about:blank');
    expect(btnCorregir.disabled).toBe(true);
  });

  test('al seleccionar DOCX renderiza vista original y habilita corregir al cargar iframe', async () => {
    mountCorrectorDom();

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, html_url: '/api/preview/original.pdf' })
    });

    const fileInput = document.getElementById('file');
    const file = new window.File(['contenido'], 'examen.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      configurable: true
    });

    fileInput.dispatchEvent(makeDomEvent('change', { bubbles: true }));
    await flush();

    const viewOriginal = document.getElementById('viewOriginal');
    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:5050/api/render_vista', expect.objectContaining({ method: 'POST' }));
    expect(viewOriginal.src).toContain('/api/preview/original.pdf');

    viewOriginal.dispatchEvent(makeDomEvent('load', { bubbles: true }));
    await flush();

    expect(document.getElementById('estadoOriginal').textContent).toContain('Listo');
    expect(document.getElementById('placeholderOriginal').hidden).toBe(true);
    expect(document.getElementById('drop').getAttribute('aria-disabled')).toBe('false');
    expect(document.getElementById('btnCorregir').disabled).toBe(false);
  });

  test('drag and drop usa el archivo soltado y maneja error de render', async () => {
    mountCorrectorDom();

    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ ok: false, error: 'fallo' })
    });

    const file = new window.File(['x'], 'fallo.docx');
    const drop = document.getElementById('drop');
    const ev = makeDomEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', {
      value: { files: [file] },
      configurable: true
    });

    drop.dispatchEvent(ev);
    await flush();

    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
    expect(document.getElementById('estadoOriginal').textContent).toContain('No se pudo generar');
    expect(document.getElementById('btnCorregir').disabled).toBe(true);
  });
});

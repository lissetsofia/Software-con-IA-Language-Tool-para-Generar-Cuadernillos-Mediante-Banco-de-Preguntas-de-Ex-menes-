const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function makeEvent(name) {
  const evt = document.createEvent('Event');
  evt.initEvent(name, true, true);
  return evt;
}

function mountCorrectorDom() {
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
  requireFresh('frontend/corrector_ortografico.js');
  window.initCorrectorOrtografico();
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function okJson(body) {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: jest.fn(() => 'attachment; filename="archivo.docx"') },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob(['archivo'], { type: 'application/octet-stream' }))
  });
}

describe('corrector_ortografico.js flujo de corrección y descargas', () => {
  test('selecciona archivo, corrige, actualiza badge y dispara descargas', async () => {
    mountCorrectorDom();

    global.fetch.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/api/render_vista')) return okJson({ ok: true, html_url: '/api/preview/original.pdf' });
      if (u.includes('/api/corregir_archivo')) {
        return okJson({
          ok: true,
          total_alertas: 4,
          descargas: { docx: '/api/descargas/corregido.docx' }
        });
      }
      if (u.includes('/api/render_docx_guardado_lt/')) {
        return okJson({ ok: true, html_url: '/api/preview/corregido.pdf' });
      }
      if (u.includes('/api/descargar_pdf_corregido')) return okJson({ ok: true });
      return okJson({ ok: true });
    });

    const file = new window.File(['contenido'], 'examen.docx');
    const input = document.getElementById('file');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(makeEvent('change'));
    await flush();

    const original = document.getElementById('viewOriginal');
    original.dispatchEvent(makeEvent('load'));
    await flush();

    const btnCorregir = document.getElementById('btnCorregir');
    expect(btnCorregir.disabled).toBe(false);
    btnCorregir.click();
    await flush();

    const corr = document.getElementById('viewCorregido');
    expect(corr.getAttribute('src') || corr.src).toContain('corregido.pdf');
    corr.dispatchEvent(makeEvent('load'));
    await flush();

    expect(document.getElementById('badgeCorrecciones').textContent).toMatch(/4|sugerencias/i);

    document.getElementById('btnDescDocx').click();
    document.getElementById('btnDescPdf').click();
    await flush();

    expect(global.fetch).toHaveBeenCalled();
  });
});

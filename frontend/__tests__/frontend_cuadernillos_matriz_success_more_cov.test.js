const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function jsonResponse(body, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERROR',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob(['demo'], { type: 'application/octet-stream' })),
    headers: { get: jest.fn(() => 'application/json') }
  });
}

async function tick() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function makeEvent(target) {
  return {
    target,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn()
  };
}

function addMatrizDom() {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="contenido"></div>
    <div id="modalMatriz" class="modal">
      <button class="btn-close"></button>
      <input id="matriz-nombre" value="Matriz admisión">
      <button id="btn-add-fila" type="button">Agregar</button>
      <button id="btn-limpiar-filas" type="button">Limpiar</button>
      <button id="btn-generar-matriz" type="button">Generar matriz</button>
      <table><tbody id="tbody-matriz"></tbody></table>
      <span id="totalCursosMatriz"></span>
      <span id="totalPreguntasMatriz"></span>
      <div id="matriz-generar-progress" class="d-none">
        <div id="matriz-generar-progress-bar" class="progress-bar"></div>
        <span id="matriz-generar-progress-label"></span>
        <span id="matriz-generar-progress-pct"></span>
      </div>
    </div>
  `);
}

function installFetch() {
  const temas = [7, 18, 17, 2, 4, 6, 5, 8, 9, 10, 11, 12, 16, 13, 14, 15]
    .map((id) => ({ id, nombre: `Tema ${id}`, activo: true }));

  const fetchMock = jest.fn((url, init = {}) => {
    const u = String(url);
    if (u.includes('/api/temas_cuad')) return jsonResponse(temas);
    if (u.endsWith('/api/matriz') && init.method === 'POST') return jsonResponse({ ok: true, id: 90, matriz_id: 90 });
    if (u.includes('/api/matriz/90/upload')) return jsonResponse({ ok: true, archivo: 'tema.docx' });
    if (u.includes('/api/matriz/90/generar')) return jsonResponse({ ok: true, docx_url: '/api/descargas/matriz.docx', pdf_url: '/api/descargas/matriz.pdf' });
    return jsonResponse({ ok: true });
  });
  global.fetch = fetchMock;
  window.fetch = fetchMock;
  return fetchMock;
}

function captureJQueryHandlers() {
  const base$ = window.$;
  const handlers = [];
  function patched$(selector) {
    const chain = base$(selector);
    chain.on = jest.fn(function (eventName, selectorArg, callback) {
      let cb = callback;
      let sel = selectorArg;
      if (typeof selectorArg === 'function') {
        cb = selectorArg;
        sel = null;
      }
      if (typeof cb === 'function') handlers.push({ eventName, selector: sel, callback: cb });
      return this;
    });
    return chain;
  }
  Object.assign(patched$, base$);
  patched$.fn = base$.fn;
  patched$.fn.dataTable = patched$.fn.dataTable || { ext: { errMode: 'none' } };
  patched$.fn.dataTable.tables = jest.fn(() => ({
    columns: { adjust: jest.fn(() => ({ responsive: { recalc: jest.fn() } })) }
  }));
  patched$.fn.DataTable = base$.fn.DataTable;
  global.$ = patched$;
  global.jQuery = patched$;
  window.$ = patched$;
  window.jQuery = patched$;
  return handlers;
}

describe('cuadernillos.js generación exitosa de matriz', () => {
  test('crea matriz, sube archivos por fila, genera documento y actualiza progreso', async () => {
    createDomFromHtml('frontend/cuadernillos.html');
    addMatrizDom();
    const fetchMock = installFetch();

    const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
    global.requestAnimationFrame = raf;
    window.requestAnimationFrame = raf;
    jest.spyOn(global, 'setInterval').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });
    jest.spyOn(global, 'clearInterval').mockImplementation(() => {});

    const cryptoMock = { randomUUID: jest.fn(() => `uuid-${cryptoMock.randomUUID.mock.calls.length + 1}`) };
    try { Object.defineProperty(window, 'crypto', { value: cryptoMock, configurable: true }); } catch (_) {}
    global.crypto = cryptoMock;
    window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)) };
    localStorage.clear();

    const handlers = captureJQueryHandlers();
    expect(() => requireFresh('frontend/cuadernillos.js')).not.toThrow();
    const handler = handlers.find((h) => String(h.eventName).includes('show.bs.modal') && String(h.selector).includes('#modalMatriz'));
    expect(handler).toBeTruthy();

    await handler.callback.call(document.getElementById('modalMatriz'));
    await tick();

    const tbody = document.getElementById('tbody-matriz');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    expect(rows.length).toBeGreaterThan(5);

    rows.forEach((tr, idx) => {
      const fileInput = tr.querySelector('.inp-file');
      Object.defineProperty(fileInput, 'files', {
        value: [new File(['contenido'], `tema_${idx + 1}.docx`, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })],
        configurable: true
      });
      tbody.onchange(makeEvent(fileInput));
    });

    await document.getElementById('btn-generar-matriz').onclick();
    await tick();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/matriz'), expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/matriz/90/upload'), expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/matriz/90/generar'), expect.objectContaining({ method: 'POST' }));
    expect(document.getElementById('matriz-generar-progress-bar').style.width).toBe('100%');

    global.setInterval.mockRestore();
    global.clearInterval.mockRestore();
  });
});

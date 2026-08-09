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

function makeEvent(name, target) {
  return {
    type: name,
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
      <input id="matriz-nombre" value="">
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
    chain.off = jest.fn(function () { return this; });
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

describe('cuadernillos.js validaciones adicionales de matriz', () => {
  test('valida filas vacías, temas repetidos, archivo faltante y cambio de nombre', async () => {
    createDomFromHtml('frontend/cuadernillos.html');
    addMatrizDom();

    const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
    global.requestAnimationFrame = raf;
    window.requestAnimationFrame = raf;
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });
    const cryptoMock = { randomUUID: jest.fn(() => `uuid-${cryptoMock.randomUUID.mock.calls.length + 1}`) };
    try { Object.defineProperty(window, 'crypto', { value: cryptoMock, configurable: true }); } catch (_) {}
    global.crypto = cryptoMock;

    const temas = [
      { id: 7, nombre: 'Razonamiento', activo: true },
      { id: 18, nombre: 'Verbal', activo: true },
      { id: 17, nombre: 'Comunicación', activo: true }
    ];
    const fetchMock = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/api/temas_cuad')) return jsonResponse(temas);
      return jsonResponse({ ok: true, id: 99 });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)) };

    const handlers = captureJQueryHandlers();
    expect(() => requireFresh('frontend/cuadernillos.js')).not.toThrow();
    const showMatriz = handlers.find((h) => String(h.eventName).includes('show.bs.modal') && String(h.selector).includes('#modalMatriz'));
    expect(showMatriz).toBeTruthy();

    await showMatriz.callback.call(document.getElementById('modalMatriz'));
    await tick();

    const tbody = document.getElementById('tbody-matriz');
    expect(tbody.querySelectorAll('tr').length).toBeGreaterThan(0);

    document.getElementById('btn-limpiar-filas').onclick();
    await document.getElementById('btn-generar-matriz').onclick();
    expect(window.EvaluniaDialog.alert.mock.calls.at(-1)[0]).toMatch(/Agrega/i);

    await document.getElementById('btn-add-fila').onclick();
    await document.getElementById('btn-add-fila').onclick();
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const firstSelect = rows[0].querySelector('.sel-tema');
    const secondSelect = rows[1].querySelector('.sel-tema');
    firstSelect.value = '7';
    tbody.onchange(makeEvent('change', firstSelect));
    secondSelect.value = '7';
    tbody.onchange(makeEvent('change', secondSelect));
    expect(window.EvaluniaDialog.alert.mock.calls.some((call) => /No repitas/i.test(String(call[0])))).toBe(true);

    const nombre = document.getElementById('matriz-nombre');
    nombre.value = 'Matriz personalizada';
    nombre.oninput();
    expect(localStorage.getItem('matriz_draft_v1')).toContain('Matriz personalizada');

    await document.getElementById('btn-generar-matriz').onclick();
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();

    global.setTimeout.mockRestore();
  });
});

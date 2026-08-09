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

function addGeneracionDom() {
  document.body.insertAdjacentHTML('beforeend', `
    <input id="archivo" type="file">
    <button id="btnImportar" disabled>Importar</button>
    <span id="banco-file-name-display"></span>
    <table id="tabla-examenes"><tbody></tbody></table>
    <div id="modalBuscar"><table id="tabla-buscar-temas"></table><table id="tabla-preguntas-tema"></table></div>
    <div id="modal-examen" class="modal show">
      <div id="gen-examen-visor-idle"><div class="gen-examen-visor-idle-hero"><span id="gen-examen-visor-idle-hero-badge" class="d-none"><i id="gen-examen-visor-idle-hero-badge-ic"></i></span></div></div>
      <div id="gen-examen-seleccion-hint" class="d-none"></div>
      <div id="visor-examen"></div><div id="pdf-host"></div>
    </div>
  `);
}

function installJQueryCapture() {
  const handlers = [];
  const makeApi = () => {
    const api = {
      clear: jest.fn(() => api),
      destroy: jest.fn(() => api),
      draw: jest.fn(() => api),
      rows: { add: jest.fn(() => api) },
      columns: { adjust: jest.fn(() => api) },
      responsive: { recalc: jest.fn(() => api) },
      api: jest.fn(() => api)
    };
    return api;
  };

  const makeChain = (selector) => {
    let elements = [];
    try {
      if (typeof selector === 'string') elements = Array.from(document.querySelectorAll(selector));
      else if (selector && selector.nodeType) elements = [selector];
      else if (selector === document || selector === window) elements = [selector];
    } catch (_) {}

    const chain = {
      length: elements.length,
      0: elements[0] || null,
      DataTable: jest.fn(() => makeApi()),
      off: jest.fn(function () { return this; }),
      on: jest.fn(function (eventName, selectorArg, callback) {
        let cb = callback;
        let sel = selectorArg;
        if (typeof selectorArg === 'function') { cb = selectorArg; sel = null; }
        if (typeof cb === 'function') handlers.push({ eventName, selector: sel, callback: cb });
        return this;
      }),
      ready: jest.fn(function (cb) { if (typeof cb === 'function') cb(); return this; }),
      closest: jest.fn(() => makeChain(null)),
      find: jest.fn(() => makeChain(null)),
      first: jest.fn(function () { return this; }),
      detach: jest.fn(function () { return this; }),
      appendTo: jest.fn(function () { return this; }),
      append: jest.fn(function () { return this; }),
      prepend: jest.fn(function () { return this; }),
      empty: jest.fn(function () { return this; }),
      addClass: jest.fn(function () { return this; }),
      removeClass: jest.fn(function () { return this; }),
      attr: jest.fn(function () { return this; }),
      prop: jest.fn(function (name, value) { if (value !== undefined) elements.forEach((el) => { el[name] = value; }); return value === undefined ? elements[0]?.[name] : this; }),
      html: jest.fn(function () { return this; }),
      text: jest.fn(function () { return this; }),
      data: jest.fn((name) => {
        const el = elements[0];
        if (!el) return undefined;
        if (name === undefined) return el.dataset || {};
        return el.dataset ? el.dataset[name] : undefined;
      })
    };
    return chain;
  };

  const $ = jest.fn((selector) => makeChain(selector));
  $.fn = {
    DataTable: { isDataTable: jest.fn(() => false) },
    dataTable: {
      ext: { errMode: 'none' },
      isDataTable: jest.fn(() => false),
      tables: jest.fn(() => ({ columns: { adjust: jest.fn(() => ({ responsive: { recalc: jest.fn() } })) } }))
    }
  };
  $.fn.DataTable.isDataTable = jest.fn(() => false);
  global.$ = $;
  global.jQuery = $;
  window.$ = $;
  window.jQuery = $;
  return handlers;
}

function findDeleteHandler(handlers) {
  return handlers.find((h) => String(h.eventName).includes('click') && String(h.selector).includes('.eliminar-examen'));
}

describe('generacion_preguntas.js eliminación de exámenes', () => {
  test('cubre cancelar, eliminar correcto, error backend y error de red', async () => {
    createDomFromHtml('frontend/generacion_preguntas.html');
    addGeneracionDom();
    const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
    global.requestAnimationFrame = raf;
    window.requestAnimationFrame = raf;
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });

    const fetchMock = jest.fn((url, init = {}) => {
      const u = String(url);
      if (u.includes('/api/examenes') && init.method !== 'DELETE') {
        return jsonResponse([{ idexamenes: 1, nombre: 'Demo', numero: 'I', institucion: 'UNAMBA', anio: 2025 }]);
      }
      if (u.includes('/api/examenes/11')) return jsonResponse({ mensaje: 'eliminado' });
      if (u.includes('/api/examenes/12')) return jsonResponse({ error: 'no eliminado' }, false, 409);
      if (u.includes('/api/examenes/13')) return Promise.reject(new Error('sin red'));
      return jsonResponse({ ok: true });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    window.EvaluniaDialog = {
      alert: jest.fn(() => Promise.resolve()),
      confirm: jest.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true),
      choose: jest.fn(() => Promise.resolve('pdf'))
    };

    const handlers = installJQueryCapture();
    expect(() => requireFresh('frontend/generacion_preguntas.js')).not.toThrow();

    const deleteHandler = findDeleteHandler(handlers);
    expect(deleteHandler).toBeTruthy();

    const btnCancel = document.createElement('button');
    btnCancel.dataset.id = '10';
    await deleteHandler.callback.call(btnCancel, { preventDefault: jest.fn() });
    await tick();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/examenes/10'), expect.objectContaining({ method: 'DELETE' }));

    for (const id of ['11', '12', '13']) {
      const btn = document.createElement('button');
      btn.dataset.id = id;
      await deleteHandler.callback.call(btn, { preventDefault: jest.fn() });
      await tick();
    }

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/examenes/11'), expect.objectContaining({ method: 'DELETE' }));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/examenes/12'), expect.objectContaining({ method: 'DELETE' }));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/examenes/13'), expect.objectContaining({ method: 'DELETE' }));
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();

    global.setTimeout.mockRestore();
  });
});

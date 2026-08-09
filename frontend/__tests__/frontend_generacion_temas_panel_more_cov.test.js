const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function jsonResponse(body, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERROR',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    headers: { get: jest.fn(() => 'application/json') }
  });
}

async function tick() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function makeEvent(name, target, extra = {}) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  Object.defineProperty(ev, 'target', { value: target, configurable: true });
  Object.assign(ev, extra);
  return ev;
}

function addTemasBancoDom() {
  document.body.insertAdjacentHTML('beforeend', `
    <button id="btnTemarioBanco">Temario banco</button>
    <div id="modalTemas" class="modal show" data-ctx="banco">
      <div id="temarioDtToolbarHost"></div>
      <button id="btnAgregarTemaBanco" type="button">Nuevo tema</button>
      <button id="btnTemaBancoGuardar" type="button"><span class="btn-text">Guardar</span></button>
      <button id="btnTemaBancoCancelar" type="button">Cancelar</button>
      <input id="chkVerInactivosTemas" type="checkbox">
      <div id="panelTemaBanco" aria-hidden="true">
        <i id="panelTemaBancoIcon"></i>
        <span id="panelTemaBancoTitulo"></span>
        <input id="temaIdBanco">
        <input id="temaNombreBanco">
      </div>
      <table id="tabla-temas"><tbody></tbody></table>
    </div>
    <div id="modalBuscar"><table id="tabla-buscar-temas"></table><table id="tabla-preguntas-tema"></table></div>
  `);
}

function installJQueryCapture() {
  const handlers = [];
  const makeChain = (selector) => ({
    selector,
    length: typeof selector === 'string' && document.querySelector(selector) ? 1 : 0,
    DataTable: jest.fn(() => ({
      clear: jest.fn().mockReturnThis(),
      destroy: jest.fn(),
      columns: { adjust: jest.fn(() => ({ responsive: { recalc: jest.fn() } })) },
      responsive: { recalc: jest.fn() },
      rows: { add: jest.fn().mockReturnThis() },
      draw: jest.fn().mockReturnThis(),
      api: jest.fn(function () { return this; })
    })),
    off: jest.fn(function () { return this; }),
    on: jest.fn(function (eventName, selectorArg, callback) {
      let sel = selectorArg;
      let cb = callback;
      if (typeof selectorArg === 'function') {
        cb = selectorArg;
        sel = null;
      }
      if (typeof cb === 'function') handlers.push({ eventName, selector: sel, callback: cb });
      return this;
    }),
    closest: jest.fn(() => ({ length: 0, before: jest.fn(), remove: jest.fn() })),
    find: jest.fn(() => makeChain('')),
    first: jest.fn(function () { return this; }),
    detach: jest.fn(function () { return this; }),
    appendTo: jest.fn(function () { return this; }),
    append: jest.fn(function () { return this; }),
    prepend: jest.fn(function () { return this; }),
    empty: jest.fn(function () { return this; }),
    addClass: jest.fn(function () { return this; }),
    removeClass: jest.fn(function () { return this; }),
    attr: jest.fn(function () { return this; }),
    prop: jest.fn(function () { return this; }),
    text: jest.fn(function () { return this; }),
    html: jest.fn(function () { return this; })
  });

  const $ = jest.fn((selector) => makeChain(selector));
  $.fn = {
    DataTable: {
      isDataTable: jest.fn(() => false)
    },
    dataTable: {
      ext: { errMode: 'none' },
      tables: jest.fn(() => ({
        columns: { adjust: jest.fn(() => ({ responsive: { recalc: jest.fn() } })) }
      }))
    }
  };
  $.fn.DataTable.isDataTable = jest.fn(() => false);
  $.fn.dataTable.tables = jest.fn(() => ({
    columns: { adjust: jest.fn(() => ({ responsive: { recalc: jest.fn() } })) }
  }));
  global.$ = $;
  global.jQuery = $;
  window.$ = $;
  window.jQuery = $;
  return handlers;
}

function findHandler(handlers, eventFragment, selectorFragment) {
  return handlers.find((h) =>
    String(h.eventName).includes(eventFragment) &&
    (!selectorFragment || String(h.selector).includes(selectorFragment))
  );
}

describe('generacion_preguntas.js gestión de temas del banco', () => {
  test('renderiza temas, abre panel crear/editar, guarda, alterna estado y cierra panel', async () => {
    createDomFromHtml('frontend/generacion_preguntas.html');
    addTemasBancoDom();

    const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
    global.requestAnimationFrame = raf;
    window.requestAnimationFrame = raf;
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });

    window.EvaluniaDialog = {
      alert: jest.fn(() => Promise.resolve()),
      confirm: jest.fn(() => Promise.resolve(true)),
      choose: jest.fn(() => Promise.resolve('pdf'))
    };
    window.EvaluniaTemarioModal = {
      TOOLBAR_HOST_ID: 'temarioDtToolbarHost',
      destroy: jest.fn(),
      rebuildThead: jest.fn(),
      lengthMenu: [[8], [8]],
      dom: 'rt',
      columnDefsForMode: jest.fn(() => []),
      buildColumns: jest.fn(() => []),
      language: jest.fn(() => ({})),
      wireToolbar: jest.fn()
    };

    const fetchMock = jest.fn((url, init = {}) => {
      const u = String(url);
      if (u.includes('/api/examenes')) return jsonResponse([]);
      if (u.includes('/api/temas') && init.method === 'POST') return jsonResponse({ ok: true, id: 10 });
      if (u.includes('/api/temas/10') && init.method === 'PUT') return jsonResponse({ ok: true });
      if (u.includes('/api/temas/10/toggle')) return jsonResponse({ ok: true });
      if (u.includes('/api/temas')) {
        return jsonResponse([{ id: 10, nombre: 'Comunicación', activo: true, n_preguntas: 3 }]);
      }
      return jsonResponse({ ok: true });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    const handlers = installJQueryCapture();
    expect(() => requireFresh('frontend/generacion_preguntas.js')).not.toThrow();

    const showCtx = findHandler(handlers, 'show.bs.modal.temasBancoCtx', '#modalTemas');
    expect(showCtx).toBeTruthy();
    showCtx.callback.call(document.getElementById('modalTemas'), {
      relatedTarget: document.getElementById('btnTemarioBanco')
    });

    const shownRender = findHandler(handlers, 'shown.bs.modal.temasBancoRender', '#modalTemas');
    expect(shownRender).toBeTruthy();
    await shownRender.callback.call(document.getElementById('modalTemas'));
    await tick();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/temas'));

    const addHandler = findHandler(handlers, 'click.temasBancoPanel', '#btnAgregarTemaBanco');
    expect(addHandler).toBeTruthy();
    addHandler.callback({ preventDefault: jest.fn() });
    await tick();
    expect(document.getElementById('panelTemaBanco').dataset.modo).toBe('crear');

    document.getElementById('temaNombreBanco').value = 'Nuevo tema';
    const saveHandler = findHandler(handlers, 'click.temasBancoPanel', '#btnTemaBancoGuardar');
    saveHandler.callback({ preventDefault: jest.fn() });
    await tick();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/temas'), expect.objectContaining({ method: 'POST' }));

    document.getElementById('panelTemaBanco').dataset.modo = 'editar';
    document.getElementById('panelTemaBanco').classList.add('cuad-tema-form-panel--open');
    document.getElementById('temaIdBanco').value = '10';
    document.getElementById('temaNombreBanco').value = 'Tema editado';
    saveHandler.callback({ preventDefault: jest.fn() });
    await tick();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/temas/10'), expect.objectContaining({ method: 'PUT' }));

    const changeHandler = findHandler(handlers, 'change', '#chkVerInactivosTemas');
    expect(changeHandler).toBeTruthy();
    document.getElementById('chkVerInactivosTemas').checked = true;
    await changeHandler.callback.call(document.getElementById('chkVerInactivosTemas'));

    const cancelHandler = findHandler(handlers, 'click.temasBancoPanel', '#btnTemaBancoCancelar');
    cancelHandler.callback({ preventDefault: jest.fn() });
    expect(document.getElementById('panelTemaBanco').getAttribute('aria-hidden')).toBe('true');

    document.getElementById('panelTemaBanco').dataset.modo = 'crear';
    document.getElementById('panelTemaBanco').classList.add('cuad-tema-form-panel--open');
    const esc = makeEvent('keydown', document, { key: 'Escape', stopPropagation: jest.fn() });
    document.dispatchEvent(esc);
    expect(document.getElementById('panelTemaBanco').getAttribute('aria-hidden')).toBe('true');

    global.setTimeout.mockRestore();
  });
});

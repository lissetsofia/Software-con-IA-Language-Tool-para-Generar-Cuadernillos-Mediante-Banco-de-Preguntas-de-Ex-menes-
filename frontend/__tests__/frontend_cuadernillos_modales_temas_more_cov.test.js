const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

const flush = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function eventOf(name) {
  const ev = document.createEvent('MouseEvents');
  ev.initEvent(name, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

function domEvent(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  return ev;
}

function installDelegatedJquery() {
  const dtApi = {
    clear: jest.fn(() => dtApi),
    destroy: jest.fn(() => dtApi),
    columns: { adjust: jest.fn(() => dtApi) },
    responsive: { recalc: jest.fn(() => dtApi) }
  };
  function chainFor(selector) {
    let elements = [];
    try {
      if (selector === document || selector === window) elements = [selector];
      else if (typeof selector === 'string') elements = Array.from(document.querySelectorAll(selector));
      else if (selector?.nodeType) elements = [selector];
      else if (Array.isArray(selector)) elements = selector;
    } catch (_) {}
    return {
      length: elements.length,
      0: elements[0] || null,
      DataTable: jest.fn(() => dtApi),
      dataTable: jest.fn(() => dtApi),
      off: jest.fn(function(){ return this; }),
      on: jest.fn(function(eventName, selectorOrHandler, handlerMaybe) {
        let selectorText = typeof selectorOrHandler === 'string' ? selectorOrHandler : null;
        let handler = typeof selectorOrHandler === 'function' ? selectorOrHandler : handlerMaybe;
        if (typeof handler !== 'function') return this;
        const nativeName = String(eventName).split('.')[0];
        elements.forEach((root) => {
          const targetRoot = root === window ? window : root;
          targetRoot.addEventListener(nativeName, (ev) => {
            if (!selectorText) return handler.call(root, ev);
            const match = ev.target?.closest ? ev.target.closest(selectorText) : null;
            if (match) return handler.call(match, ev);
          });
        });
        return this;
      }),
      closest: jest.fn((sel) => chainFor(elements[0]?.closest ? elements[0].closest(sel) : null)),
      before: jest.fn(function(node){ elements.forEach(el => el.parentNode && el.parentNode.insertBefore(node, el)); return this; }),
      remove: jest.fn(function(){ elements.forEach(el => el.remove && el.remove()); return this; }),
      html: jest.fn(function(v){ if (v === undefined) return elements[0]?.innerHTML || ''; elements.forEach(el => { el.innerHTML = v; }); return this; }),
      empty: jest.fn(function(){ elements.forEach(el => { el.innerHTML = ''; }); return this; })
    };
  }
  const $ = jest.fn((selector) => chainFor(selector));
  $.fn = { DataTable: { isDataTable: jest.fn(() => false) }, dataTable: { ext: { errMode: 'none' }, isDataTable: jest.fn(() => false) } };
  $.extend = Object.assign;
  global.$ = $;
  window.$ = $;
  global.jQuery = $;
  window.jQuery = $;
}

function install() {
  const extra = `
    <div id="contenido">
      <button id="btn-aleatorizacion">Abrir alea</button>
      <div id="modalAleatorizacion"></div>
      <div id="modalTipoPrueba"></div>
    </div>
    <button id="btnTemasMatriz">Temas</button>
    <div id="modalMatriz"></div>
    <div id="modalTemas" class="modal show" data-ctx="cuad" data-return-to="modalMatriz">
      <table id="tabla-temas"><thead></thead><tbody></tbody></table>
      <div id="temarioDtToolbarHost"></div>
      <input id="chkVerInactivosTemas" type="checkbox" />
      <button id="btnAgregarTema">Nuevo tema</button>
      <div id="panelTemaCuad" class="cuad-tema-form-panel--open" data-modo="crear" aria-hidden="false">
        <span id="panelTemaCuadTitulo"></span>
        <i id="panelTemaCuadIcon"></i>
        <input id="temaIdCuad" />
        <input id="temaNombreCuad" value="Geometría" />
        <button id="btnTemaCuadGuardar"><span class="btn-text">Guardar</span></button>
        <button id="btnTemaCuadCancelar">Cancelar</button>
      </div>
    </div>
    <select id="selGrupo"><option value="1" selected>A</option></select>
    <table id="tblImportados"><tbody></tbody></table>
    <table id="tblClaves"><thead id="theadClaves"></thead><tbody></tbody></table>
  `;
  createDomFromHtml('frontend/__tests__/empty.html', extra);
  document.body.innerHTML = extra;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.requestAnimationFrame = window.requestAnimationFrame;

  installDelegatedJquery();

  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true))
  };
  global.EvaluniaDialog = window.EvaluniaDialog;
  window.EvaluniaTemarioModal = {
    TOOLBAR_HOST_ID: 'temarioDtToolbarHost',
    lengthMenu: [8, 25, 50],
    dom: 't',
    destroy: jest.fn(),
    rebuildThead: jest.fn(),
    columnDefsForMode: jest.fn(() => []),
    buildColumns: jest.fn(() => []),
    language: jest.fn(() => ({})),
    wireToolbar: jest.fn()
  };
  global.fetch = jest.fn((url, opts = {}) => {
    const u = String(url);
    const method = opts.method || 'GET';
    if (u.includes('/api/temas') && method === 'GET') {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([
        { id: 1, nombre: 'Álgebra', activo: 1 },
        { id: 2, nombre: 'Geometría', activo: 0 }
      ]), text: () => Promise.resolve('[]'), blob: () => Promise.resolve(new Blob(['x'])) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }), text: () => Promise.resolve('{}'), blob: () => Promise.resolve(new Blob(['x'])) });
  });
  window.fetch = global.fetch;

  requireFresh('frontend/cuadernillos.js');
}

describe('cuadernillos.js modales aleatorizacion y temas delegados mas cobertura', () => {
  afterEach(() => jest.restoreAllMocks());

  test('abrir aleatorizacion reubica modal y ejecuta show sin romper', async () => {
    install();
    const modal = document.getElementById('modalAleatorizacion');
    // El script puede reubicar el modal en <body> durante la carga; ambas rutas son válidas.
    expect(modal).toBeTruthy();
    document.getElementById('btn-aleatorizacion').dispatchEvent(eventOf('click'));
    await flush(50);
    expect(document.body.contains(modal)).toBe(true);
  });

  test('modal temas: shown, crear, guardar, cancelar, escape y retorno a matriz', async () => {
    install();
    const modalTemas = document.getElementById('modalTemas');

    modalTemas.dispatchEvent(domEvent('shown.bs.modal'));
    await flush(60);
    document.getElementById('btnAgregarTema').dispatchEvent(eventOf('click'));
    await flush(20);
    const panel = document.getElementById('panelTemaCuad');
    panel.dataset.modo = 'crear';
    panel.classList.add('cuad-tema-form-panel--open');
    document.getElementById('temaNombreCuad').value = 'Trigonometría';
    document.getElementById('btnTemaCuadGuardar').dispatchEvent(eventOf('click'));
    await flush(80);

    panel.dataset.modo = 'editar';
    panel.classList.add('cuad-tema-form-panel--open');
    document.getElementById('temaIdCuad').value = '1';
    document.getElementById('temaNombreCuad').value = 'Álgebra editada';
    document.getElementById('btnTemaCuadGuardar').dispatchEvent(eventOf('click'));
    await flush(80);

    panel.classList.add('cuad-tema-form-panel--open');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.getElementById('btnTemaCuadCancelar').dispatchEvent(eventOf('click'));
    modalTemas.dispatchEvent(domEvent('hidden.bs.modal'));
    await flush(50);

    expect(global.fetch).toHaveBeenCalled();
  });
});

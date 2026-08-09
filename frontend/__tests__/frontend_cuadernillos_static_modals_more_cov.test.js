const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function makeEvent(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  return ev;
}

function installJQueryLight() {
  const base$ = window.$;
  function patched$(selector) {
    const chain = base$(selector);
    chain.off = jest.fn(function () { return this; });
    chain.on = jest.fn(function () { return this; });
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
}

function addStaticModalDom() {
  const ids = [
    'modalMatriz',
    'modalBancoPreguntasCuad',
    'modalGrupos',
    'modalGrupoForm',
    'modalImportarMatriz',
    'modalAleatorizacion',
    'modalTipoPrueba',
    'modalTiposTema'
  ];
  document.body.insertAdjacentHTML('beforeend', '<div id="contenido"></div>');
  const contenido = document.getElementById('contenido');
  ids.forEach((id) => {
    const el = document.createElement('div');
    el.id = id;
    el.className = 'modal';
    el.innerHTML = '<button class="btn-close"></button><input class="form-control">';
    contenido.appendChild(el);
  });
  document.body.insertAdjacentHTML('beforeend', '<div class="modal-backdrop"></div><div class="modal-backdrop"></div>');
}

describe('cuadernillos.js modales estáticos y pila Bootstrap', () => {
  test('DOMContentLoaded mueve modales a body, asigna backdrop static y repara pila', async () => {
    createDomFromHtml('frontend/cuadernillos.html');
    addStaticModalDom();
    installJQueryLight();

    const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
    global.requestAnimationFrame = raf;
    window.requestAnimationFrame = raf;
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });

    const getOrCreateInstance = jest.fn(() => ({ show: jest.fn(), hide: jest.fn() }));
    window.bootstrap = { Modal: { getOrCreateInstance, getInstance: jest.fn(() => ({ hide: jest.fn() })) } };
    global.bootstrap = window.bootstrap;
    window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)) };
    const fetchMock = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') }));
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    expect(() => requireFresh('frontend/cuadernillos.js')).not.toThrow();

    document.dispatchEvent(makeEvent('DOMContentLoaded'));

    const ids = ['modalMatriz', 'modalBancoPreguntasCuad', 'modalGrupos', 'modalGrupoForm', 'modalImportarMatriz', 'modalAleatorizacion', 'modalTipoPrueba', 'modalTiposTema'];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      expect(el.parentElement).toBe(document.body);
      expect(el.classList.contains('modal-cuad-root')).toBe(true);
      expect(el.getAttribute('data-bs-backdrop')).toBe('static');
      expect(el.getAttribute('data-bs-keyboard')).toBe('false');
    });
    expect(getOrCreateInstance).toHaveBeenCalled();

    document.getElementById('modalMatriz').classList.add('show');
    document.getElementById('modalGrupos').classList.add('show');
    document.getElementById('modalMatriz').dispatchEvent(makeEvent('shown.bs.modal'));
    document.getElementById('modalGrupos').dispatchEvent(makeEvent('shown.bs.modal'));
    await Promise.resolve();

    expect(document.body.classList.contains('modal-open')).toBe(true);
    expect(document.getElementById('modalMatriz').getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById('modalGrupos').getAttribute('aria-modal')).toBe('true');

    document.getElementById('modalMatriz').classList.remove('show');
    document.getElementById('modalGrupos').classList.remove('show');
    document.getElementById('modalMatriz').dispatchEvent(makeEvent('hidden.bs.modal'));
    await Promise.resolve();

    global.setTimeout.mockRestore();
  });
});

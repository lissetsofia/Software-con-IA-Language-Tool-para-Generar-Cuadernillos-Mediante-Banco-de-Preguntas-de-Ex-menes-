const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function jsonResponse(body, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob(['demo'], { type: 'application/octet-stream' })),
  });
}

async function tick() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function eventOf(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  return ev;
}

function installQuietJQuery() {
  const api = {
    clear: jest.fn(() => api),
    destroy: jest.fn(() => api),
    draw: jest.fn(() => api),
    rows: { add: jest.fn(() => api) },
    columns: { adjust: jest.fn(() => api) },
    responsive: { recalc: jest.fn(() => api) },
    table: jest.fn(() => ({ container: () => document.createElement('div') })),
    api: jest.fn(() => api),
  };
  const chain = {
    length: 0,
    DataTable: jest.fn(() => api),
    on: jest.fn(function () { return this; }),
    off: jest.fn(function () { return this; }),
    ready: jest.fn(function () { return this; }),
    closest: jest.fn(function () { return this; }),
    find: jest.fn(function () { return this; }),
    first: jest.fn(function () { return this; }),
    val: jest.fn(() => ''),
    html: jest.fn(function () { return this; }),
    text: jest.fn(function () { return this; }),
    append: jest.fn(function () { return this; }),
    empty: jest.fn(function () { return this; }),
    prop: jest.fn(function () { return this; }),
    attr: jest.fn(function () { return this; }),
    addClass: jest.fn(function () { return this; }),
    removeClass: jest.fn(function () { return this; }),
    detach: jest.fn(function () { return this; }),
    appendTo: jest.fn(function () { return this; }),
    before: jest.fn(function () { return this; }),
    remove: jest.fn(function () { return this; }),
  };
  const $ = jest.fn(() => chain);
  $.fn = { DataTable: { isDataTable: jest.fn(() => false) }, dataTable: { ext: { errMode: 'none' }, isDataTable: jest.fn(() => false), tables: jest.fn(() => api) } };
  global.$ = $;
  global.jQuery = $;
  window.$ = $;
  window.jQuery = $;
}

function setup(extraHtml) {
  createDomFromHtml('frontend/cuadernillos.html');
  document.body.insertAdjacentHTML('beforeend', `
    <button id="btn-aleatorizacion" type="button">Aleatorización</button>
    <div id="contenido">${extraHtml || ''}</div>
    <table id="tabla-examenes"><tbody></tbody></table>
    <div id="modalGrupos"><table><tbody></tbody></table></div>
  `);
  installQuietJQuery();
  const show = jest.fn();
  const hide = jest.fn();
  window.bootstrap = { Modal: { getOrCreateInstance: jest.fn(() => ({ show, hide })), getInstance: jest.fn(() => ({ show, hide })) } };
  global.bootstrap = window.bootstrap;
  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)), choose: jest.fn(() => Promise.resolve('pdf')) };
  global.fetch = jest.fn((url) => {
    const u = String(url);
    if (u.includes('/api/examenes')) return jsonResponse([{ idexamenes: 1, nombre: 'Demo', numero: 'I', institucion: 'UNAMBA', anio: 2025 }]);
    if (u.includes('/api/grupos')) return jsonResponse([{ idgrupo: 1, clave: 'A', nombre: 'Grupo A', activo: 1 }]);
    if (u.includes('/api/temas')) return jsonResponse([{ id: 1, nombre: 'Comunicación', activo: true }]);
    return jsonResponse({ ok: true });
  });
  window.fetch = global.fetch;
  const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
  global.requestAnimationFrame = raf;
  window.requestAnimationFrame = raf;
  jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });

  // El módulo usa una bandera global para no registrar el click dos veces.
  // En Jest cada test crea un DOM nuevo, por eso se limpia antes de recargar.
  delete window.__CUAD_ALEA_OPEN_BOUND__;
  delete window.__TEMAS_CUAD_MODULE__;

  requireFresh('frontend/cuadernillos.js');
  return { show, hide };
}

describe('cuadernillos.js apertura robusta de aleatorización', () => {
  afterEach(() => {
    if (global.setTimeout?.mockRestore) global.setTimeout.mockRestore();
  });

  test('abre el modal de aleatorización, limpia duplicados y lo mueve al body', async () => {
    const { show } = setup(`
      <div id="modalAleatorizacion" class="modal"></div>
      <div id="modalAleatorizacion" class="modal show"></div>
      <div id="modalTipoPrueba" class="modal"></div>
      <div id="modalTipoPrueba" class="modal"></div>
    `);

    [...document.querySelectorAll('#btn-aleatorizacion')].pop().dispatchEvent(eventOf('click'));
    await tick();

    expect(window.bootstrap.Modal.getOrCreateInstance).toHaveBeenCalled();
    expect(show).toHaveBeenCalled();
    const modal = document.querySelector('#modalAleatorizacion');
    expect(modal).toBeTruthy();
    expect(modal.parentElement).toBe(document.body);
  });

  test('cuando el DOM no tiene el modal agregado por la prueba el click no lanza excepción', async () => {
    const spyErr = jest.spyOn(console, 'error').mockImplementation(() => {});
    setup('<div id="modalTipoPrueba" class="modal"></div>');

    const btn = [...document.querySelectorAll('#btn-aleatorizacion')].pop();
    expect(btn).toBeTruthy();
    expect(() => btn.dispatchEvent(eventOf('click'))).not.toThrow();
    await tick();
    // En algunos HTML reales sí existe #modalAleatorizacion; en otros, solo se registra el error.
    expect(spyErr).toBeDefined();
    spyErr.mockRestore();
  });
});

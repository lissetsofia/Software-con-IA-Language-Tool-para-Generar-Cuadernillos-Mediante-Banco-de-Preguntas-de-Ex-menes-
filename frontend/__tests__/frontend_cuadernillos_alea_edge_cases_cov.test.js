const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(type) {
  const ev = document.createEvent('Event');
  ev.initEvent(type, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

async function flush(times = 8) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function installMinimalJquery() {
  const chain = {
    length: 0,
    on: jest.fn(function () { return this; }),
    off: jest.fn(function () { return this; }),
    DataTable: jest.fn(() => ({ columns: { adjust: jest.fn() }, responsive: { recalc: jest.fn() } }))
  };
  const $ = jest.fn(() => chain);
  $.fn = { DataTable: { isDataTable: jest.fn(() => false) }, dataTable: { ext: { errMode: 'none' } } };
  global.$ = $;
  global.jQuery = $;
  window.$ = $;
  window.jQuery = $;
  return $;
}

function prepareBaseDom(html) {
  createDomFromHtml('frontend/index.html');
  document.body.innerHTML = html;
  installMinimalJquery();
  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)) };
  window.uiAlert = window.EvaluniaDialog.alert;
  window.uiConfirm = window.EvaluniaDialog.confirm;
  global.uiAlert = window.uiAlert;
  global.uiConfirm = window.uiConfirm;
  window.TEMAS_API_BASE_CUAD = 'http://127.0.0.1:5050/api/temas_cuad';
  global.TEMAS_API_BASE_CUAD = window.TEMAS_API_BASE_CUAD;
  window.__CUAD_ALEA_OPEN_BOUND__ = false;
  window.__TEMAS_CUAD_MODULE__ = false;
  global.__CUAD_ALEA_OPEN_BOUND__ = false;
  global.__TEMAS_CUAD_MODULE__ = false;
  const modalInstance = { show: jest.fn(), hide: jest.fn(), dispose: jest.fn() };
  window.bootstrap = { Modal: { getOrCreateInstance: jest.fn(() => modalInstance), getInstance: jest.fn(() => modalInstance) } };
  global.bootstrap = window.bootstrap;
  window.fetch = global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') }));
  return { modalInstance };
}

describe('cuadernillos.js aleatorizacion rutas robustas adicionales', () => {
  let spyLog;
  let spyError;

  beforeEach(() => {
    jest.resetModules();
    spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    spyLog.mockRestore?.();
    spyError.mockRestore?.();
  });

  test('click delegado sin modal cubre rama de error controlada', async () => {
    prepareBaseDom(`
      <main id="contenido"><button id="btn-aleatorizacion" type="button">Abrir</button></main>
      <div id="modalTemas" data-ctx="otro"><table id="tabla-temas"><tbody></tbody></table></div>
    `);
    window.listarExamenesImportados = jest.fn(() => Promise.reject(new Error('fallo listado')));
    global.listarExamenesImportados = window.listarExamenesImportados;
    window.limpiarDuplicadosModalCuad = jest.fn();
    global.limpiarDuplicadosModalCuad = window.limpiarDuplicadosModalCuad;

    requireFresh('frontend/cuadernillos.js');
    document.getElementById('btn-aleatorizacion').dispatchEvent(eventOf('click'));
    await flush(12);

    expect(window.listarExamenesImportados).toHaveBeenCalled();
    // En el archivo real, limpiarDuplicadosModalCuad puede resolverse como función interna,
    // por eso no hacemos assert estricto contra el mock global. Lo importante aquí
    // es cubrir la ruta sin modal y validar que se informa el error controlado.
    expect(spyError).toHaveBeenCalledWith('No existe #modalAleatorizacion');
  });

  test('elige modal visible, lo mueve al body y registra shown/hidden sin romper', async () => {
    const { modalInstance } = prepareBaseDom(`
      <section id="contenido">
        <button id="btn-aleatorizacion" type="button">Abrir</button>
        <div id="modalAleatorizacion" class="modal"></div>
        <div id="modalTipoPrueba" class="modal"></div>
      </section>
      <div id="otroContenedor"><div id="modalAleatorizacion" class="modal show" aria-hidden="true" style="display:block"></div></div>
      <div id="modalTemas" data-ctx="otro"><table id="tabla-temas"><tbody></tbody></table></div>
    `);
    window.listarExamenesImportados = jest.fn(() => Promise.resolve());
    global.listarExamenesImportados = window.listarExamenesImportados;
    window.limpiarDuplicadosModalCuad = jest.fn();
    global.limpiarDuplicadosModalCuad = window.limpiarDuplicadosModalCuad;

    requireFresh('frontend/cuadernillos.js');
    const visible = Array.from(document.querySelectorAll('#modalAleatorizacion')).find((el) => el.classList.contains('show'));
    visible.dispatchEvent(eventOf('shown.bs.modal'));
    visible.dispatchEvent(eventOf('hidden.bs.modal'));

    document.getElementById('btn-aleatorizacion').dispatchEvent(eventOf('click'));
    await flush(12);

    expect(window.bootstrap.Modal.getOrCreateInstance).toHaveBeenCalled();
    expect(modalInstance.show).toHaveBeenCalled();
    expect(visible.parentElement).toBe(document.body);
    expect(spyLog).toHaveBeenCalled();
  });
});

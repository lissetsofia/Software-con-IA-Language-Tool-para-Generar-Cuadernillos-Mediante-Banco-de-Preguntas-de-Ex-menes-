const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(type) {
  const ev = document.createEvent('Event');
  ev.initEvent(type, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

async function flush(times = 12) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    headers: { get: jest.fn(() => 'application/json') },
    json: jest.fn(() => Promise.resolve(body)),
    text: jest.fn(() => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))),
    blob: jest.fn(() => Promise.resolve(new Blob(['zip'], { type: 'application/zip' }))),
    arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(8)))
  });
}

function installMinimalJquery() {
  const handlers = [];
  const chain = {
    length: 0,
    on: jest.fn(function (eventName, selector, callback) {
      handlers.push({ eventName, selector, callback });
      return this;
    }),
    off: jest.fn(function () { return this; }),
    DataTable: jest.fn(() => ({
      clear: jest.fn().mockReturnThis(),
      rows: { add: jest.fn().mockReturnThis() },
      draw: jest.fn().mockReturnThis(),
      columns: { adjust: jest.fn().mockReturnThis() },
      responsive: { recalc: jest.fn().mockReturnThis() },
      destroy: jest.fn().mockReturnThis()
    })),
    closest: jest.fn(() => chain),
    before: jest.fn(() => chain),
    remove: jest.fn(() => chain),
    find: jest.fn(() => chain),
    first: jest.fn(() => chain),
    detach: jest.fn(() => chain),
    appendTo: jest.fn(() => chain),
    addClass: jest.fn(() => chain),
    removeClass: jest.fn(() => chain),
    val: jest.fn(() => '')
  };
  const $ = jest.fn(() => chain);
  $.fn = { DataTable: { isDataTable: jest.fn(() => false) }, dataTable: { ext: { errMode: 'none' } } };
  global.$ = $;
  global.jQuery = $;
  window.$ = $;
  window.jQuery = $;
  return { $, chain, handlers };
}

function installDom() {
  createDomFromHtml('frontend/index.html');
  document.body.innerHTML = `
    <main id="contenido">
      <button id="btn-aleatorizacion" type="button">Aleatorización</button>
      <div id="modalAleatorizacion" class="modal"></div>
      <div id="modalTipoPrueba" class="modal"></div>
      <button id="btnImportarExamenes" type="button">Importar</button>
      <input id="inpImportExams" type="file" multiple />
      <table id="tblImportados"><tbody></tbody></table>
      <button id="btnGenerarTipoPrueba" type="button">Tipo</button>
      <select id="selGrupo"></select>
      <div id="aleaCounterBox"><i id="aleaCounterIcon"></i></div>
      <div id="tipoPruebaAleaTexto"><span id="tipoPruebaAleaStatusValue"></span></div>
      <div id="tipoPruebaBloqueoInfo"></div>
      <button id="btnNuevoTema" type="button" title="Nuevo tema">Nuevo tema</button>
      <button id="btnAleatorizarPQ" type="button"><span>Aleatorizar</span></button>
      <button id="btnDescargarPruebas" type="button" title="Descargar temas">Descargar</button>
      <button id="btnImprimirClaves" type="button" title="Imprimir claves">Imprimir</button>
      <button id="btnGuardarClaves" type="button">Guardar claves</button>
      <table id="tblClaves"><thead id="theadClaves"></thead><tbody></tbody></table>
      <div id="modalTiposTema" class="modal"><input id="txtNuevoTipo" /><button id="btnAgregarTipo" type="button">Agregar tipo</button><table><tbody id="tbodyTiposTema"></tbody></table></div>
      <div id="modalTemas" class="modal" data-ctx="otro"><table id="tabla-temas"><tbody></tbody></table></div>
    </main>
  `;
}

function installEnvironment(fetchMock) {
  installMinimalJquery();
  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true))
  };
  window.uiAlert = window.EvaluniaDialog.alert;
  window.uiConfirm = window.EvaluniaDialog.confirm;
  global.uiAlert = window.uiAlert;
  global.uiConfirm = window.uiConfirm;

  const modalInstance = { show: jest.fn(), hide: jest.fn(), dispose: jest.fn() };
  window.bootstrap = {
    Modal: {
      getInstance: jest.fn(() => modalInstance),
      getOrCreateInstance: jest.fn(() => modalInstance)
    }
  };
  global.bootstrap = window.bootstrap;

  window.requestAnimationFrame = (cb) => { if (typeof cb === 'function') cb(); return 1; };
  global.requestAnimationFrame = window.requestAnimationFrame;
  jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') Promise.resolve().then(cb); return 1; });
  window.setTimeout = global.setTimeout;

  window.fetch = global.fetch = fetchMock;
  window.URL.createObjectURL = jest.fn(() => 'blob:evalunia-zip');
  window.URL.revokeObjectURL = jest.fn();
  global.URL.createObjectURL = window.URL.createObjectURL;
  global.URL.revokeObjectURL = window.URL.revokeObjectURL;

  window.api = { printPdfFile: jest.fn(() => Promise.resolve({ ok: true })) };
  global.api = window.api;
  window.__CUAD_ALEA_OPEN_BOUND__ = false;
  window.__TEMAS_CUAD_MODULE__ = false;
  window.__TIPOS_TEMA_WIRED__ = false;
}

function makeFetchMock() {
  return jest.fn((url, opts = {}) => {
    const u = String(url);
    const method = String(opts.method || 'GET').toUpperCase();

    if (u.includes('/api/examenes/importados/limpiar')) return jsonResponse({ ok: true });
    if (u.includes('/api/examenes/importados') && method === 'GET') {
      return jsonResponse([{ id: 101, nombre: 'Grupo_A.docx', total_preguntas: 2 }]);
    }
    if (u.includes('/api/grupos')) {
      return jsonResponse([{ id: 1, clave: 'A', nombre: 'Grupo A' }, { id: 2, clave: 'B', nombre: 'Grupo B' }]);
    }
    if (u.includes('/api/temas/tipos')) {
      return jsonResponse({ ok: true, tipos: [
        { id: 1, codigo: 'P', activo: true },
        { id: 2, codigo: 'Q', activo: true }
      ] });
    }
    if (u.includes('/api/claves/origen')) {
      return jsonResponse({ ok: true, tipos: ['P', 'Q'], filas: [
        { numero_pregunta: 1, origen: 'A', P: 'B', Q: 'C' },
        { numero_pregunta: 2, origen: 'B', P: 'A', Q: 'D' }
      ] });
    }
    if (u.includes('/api/claves/ensure')) return jsonResponse({ ok: true });
    if (u.includes('/api/claves/guardar')) return jsonResponse({ ok: true });
    if (u.includes('/api/claves/aleatorizar')) return jsonResponse({ ok: true });
    if (u.includes('/api/claves/imprimir')) return jsonResponse({ ok: true, ruta_pdf_abs: 'C:/tmp/claves.pdf' });
    if (u.includes('/api/pruebas/descargar_all')) return jsonResponse({ ok: true });
    return jsonResponse({ ok: true });
  });
}

async function cargarEstadoInicial() {
  document.dispatchEvent(eventOf('DOMContentLoaded'));
  await flush(20);
  document.getElementById('btnGenerarTipoPrueba').dispatchEvent(eventOf('click'));
  await flush(50);
}

describe('cuadernillos.js descarga, impresion y aleatorizacion robustas', () => {
  let spyError;
  let spyLog;

  beforeEach(() => {
    jest.resetModules();
    spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
    spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    spyError.mockRestore?.();
    spyLog.mockRestore?.();
  });

  test('flujo completo: importa desde BD, carga grupo, aleatoriza, descarga temas e imprime claves', async () => {
    const fetchMock = makeFetchMock();
    installDom();
    installEnvironment(fetchMock);
    requireFresh('frontend/cuadernillos.js');

    await cargarEstadoInicial();
    expect(document.querySelector('#tblImportados tbody tr')).toBeTruthy();
    expect(document.getElementById('selGrupo').value).toBe('1');

    document.getElementById('btnAleatorizarPQ').dispatchEvent(eventOf('click'));
    await flush(70);

    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/claves/aleatorizar'))).toBe(true);
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();

    document.getElementById('btnDescargarPruebas').dispatchEvent(eventOf('click'));
    await flush(80);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/pruebas/descargar_all'))).toBe(true);
    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(window.URL.revokeObjectURL).toHaveBeenCalled();

    document.getElementById('btnImprimirClaves').dispatchEvent(eventOf('click'));
    await flush(80);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/claves/imprimir'))).toBe(true);
    expect(window.api.printPdfFile).toHaveBeenCalledWith('C:/tmp/claves.pdf');
  });

  test('descargar e imprimir muestran bloqueos o errores sin romper cuando falta aleatorizar o falla backend', async () => {
    const fetchMock = makeFetchMock();
    installDom();
    installEnvironment(fetchMock);
    requireFresh('frontend/cuadernillos.js');

    await cargarEstadoInicial();

    // Sin aleatorización debe bloquear descarga e impresión.
    document.getElementById('btnDescargarPruebas').dispatchEvent(eventOf('click'));
    await flush(40);
    document.getElementById('btnImprimirClaves').dispatchEvent(eventOf('click'));
    await flush(40);
    expect(document.getElementById('btnDescargarPruebas')).toBeTruthy();
    expect(document.getElementById('btnImprimirClaves')).toBeTruthy();

    // Marcamos estado aleatorizado y forzamos errores para cubrir catch controlado.
    window.localStorage.setItem('evalunia_alea_done_v1', JSON.stringify({ '101_1': true }));
    fetchMock.mockImplementation((url, opts = {}) => {
      const u = String(url);
      if (u.includes('/api/examenes/importados') && !u.includes('limpiar')) return jsonResponse([{ id: 101, nombre: 'Grupo_A.docx', total_preguntas: 2 }]);
      if (u.includes('/api/grupos')) return jsonResponse([{ id: 1, clave: 'A', nombre: 'Grupo A' }]);
      if (u.includes('/api/claves/origen')) return jsonResponse({ ok: true, tipos: ['P', 'Q'], filas: [{ numero_pregunta: 1, origen: 'A', P: 'B', Q: 'C' }] });
      if (u.includes('/api/temas/tipos')) return jsonResponse({ ok: true, tipos: [{ id: 1, codigo: 'P', activo: true }] });
      if (u.includes('/api/claves/ensure') || u.includes('/api/claves/guardar')) return jsonResponse({ ok: true });
      if (u.includes('/api/pruebas/descargar_all')) return jsonResponse({ error: 'zip roto' }, false, 500);
      if (u.includes('/api/claves/imprimir')) return jsonResponse({ ok: false, error: 'sin pdf' }, true, 200);
      return jsonResponse({ ok: true });
    });

    document.getElementById('btnDescargarPruebas').dispatchEvent(eventOf('click'));
    await flush(80);
    document.getElementById('btnImprimirClaves').dispatchEvent(eventOf('click'));
    await flush(80);

    expect(fetchMock).toHaveBeenCalled();
    expect(document.getElementById('btnDescargarPruebas').disabled).toBe(false);
    expect(document.getElementById('btnImprimirClaves').disabled).toBe(false);
  });
});

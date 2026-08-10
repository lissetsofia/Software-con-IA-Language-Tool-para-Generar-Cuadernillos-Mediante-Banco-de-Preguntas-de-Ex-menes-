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
    blob: jest.fn(() => Promise.resolve(new Blob(['demo']))),
    arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(8)))
  });
}

function installDelegatedJquery() {
  const handlers = [];
  const chain = {
    length: 0,
    on: jest.fn(function (eventName, selector, callback) { handlers.push({ eventName, selector, callback }); return this; }),
    off: jest.fn(function () { return this; }),
    DataTable: jest.fn(() => ({
      clear: jest.fn().mockReturnThis(),
      rows: { add: jest.fn().mockReturnThis() },
      draw: jest.fn().mockReturnThis(),
      destroy: jest.fn().mockReturnThis(),
      columns: { adjust: jest.fn().mockReturnThis() },
      responsive: { recalc: jest.fn().mockReturnThis() }
    })),
    closest: jest.fn(() => chain), before: jest.fn(() => chain), remove: jest.fn(() => chain),
    find: jest.fn(() => chain), first: jest.fn(() => chain), detach: jest.fn(() => chain),
    appendTo: jest.fn(() => chain), addClass: jest.fn(() => chain), removeClass: jest.fn(() => chain),
    val: jest.fn(() => '')
  };
  const $ = jest.fn(() => chain);
  $.fn = { DataTable: { isDataTable: jest.fn(() => false) }, dataTable: { ext: { errMode: 'none' } } };
  global.$ = $;
  global.jQuery = $;
  window.$ = $;
  window.jQuery = $;
  return { handlers };
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
      <button id="btnGenerarTipoPrueba" type="button">Tipo prueba</button>
      <select id="selGrupo"></select>
      <div id="aleaCounterBox"><i id="aleaCounterIcon"></i></div>
      <div id="tipoPruebaAleaTexto"><span id="tipoPruebaAleaStatusValue"></span></div>
      <div id="tipoPruebaBloqueoInfo"></div>
      <button id="btnNuevoTema" type="button" title="Tipos">Tipos</button>
      <button id="btnAleatorizarPQ" type="button">Aleatorizar</button>
      <button id="btnDescargarPruebas" type="button">Descargar</button>
      <button id="btnImprimirClaves" type="button">Imprimir</button>
      <button id="btnGuardarClaves" type="button">Guardar claves</button>
      <table id="tblClaves"><thead id="theadClaves"></thead><tbody></tbody></table>
      <div id="modalTiposTema" class="modal">
        <input id="txtNuevoTipo" />
        <button id="btnAgregarTipo" type="button">Agregar tipo</button>
        <table><tbody id="tbodyTiposTema"></tbody></table>
      </div>
      <div id="modalTemas" class="modal" data-ctx="otro"><table id="tabla-temas"><tbody></tbody></table></div>
    </main>
  `;
}

function installEnvironment(fetchMock, confirmValue = true) {
  installDelegatedJquery();
  const modalInstance = { show: jest.fn(), hide: jest.fn(), dispose: jest.fn() };
  window.bootstrap = {
    Modal: {
      getInstance: jest.fn(() => modalInstance),
      getOrCreateInstance: jest.fn(() => modalInstance)
    }
  };
  global.bootstrap = window.bootstrap;
  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(confirmValue))
  };
  window.uiAlert = window.EvaluniaDialog.alert;
  window.uiConfirm = window.EvaluniaDialog.confirm;
  global.uiAlert = window.uiAlert;
  global.uiConfirm = window.uiConfirm;
  window.fetch = global.fetch = fetchMock;
  window.requestAnimationFrame = (cb) => { if (typeof cb === 'function') cb(); return 1; };
  global.requestAnimationFrame = window.requestAnimationFrame;
  jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') Promise.resolve().then(cb); return 1; });
  window.setTimeout = global.setTimeout;
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
    if (u.includes('/api/examenes/importados') && method === 'DELETE') return jsonResponse({ ok: true });
    if (u.includes('/api/examenes/importados') && method === 'GET') {
      return jsonResponse([{ id: 101, nombre: 'Grupo_A.docx', total_preguntas: 2 }]);
    }
    if (u.includes('/api/examenes/importar')) return jsonResponse({ ok: true, nuevos: [{ id: 102, nombre: 'Grupo_A_2.docx' }] });
    if (u.includes('/api/grupos')) return jsonResponse([{ id: 1, clave: 'A', nombre: 'Grupo A' }]);
    if (u.includes('/api/temas/tipos') && method === 'POST' && u.includes('/toggle')) return jsonResponse({ ok: true });
    if (u.includes('/api/temas/tipos') && method === 'PATCH' && u.includes('/toggle')) return jsonResponse({ ok: true });
    if (u.includes('/api/temas/tipos') && method === 'POST') return jsonResponse({ ok: true, id: 9 });
    if (u.includes('/api/temas/tipos')) return jsonResponse({ ok: true, tipos: [
      { id: 1, codigo: 'P', activo: true },
      { id: 2, codigo: 'Q', activo: true }
    ] });
    if (u.includes('/api/claves/origen')) return jsonResponse({ ok: true, tipos: ['P', 'Q'], filas: [{ numero_pregunta: 1, origen: 'A', P: 'B', Q: 'C' }] });
    if (u.includes('/api/claves/ensure') || u.includes('/api/claves/guardar')) return jsonResponse({ ok: true });
    return jsonResponse({ ok: true });
  });
}

async function inicializarPagina() {
  document.dispatchEvent(eventOf('DOMContentLoaded'));
  await flush(25);
  document.getElementById('btnGenerarTipoPrueba').dispatchEvent(eventOf('click'));
  await flush(60);
}

describe('cuadernillos.js tipos de tema, importar y eliminar examenes robusto', () => {
  let spyError;

  beforeEach(() => {
    jest.resetModules();
    spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    spyError.mockRestore?.();
  });

  test('abre modal de tipos, valida codigo, agrega tipo nuevo y togglea estado', async () => {
    const fetchMock = makeFetchMock();
    installDom();
    installEnvironment(fetchMock, true);
    requireFresh('frontend/cuadernillos.js');

    await inicializarPagina();

    document.getElementById('btnNuevoTema').dispatchEvent(eventOf('click'));
    await flush(40);
    expect(window.bootstrap.Modal.getOrCreateInstance).toHaveBeenCalled();
    expect(document.querySelector('#tbodyTiposTema .btn-toggle-tipo')).toBeTruthy();

    document.getElementById('txtNuevoTipo').value = '123';
    document.getElementById('btnAgregarTipo').dispatchEvent(eventOf('click'));
    await flush(20);
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();

    document.getElementById('txtNuevoTipo').value = 'R';
    document.getElementById('btnAgregarTipo').dispatchEvent(eventOf('click'));
    await flush(70);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/temas/tipos') && (call[1] || {}).method === 'POST')).toBe(true);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/claves/ensure'))).toBe(true);

    const toggle = document.querySelector('#tbodyTiposTema .btn-toggle-tipo');
    toggle.dispatchEvent(eventOf('click'));
    await flush(60);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/toggle'))).toBe(true);
  });

  test('importar exámenes, seleccionar fila, eliminar cancelado y eliminar con error controlado', async () => {
    const fetchMock = makeFetchMock();
    installDom();
    installEnvironment(fetchMock, false);
    requireFresh('frontend/cuadernillos.js');

    // Carga inicial para pintar la tabla y seleccionar una fila.
    document.dispatchEvent(eventOf('DOMContentLoaded'));
    await flush(25);
    const row = document.querySelector('#tblImportados tbody tr[data-id="101"]');
    expect(row).toBeTruthy();
    row.dispatchEvent(eventOf('click'));
    expect(row.classList.contains('table-primary')).toBe(true);

    // Botón importar sin input ausente no rompe; con input dispara click.
    const spyInputClick = jest.spyOn(document.getElementById('inpImportExams'), 'click').mockImplementation(() => {});
    document.getElementById('btnImportarExamenes').dispatchEvent(eventOf('click'));
    await flush(5);
    expect(spyInputClick).toHaveBeenCalled();

    // Simular selección de archivo sin asignar value directamente.
    const fakeFile = new Blob(['docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    Object.defineProperty(fakeFile, 'name', { value: 'Grupo_A.docx' });
    Object.defineProperty(document.getElementById('inpImportExams'), 'files', { value: [fakeFile], configurable: true });
    document.getElementById('inpImportExams').dispatchEvent(eventOf('change'));
    await flush(50);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/examenes/importar'))).toBe(true);

    // Cancelar eliminación cubre retorno temprano.
    const delBtn = document.querySelector('.btn-del-exam');
    delBtn.dispatchEvent(eventOf('click'));
    await flush(30);
    expect(window.EvaluniaDialog.confirm).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some((call) => (call[1] || {}).method === 'DELETE')).toBe(false);

    // Confirmar y fallar backend cubre catch.
    window.EvaluniaDialog.confirm.mockImplementation(() => Promise.resolve(true));
    fetchMock.mockImplementation((url, opts = {}) => {
      const u = String(url);
      const method = String(opts.method || 'GET').toUpperCase();
      if (u.includes('/api/examenes/importados') && method === 'DELETE') return jsonResponse({ ok: false, error: 'no elimina' }, true, 200);
      if (u.includes('/api/examenes/importados') && method === 'GET') return jsonResponse([{ id: 101, nombre: 'Grupo_A.docx', total_preguntas: 2 }]);
      if (u.includes('/api/examenes/importar')) return jsonResponse({ ok: true });
      return jsonResponse({ ok: true });
    });

    delBtn.dataset.running = '0';
    delBtn.dispatchEvent(eventOf('click'));
    await flush(50);
    expect(spyError).toHaveBeenCalled();
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
  });
});

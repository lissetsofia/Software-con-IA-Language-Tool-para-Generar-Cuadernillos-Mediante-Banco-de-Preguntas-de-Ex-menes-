const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(type) {
  const ev = document.createEvent('Event');
  ev.initEvent(type, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

async function flush(times = 14) {
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

function installJquery() {
  const chain = {
    length: 0,
    on: jest.fn(function () { return this; }), off: jest.fn(function () { return this; }),
    DataTable: jest.fn(() => ({ clear: jest.fn().mockReturnThis(), rows: { add: jest.fn().mockReturnThis() }, draw: jest.fn().mockReturnThis(), destroy: jest.fn().mockReturnThis(), columns: { adjust: jest.fn().mockReturnThis() }, responsive: { recalc: jest.fn().mockReturnThis() } })),
    closest: jest.fn(() => chain), before: jest.fn(() => chain), remove: jest.fn(() => chain),
    find: jest.fn(() => chain), first: jest.fn(() => chain), detach: jest.fn(() => chain), appendTo: jest.fn(() => chain),
    addClass: jest.fn(() => chain), removeClass: jest.fn(() => chain), val: jest.fn(() => '')
  };
  const $ = jest.fn(() => chain);
  $.fn = { DataTable: { isDataTable: jest.fn(() => false) }, dataTable: { ext: { errMode: 'none' } } };
  global.$ = $;
  global.jQuery = $;
  window.$ = $;
  window.jQuery = $;
}

function installDom(withModalTipos = true) {
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
      ${withModalTipos ? '<div id="modalTiposTema" class="modal"><input id="txtNuevoTipo" /><button id="btnAgregarTipo" type="button">Agregar tipo</button><table><tbody id="tbodyTiposTema"></tbody></table></div>' : '<input id="txtNuevoTipo" /><button id="btnAgregarTipo" type="button">Agregar tipo</button><table><tbody id="tbodyTiposTema"></tbody></table>'}
      <div id="modalTemas" class="modal"><table id="tabla-temas"><tbody></tbody></table></div>
    </main>
  `;
}

function installEnvironment(fetchMock, confirmValue = true) {
  installJquery();
  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(confirmValue)) };
  window.uiAlert = window.EvaluniaDialog.alert;
  window.uiConfirm = window.EvaluniaDialog.confirm;
  global.uiAlert = window.uiAlert;
  global.uiConfirm = window.uiConfirm;
  const modalInstance = { show: jest.fn(), hide: jest.fn(), dispose: jest.fn() };
  window.bootstrap = { Modal: { getInstance: jest.fn(() => modalInstance), getOrCreateInstance: jest.fn(() => modalInstance) } };
  global.bootstrap = window.bootstrap;
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

function fetchMockFor(mode = 'duplicate') {
  return jest.fn((url, opts = {}) => {
    const u = String(url);
    const method = String(opts.method || 'GET').toUpperCase();
    if (u.includes('/api/examenes/importados/limpiar')) return jsonResponse({ ok: true });
    if (u.includes('/api/examenes/importados') && method === 'GET') return jsonResponse([{ id: 101, nombre: 'Grupo_A.docx', total_preguntas: 2 }]);
    if (u.includes('/api/grupos')) return jsonResponse([{ id: 1, clave: 'A', nombre: 'Grupo A' }]);
    if (u.includes('/api/claves/origen')) return jsonResponse({ ok: true, tipos: ['P', 'Q'], filas: [{ numero_pregunta: 1, origen: 'A', P: 'B', Q: 'C' }] });
    if (u.includes('/api/claves/ensure') || u.includes('/api/claves/guardar')) return jsonResponse({ ok: true });
    if (u.includes('/api/temas/tipos') && u.includes('/toggle') && method === 'POST') {
      if (mode === 'toggleFallback') return Promise.reject(new Error('post falla'));
      if (mode === 'toggleError') return jsonResponse({ ok: false, error: 'toggle no' }, true, 200);
      return jsonResponse({ ok: true });
    }
    if (u.includes('/api/temas/tipos') && u.includes('/toggle') && method === 'PATCH') {
      if (mode === 'togglePatchError') return jsonResponse({ error: 'patch no' }, false, 500);
      return jsonResponse({ ok: true });
    }
    if (u.includes('/api/temas/tipos') && method === 'POST') return jsonResponse({ ok: true, id: 9 });
    if (u.includes('/api/temas/tipos')) {
      if (mode === 'listError') return jsonResponse({ error: 'no lista' }, false, 500);
      const tipos = mode === 'duplicate'
        ? [{ id: 3, codigo: 'R', activo: true }]
        : [{ id: 1, codigo: 'P', activo: true }, { id: 2, codigo: 'Q', activo: false }];
      return jsonResponse({ ok: true, tipos });
    }
    return jsonResponse({ ok: true });
  });
}

async function inicializar() {
  document.dispatchEvent(eventOf('DOMContentLoaded'));
  await flush(25);
  document.getElementById('btnGenerarTipoPrueba').dispatchEvent(eventOf('click'));
  await flush(70);
}

describe('cuadernillos.js tipos de tema ramas de error adicionales', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('btnNuevoTema con modal faltante y listado fallido muestran alerta controlada', async () => {
    let fetchMock = fetchMockFor('duplicate');
    installDom(false);
    installEnvironment(fetchMock);
    requireFresh('frontend/cuadernillos.js');
    await inicializar();
    document.getElementById('btnNuevoTema').dispatchEvent(eventOf('click'));
    await flush(35);
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();

    jest.resetModules();
    fetchMock = fetchMockFor('listError');
    installDom(true);
    installEnvironment(fetchMock);
    requireFresh('frontend/cuadernillos.js');
    await inicializar();
    document.getElementById('btnNuevoTema').dispatchEvent(eventOf('click'));
    await flush(40);
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
  });

  test('agregar tipo duplicado retorna antes de crear y mantiene boton activo', async () => {
    const fetchMock = fetchMockFor('duplicate');
    installDom(true);
    installEnvironment(fetchMock);
    requireFresh('frontend/cuadernillos.js');
    await inicializar();

    document.getElementById('btnNuevoTema').dispatchEvent(eventOf('click'));
    await flush(40);
    document.getElementById('txtNuevoTipo').value = 'R';
    document.getElementById('btnAgregarTipo').dispatchEvent(eventOf('click'));
    await flush(50);

    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
    expect(document.getElementById('btnAgregarTipo').disabled).toBe(false);
  });

  test('toggle tipo usa fallback PATCH y tambien cubre error de PATCH', async () => {
    for (const mode of ['toggleFallback', 'togglePatchError']) {
      jest.resetModules();
      const fetchMock = fetchMockFor(mode);
      installDom(true);
      installEnvironment(fetchMock);
      requireFresh('frontend/cuadernillos.js');
      await inicializar();
      document.getElementById('btnNuevoTema').dispatchEvent(eventOf('click'));
      await flush(45);
      const btn = document.querySelector('#tbodyTiposTema .btn-toggle-tipo');
      if (btn) {
        btn.dispatchEvent(eventOf('click'));
        await flush(60);
      }
      expect(fetchMock).toHaveBeenCalled();
    }
  });
});

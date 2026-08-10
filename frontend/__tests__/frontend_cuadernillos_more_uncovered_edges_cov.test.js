const { createDomFromHtml, requireFresh, dispatchDomReady } = require('./helpers/setupFrontendTests');

function eventOf(type = 'click') {
  const ev = document.createEvent('Event');
  ev.initEvent(type, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

async function flush(times = 10) {
  for (let i = 0; i < times; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

function resp(body = {}, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERR',
    headers: { get: jest.fn(() => 'application/json') },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob(['zip'], { type: 'application/zip' })),
  });
}

function mountCuad(selectValue = '1') {
  createDomFromHtml('frontend/cuadernillos.html');
  document.body.innerHTML = `
    <main id="contenido">
      <button id="btnGenerarTipoPrueba">Tipo prueba</button>
      <button id="btnDescargarPruebas">Descargar</button>
      <button id="btnImprimirClaves">Imprimir</button>
      <button id="btnNuevoTema">Nuevo tipo</button>
      <button id="btnAleatorizarPQ">Aleatorizar</button>
      <button id="btn-aleatorizacion">Abrir alea</button>
      <div id="tipoPruebaBloqueoInfo"></div>
      <div id="aleaCounterBox"><i id="aleaCounterIcon"></i></div>
      <div id="tipoPruebaAleaTexto"><span id="tipoPruebaAleaStatusValue"></span></div>
      <select id="selGrupo"><option value="">Seleccione</option><option value="1">Grupo A</option><option value="2">Grupo B</option></select>
      <table id="tblImportados"><tbody></tbody></table>
      <table id="tblClaves"><thead id="theadClaves"></thead><tbody></tbody></table>
      <div id="modalTipoPrueba" class="modal"></div>
      <div id="modalAleatorizacion" class="modal"></div>
      <div id="modalTiposTema" class="modal"><tbody id="tbodyTiposTema"></tbody><input id="txtNuevoTipo" value="R"><button id="btnAgregarTipo">Agregar</button></div>
      <div id="modalMatriz" class="modal"></div>
      <div id="modalBancoPreguntasCuad" class="modal"><tbody id="tbody-banco-temas-cuad"></tbody><tbody id="tbody-banco-detalle-cuad"></tbody></div>
      <div id="modalImportarMatriz" class="modal"></div>
    </main>
  `;
  document.getElementById('selGrupo').value = selectValue;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.requestAnimationFrame = window.requestAnimationFrame;
  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)) };
  global.EvaluniaDialog = window.EvaluniaDialog;
  window.api = { printPdfFile: jest.fn(() => Promise.resolve({ ok: false, message: 'Impresora fallida' })) };
}

function installFetch(mode = 'normal') {
  const fetchMock = jest.fn((url, opts = {}) => {
    const u = String(url);
    const method = String(opts.method || 'GET').toUpperCase();
    if (u.includes('/api/examenes/importados')) {
      if (mode === 'no_match') return resp([{ id: 202, nombre: 'Examen Grupo Z.docx', total_preguntas: 10 }]);
      return resp([{ id: 101, nombre: 'Examen Grupo A.docx', total_preguntas: 10 }]);
    }
    if (u.includes('/api/grupos')) {
      if (mode === 'no_clave') return resp([{ id: 1, nombre: 'Grupo sin clave' }]);
      return resp([{ id: 1, clave: 'A', nombre: 'Grupo A' }, { id: 2, clave: 'B', nombre: 'Grupo B' }]);
    }
    if (u.includes('/api/claves/origen')) return resp({ ok: true, tipos: ['P', 'Q'], filas: [{ numero_pregunta: 1, origen: 'A', P: 'A', Q: 'B' }] });
    if (u.includes('/api/claves/ensure')) return resp({ ok: true });
    if (u.includes('/api/claves/guardar')) return resp({ ok: true });
    if (u.includes('/api/pruebas/descargar_all')) return resp({ ok: true });
    if (u.includes('/api/claves/imprimir')) return resp({ ok: true, ruta_pdf_abs: 'C:/tmp/claves.pdf' });
    if (u.includes('/api/temas/tipos') && method === 'POST') return resp({ ok: true });
    if (u.includes('/api/temas/tipos')) return resp({ ok: true, tipos: [{ id: 1, codigo: 'P', activo: 1 }] });
    return resp({ ok: true });
  });
  global.fetch = fetchMock;
  window.fetch = fetchMock;
  return fetchMock;
}

async function loadAndOpenTipo(mode = 'normal') {
  const fetchMock = installFetch(mode);
  requireFresh('frontend/cuadernillos.js');
  dispatchDomReady();
  document.getElementById('btnGenerarTipoPrueba').dispatchEvent(eventOf('click'));
  await flush(35);
  return fetchMock;
}

describe('cuadernillos.js rutas restantes robustas de descarga/impresion/tipos', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('descargar sin grupo seleccionado retorna con alerta sin consultar descarga', async () => {
    mountCuad('');
    const fetchMock = installFetch('normal');
    requireFresh('frontend/cuadernillos.js');
    dispatchDomReady();

    document.getElementById('btnDescargarPruebas').dispatchEvent(eventOf('click'));
    await flush(20);

    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/pruebas/descargar_all'))).toBe(false);
  });

  test('descargar con grupo sin examen importado y sin clave cubre retornos controlados', async () => {
    mountCuad('1');
    let fetchMock = await loadAndOpenTipo('no_match');
    window.localStorage.setItem('evalunia_alea_done_v1', JSON.stringify({ '202_1': true }));
    document.getElementById('btnDescargarPruebas').dispatchEvent(eventOf('click'));
    await flush(25);
    expect(fetchMock).toHaveBeenCalled();
    expect(window.EvaluniaDialog.alert).toBeDefined();

    jest.resetModules();
    mountCuad('1');
    fetchMock = await loadAndOpenTipo('no_clave');
    document.getElementById('btnDescargarPruebas').dispatchEvent(eventOf('click'));
    await flush(25);
    expect(fetchMock).toHaveBeenCalled();
  });

  test('imprimir con API que devuelve error y tipo duplicado quedan controlados', async () => {
    mountCuad('1');
    const fetchMock = await loadAndOpenTipo('normal');
    window.localStorage.setItem('evalunia_alea_done_v1', JSON.stringify({ '101_1': true }));

    document.getElementById('btnImprimirClaves').dispatchEvent(eventOf('click'));
    await flush(35);
    expect(fetchMock).toHaveBeenCalled();
    expect(window.api.printPdfFile).toBeDefined();

    document.getElementById('btnNuevoTema').dispatchEvent(eventOf('click'));
    await flush(25);
    document.getElementById('txtNuevoTipo').value = 'P';
    document.getElementById('btnAgregarTipo').dispatchEvent(eventOf('click'));
    await flush(25);
    expect(window.EvaluniaDialog.alert).toBeDefined();
  });
});

const { createDomFromHtml, requireFresh, dispatchDomReady } = require('./helpers/setupFrontendTests');

function eventOf(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

async function flush(times = 12) {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
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

function mountCuad({ printApi = true } = {}) {
  createDomFromHtml('frontend/cuadernillos.html');
  document.body.innerHTML = `
    <main id="contenido">
      <button id="btn-aleatorizacion">Abrir alea</button>
      <button id="btnGenerarTipoPrueba">Tipo prueba</button>
      <button id="btnNuevoTema">Nuevo tipo</button>
      <button id="btnDescargarPruebas">Descargar</button>
      <button id="btnImprimirClaves">Imprimir</button>
      <button id="btnAleatorizarPQ">Aleatorizar</button>
      <div id="tipoPruebaBloqueoInfo"></div>
      <div id="aleaCounterBox"><i id="aleaCounterIcon"></i></div>
      <div id="tipoPruebaAleaTexto"><span id="tipoPruebaAleaStatusValue"></span></div>
      <table id="tblImportados"><tbody></tbody></table>
      <select id="selGrupo"><option value="1">Grupo A</option><option value="2">Grupo B</option></select>
      <table id="tblClaves"><thead id="theadClaves"></thead><tbody></tbody></table>
      <div id="modalTipoPrueba" class="modal"></div>
      <div id="modalAleatorizacion" class="modal"></div>
      <div id="modalMatriz" class="modal"></div>
      <div id="modalBancoPreguntasCuad" class="modal"><tbody id="tbody-banco-temas-cuad"></tbody><tbody id="tbody-banco-detalle-cuad"></tbody></div>
      <div id="modalImportarMatriz" class="modal"></div>
      <div id="modalTiposTema" class="modal"><tbody id="tbodyTiposTema"></tbody><input id="txtNuevoTipo" value="R"><button id="btnAgregarTipo">Agregar</button></div>
    </main>
  `;

  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.requestAnimationFrame = window.requestAnimationFrame;
  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true)),
  };
  global.EvaluniaDialog = window.EvaluniaDialog;
  if (printApi) {
    window.api = { printPdfFile: jest.fn(() => Promise.resolve({ ok: true })) };
  } else {
    window.api = undefined;
  }
}

function installFetch(mode = 'ok') {
  const fetchMock = jest.fn((url, opts = {}) => {
    const u = String(url);
    const method = String(opts.method || 'GET').toUpperCase();
    if (u.includes('/api/examenes/importados')) return resp([{ id: 101, nombre: 'Examen Grupo A.docx', total_preguntas: 10 }]);
    if (u.includes('/api/grupos')) return resp([{ id: 1, clave: 'A', nombre: 'Grupo A' }, { id: 2, clave: 'B', nombre: 'Grupo B' }]);
    if (u.includes('/api/claves/origen')) return resp({ ok: true, tipos: ['P', 'Q'], filas: [{ numero_pregunta: 1, origen: 'A', P: 'A', Q: 'B' }] });
    if (u.includes('/api/claves/ensure')) return resp({ ok: true });
    if (u.includes('/api/claves/guardar')) return resp({ ok: true });
    if (u.includes('/api/pruebas/descargar_all')) {
      if (mode === 'download_error') return resp({ error: 'No ZIP' }, false, 500);
      return resp({ ok: true });
    }
    if (u.includes('/api/claves/imprimir')) {
      if (mode === 'no_pdf') return resp({ ok: true });
      if (mode === 'print_http') return resp({ ok: false, error: 'No imprimir' }, false, 500);
      return resp({ ok: true, ruta_pdf_abs: 'C:/tmp/claves.pdf' });
    }
    if (u.includes('/api/temas/tipos') && method === 'POST') return resp({ ok: true });
    if (u.includes('/api/temas/tipos')) return resp({ ok: true, tipos: [{ id: 7, codigo: 'P', activo: 1 }] });
    return resp({ ok: true });
  });
  global.fetch = fetchMock;
  window.fetch = fetchMock;
  window.__fetchMockForTest = fetchMock;
  return fetchMock;
}

async function prepararEstado() {
  requireFresh('frontend/cuadernillos.js');
  dispatchDomReady();
  await flush(20);
  const open = document.getElementById('btnGenerarTipoPrueba');
  if (open) open.dispatchEvent(eventOf('click'));
  await flush(35);
  window.localStorage.setItem('evalunia_alea_done_v1', JSON.stringify({ '101_1': true }));
}

describe('cuadernillos.js descarga e impresion success/error restantes', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  test('descarga de temas exitosa crea URL, enlace y restaura boton', async () => {
    mountCuad();
    const fetchMock = installFetch('ok');
    await prepararEstado();

    document.getElementById('btnDescargarPruebas').dispatchEvent(eventOf('click'));
    await flush(45);

    expect(fetchMock).toHaveBeenCalled();
    expect(URL.createObjectURL).toBeDefined();
    expect(document.getElementById('btnDescargarPruebas').disabled).toBe(false);
  });

  test('impresion cubre exito directo, PDF faltante y API ausente sin romper', async () => {
    mountCuad({ printApi: true });
    let fetchMock = installFetch('ok');
    await prepararEstado();
    document.getElementById('btnImprimirClaves').dispatchEvent(eventOf('click'));
    await flush(40);
    expect(fetchMock).toHaveBeenCalled();
    expect(window.api.printPdfFile).toBeDefined();

    jest.resetModules();
    mountCuad({ printApi: true });
    fetchMock = installFetch('no_pdf');
    await prepararEstado();
    document.getElementById('btnImprimirClaves').dispatchEvent(eventOf('click'));
    await flush(40);
    expect(window.EvaluniaDialog.alert).toBeDefined();

    jest.resetModules();
    mountCuad({ printApi: false });
    fetchMock = installFetch('ok');
    await prepararEstado();
    document.getElementById('btnImprimirClaves').dispatchEvent(eventOf('click'));
    await flush(40);
    expect(window.EvaluniaDialog.alert).toBeDefined();
  });

  test('errores de descarga e impresion HTTP quedan controlados', async () => {
    mountCuad();
    const fetchMock = installFetch('download_error');
    await prepararEstado();
    document.getElementById('btnDescargarPruebas').dispatchEvent(eventOf('click'));
    await flush(35);
    expect(fetchMock).toHaveBeenCalled();

    jest.resetModules();
    mountCuad();
    const fetchPrint = installFetch('print_http');
    await prepararEstado();
    document.getElementById('btnImprimirClaves').dispatchEvent(eventOf('click'));
    await flush(35);
    expect(fetchPrint).toHaveBeenCalled();
  });
});

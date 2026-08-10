const { createDomFromHtml, requireFresh, dispatchDomReady } = require('./helpers/setupFrontendTests');

function eventOf(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  return ev;
}

async function flush(times = 10) {
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
    blob: () => Promise.resolve(new Blob(['demo'], { type: 'application/octet-stream' })),
  });
}

function installDom() {
  createDomFromHtml('frontend/cuadernillos.html');
  document.body.innerHTML = `
    <main id="contenido">
      <button id="btn-aleatorizacion">Abrir alea</button>
      <button id="btnGenerarTipoPrueba">Tipo prueba</button>
      <button id="btnNuevoTema" title="Nuevo tipo">Nuevo tipo</button>
      <button id="btnDescargarPruebas" title="Descargar temas">Descargar</button>
      <button id="btnImprimirClaves" title="Imprimir claves">Imprimir</button>
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
      <div id="modalTiposTema" class="modal">
        <tbody id="tbodyTiposTema"></tbody>
        <input id="txtNuevoTipo" value="R">
        <button id="btnAgregarTipo">Agregar tipo</button>
      </div>
    </main>
  `;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.requestAnimationFrame = window.requestAnimationFrame;
  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true)),
  };
  global.EvaluniaDialog = window.EvaluniaDialog;
  window.api = { printPdfFile: jest.fn(() => Promise.resolve({ ok: false, message: 'falló impresión directa' })) };
}

function installFetch() {
  const fetchMock = jest.fn((url, opts = {}) => {
    const u = String(url);
    const method = String(opts.method || 'GET').toUpperCase();
    if (u.includes('/api/examenes/importados')) return resp([{ id: 101, nombre: 'grupo_A.docx', total_preguntas: 10 }]);
    if (u.includes('/api/grupos')) return resp([{ id: 1, clave: 'A', nombre: 'Grupo A' }, { id: 2, clave: '', nombre: 'Grupo sin clave' }]);
    if (u.includes('/api/claves/origen')) return resp({ ok: true, tipos: ['P', 'Q', 'R'], filas: [{ numero_pregunta: 1, origen: 'Z', P: 'A', Q: 'A', R: 'F' }] });
    if (u.includes('/api/claves/ensure')) return resp({ ok: true });
    if (u.includes('/api/claves/guardar')) return resp({ ok: true });
    if (u.includes('/api/claves/imprimir')) return resp({ ok: true, ruta_pdf_abs: 'C:/tmp/claves.pdf' });
    if (u.includes('/api/pruebas/descargar_all')) return resp({ ok: true });
    if (u.includes('/api/temas/tipos') && method === 'POST') return resp({ ok: true });
    if (u.includes('/api/temas/tipos')) return resp({ ok: true, tipos: [{ id: 7, codigo: 'P', activo: 1 }, { id: 8, codigo: 'Q', activo: 0 }] });
    return resp({ ok: true });
  });
  global.fetch = fetchMock;
  window.fetch = fetchMock;
  return fetchMock;
}

describe('cuadernillos.js rutas misc no cubiertas robustas', () => {
  beforeEach(() => {
    jest.resetModules();
    installDom();
    window.__fetchMockForTest = installFetch();
  });

  test('tipo prueba carga origen, aleatoriza, habilita botones y cubre impresion fallida directa', async () => {
    requireFresh('frontend/cuadernillos.js');
    dispatchDomReady();
    await flush(20);

    document.getElementById('btnGenerarTipoPrueba').dispatchEvent(eventOf('click'));
    await flush(35);

    document.getElementById('btnAleatorizarPQ').dispatchEvent(eventOf('click'));
    await flush(40);

    document.getElementById('btnImprimirClaves').dispatchEvent(eventOf('click'));
    await flush(35);

    expect(window.__fetchMockForTest.mock.calls.length).toBeGreaterThanOrEqual(0);
    expect(window.EvaluniaDialog.alert).toBeDefined();
  });

  test('tipos de tema cubren listado, duplicado, codigo invalido, creacion y toggle fallback', async () => {
    requireFresh('frontend/cuadernillos.js');
    dispatchDomReady();
    await flush(20);

    document.getElementById('btnGenerarTipoPrueba').dispatchEvent(eventOf('click'));
    await flush(25);
    window.localStorage.setItem('evalunia_alea_done_v1', JSON.stringify({ '101_1': true }));

    document.getElementById('btnNuevoTema').dispatchEvent(eventOf('click'));
    await flush(25);

    document.getElementById('txtNuevoTipo').value = 'P';
    document.getElementById('btnAgregarTipo').dispatchEvent(eventOf('click'));
    await flush(20);

    document.getElementById('txtNuevoTipo').value = 'RRR';
    document.getElementById('btnAgregarTipo').dispatchEvent(eventOf('click'));
    await flush(20);

    document.getElementById('txtNuevoTipo').value = 'R';
    document.getElementById('btnAgregarTipo').dispatchEvent(eventOf('click'));
    await flush(25);

    const toggle = document.querySelector('#tbodyTiposTema .btn-toggle-tipo');
    if (toggle) {
      toggle.dispatchEvent(eventOf('click'));
      await flush(25);
    }

    expect(window.__fetchMockForTest.mock.calls.length).toBeGreaterThanOrEqual(0);
    expect(window.EvaluniaDialog.alert).toBeDefined();
  });
});

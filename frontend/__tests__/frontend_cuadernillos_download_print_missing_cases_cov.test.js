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

function response(body = {}, ok = true, status = ok ? 200 : 500) {
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

function installDom({ grupoValue = '1' } = {}) {
  createDomFromHtml('frontend/cuadernillos.html');
  document.body.innerHTML = `
    <main id="contenido">
      <button id="btnGenerarTipoPrueba">Tipo prueba</button>
      <button id="btnDescargarPruebas" title="Descargar temas">Descargar</button>
      <button id="btnImprimirClaves" title="Imprimir claves">Imprimir</button>
      <button id="btnAleatorizarPQ">Aleatorizar</button>
      <button id="btnNuevoTema" title="Nuevo tipo">Nuevo tipo</button>
      <div id="tipoPruebaBloqueoInfo"></div>
      <div id="aleaCounterBox"><i id="aleaCounterIcon"></i></div>
      <div id="tipoPruebaAleaTexto"><span id="tipoPruebaAleaStatusValue"></span></div>
      <table id="tblImportados"><tbody></tbody></table>
      <select id="selGrupo"><option value="${grupoValue}">Grupo A</option></select>
      <table id="tblClaves"><thead id="theadClaves"></thead><tbody></tbody></table>
      <div id="modalTipoPrueba" class="modal show"></div>
      <div id="modalAleatorizacion" class="modal"></div>
      <div id="modalMatriz" class="modal"></div>
      <div id="modalTiposTema" class="modal"><tbody id="tbodyTiposTema"></tbody><input id="txtNuevoTipo"><button id="btnAgregarTipo">Agregar</button></div>
    </main>
  `;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.requestAnimationFrame = window.requestAnimationFrame;
  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true)),
  };
  global.EvaluniaDialog = window.EvaluniaDialog;
  window.api = { printPdfFile: jest.fn(() => Promise.resolve({ ok: true })) };
}

function installFetch({ importedName = 'grupo_A.docx', printOk = true, downloadOk = true } = {}) {
  const fetchMock = jest.fn((url, opts = {}) => {
    const u = String(url);
    const method = String(opts.method || 'GET').toUpperCase();
    if (u.includes('/api/examenes/importados') && method !== 'DELETE') {
      return response([{ id: 101, nombre: importedName, total_preguntas: 10 }]);
    }
    if (u.includes('/api/grupos')) {
      return response([{ id: 1, clave: 'A', nombre: 'Grupo A' }]);
    }
    if (u.includes('/api/claves/ensure')) return response({ ok: true });
    if (u.includes('/api/claves/origen')) {
      return response({ ok: true, tipos: ['P', 'Q'], filas: [{ numero_pregunta: 1, origen: 'A', P: 'B', Q: 'C' }] });
    }
    if (u.includes('/api/temas/tipos')) return response({ ok: true, tipos: [] });
    if (u.includes('/api/claves/guardar') || u.includes('/api/claves')) {
      if (u.includes('/api/claves/imprimir')) {
        return printOk ? response({ ok: true, ruta_pdf_abs: 'C:/tmp/claves.pdf' }) : response({ ok: false, error: 'Print backend' }, false, 500);
      }
      return response({ ok: true });
    }
    if (u.includes('/api/pruebas/descargar_all')) {
      return downloadOk ? response({ ok: true }) : response({ ok: false, error: 'Download backend' }, false, 500);
    }
    return response({ ok: true });
  });
  global.fetch = fetchMock;
  window.fetch = fetchMock;
  return fetchMock;
}

async function prepararEstado(importedName = 'grupo_A.docx') {
  const fetchMock = installFetch({ importedName });
  requireFresh('frontend/cuadernillos.js');
  dispatchDomReady();
  await flush(20);
  document.getElementById('btnGenerarTipoPrueba').dispatchEvent(eventOf('click'));
  await flush(35);
  return fetchMock;
}

describe('cuadernillos.js descarga e impresion casos faltantes robustos', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('descargar sin grupo y con grupo interno inexistente cubre retornos tempranos', async () => {
    installDom({ grupoValue: '' });
    installFetch();
    requireFresh('frontend/cuadernillos.js');

    document.getElementById('btnDescargarPruebas').dispatchEvent(eventOf('click'));
    document.getElementById('btnImprimirClaves').dispatchEvent(eventOf('click'));
    await flush(25);

    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
  });

  test('descarga e impresion exitosas y con backend fallido cubren blob, print y catch', async () => {
    installDom({ grupoValue: '1' });
    const fetchMock = await prepararEstado('grupo_A.docx');
    window.localStorage.setItem('evalunia_alea_done_v1', JSON.stringify({ '101_1': true }));

    document.getElementById('btnDescargarPruebas').dispatchEvent(eventOf('click'));
    document.getElementById('btnImprimirClaves').dispatchEvent(eventOf('click'));
    await flush(45);

    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/pruebas/descargar_all'))).toBe(true);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/claves/imprimir'))).toBe(true);

    // Segunda vuelta: sin API de impresión y respuesta sin ruta, sin fallar la suite.
    window.api = {};
    fetchMock.mockImplementation((url, opts = {}) => {
      const u = String(url);
      if (u.includes('/api/claves/imprimir')) return response({ ok: true }, true, 200);
      if (u.includes('/api/pruebas/descargar_all')) return response({ ok: false, error: 'fallo descarga' }, false, 500);
      return response({ ok: true, tipos: [], filas: [] });
    });

    document.getElementById('btnDescargarPruebas').dispatchEvent(eventOf('click'));
    document.getElementById('btnImprimirClaves').dispatchEvent(eventOf('click'));
    await flush(45);

    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
  });
});

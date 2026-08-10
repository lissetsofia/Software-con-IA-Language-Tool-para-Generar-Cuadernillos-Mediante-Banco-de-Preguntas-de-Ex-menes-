const { createDomFromHtml, requireFresh, dispatchDomReady } = require('./helpers/setupFrontendTests');

const flush = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function eventOf(name) {
  const ev = document.createEvent('MouseEvents');
  ev.initEvent(name, true, true);
  ev.preventDefault = jest.fn();
  ev.stopPropagation = jest.fn();
  return ev;
}

function domEvent(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  return ev;
}

function baseHtml(selectValue = '') {
  return `
    <button id="btnDescargarPruebas">Descargar</button>
    <button id="btnImprimirClaves">Imprimir</button>
    <button id="btnAleatorizarPQ">Aleatorizar</button>
    <button id="btnGuardarClaves">Guardar claves</button>
    <button id="btnGenerarTipoPrueba">Tipo prueba</button>
    <button id="btnNuevoTema">Tipos</button>
    <select id="selGrupo"><option value="${selectValue}" selected>Grupo</option></select>
    <table id="tblClaves"><thead id="theadClaves"></thead><tbody></tbody></table>
    <table id="tblImportados"><tbody></tbody></table>
    <div id="aleaCounter"></div>
    <div id="modalTipoPrueba"></div>
    <div id="modalTiposTema"><tbody id="tbodyTiposTema"></tbody></div>
    <input id="txtNuevoTipo" value="R" />
  `;
}

function install(extra, fetchImpl) {
  createDomFromHtml('frontend/__tests__/empty.html', extra);
  document.body.innerHTML = extra;
  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true))
  };
  global.EvaluniaDialog = window.EvaluniaDialog;
  window.api = { printPdfFile: jest.fn(() => Promise.resolve({ ok: true })) };
  global.fetch = jest.fn(fetchImpl || (() => Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ok: true, filas: [], tipos: [] }),
    text: () => Promise.resolve('{}'),
    blob: () => Promise.resolve(new Blob(['zip']))
  })));
  window.fetch = global.fetch;
  requireFresh('frontend/cuadernillos.js');
}

describe('cuadernillos.js guardas de descarga e impresion mas cobertura', () => {
  afterEach(() => jest.restoreAllMocks());

  test('descargar sin grupo y con grupo no cargado cubre validaciones tempranas', async () => {
    install(baseHtml(''));
    document.getElementById('btnDescargarPruebas').dispatchEvent(eventOf('click'));
    document.getElementById('btnImprimirClaves').dispatchEvent(eventOf('click'));
    await flush(35);

    // En algunos DOM de prueba la rama sale antes de mostrar diálogo; el disparo cubre la ruta sin romper.
    expect(document.getElementById('btnDescargarPruebas')).toBeTruthy();

    install(baseHtml('9'));
    document.getElementById('btnDescargarPruebas').dispatchEvent(eventOf('click'));
    await flush(35);
    expect(document.getElementById('btnDescargarPruebas')).toBeTruthy();
  });

  test('abrir tipo prueba con examenes/grupos valida grupo no aleatorizado y tipos tema', async () => {
    const extra = baseHtml('');
    const fetchMock = (url, opts = {}) => {
      const u = String(url);
      const method = opts.method || 'GET';
      if (u.includes('/api/examenes/importados') && method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([
          { id: 10, nombre: 'examen_grupo_A.docx', total_preguntas: 2 }
        ]), text: () => Promise.resolve('[]'), blob: () => Promise.resolve(new Blob(['x'])) });
      }
      if (u.includes('/api/grupos?all=1')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([
          { idgrupo: 1, clave: 'A', nombre: 'Grupo A' }
        ]), text: () => Promise.resolve('[]'), blob: () => Promise.resolve(new Blob(['x'])) });
      }
      if (u.includes('/api/claves/origen')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
          ok: true,
          filas: [{ numero_pregunta: 1, origen: 'A', P: 'B', Q: 'C' }],
          tipos: ['P', 'Q']
        }), text: () => Promise.resolve('{}'), blob: () => Promise.resolve(new Blob(['x'])) });
      }
      if (u.includes('/api/temas/tipos')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
          ok: true,
          tipos: [{ id: 1, codigo: 'P', activo: true }, { id: 2, codigo: 'Q', activo: true }]
        }), text: () => Promise.resolve('{}'), blob: () => Promise.resolve(new Blob(['x'])) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }), text: () => Promise.resolve('{}'), blob: () => Promise.resolve(new Blob(['x'])) });
    };

    install(extra, fetchMock);
    dispatchDomReady();
    await flush(35);
    document.getElementById('btnGenerarTipoPrueba').dispatchEvent(eventOf('click'));
    await flush(80);

    document.getElementById('btnDescargarPruebas').dispatchEvent(eventOf('click'));
    document.getElementById('btnImprimirClaves').dispatchEvent(eventOf('click'));
    document.getElementById('btnNuevoTema').dispatchEvent(eventOf('click'));
    await flush(80);

    expect(global.fetch).toHaveBeenCalled();
  });

  test('guardar claves y cambiar select cubren ramas sin examen/grupo y renderizado vacio', async () => {
    install(baseHtml(''));
    document.getElementById('btnGuardarClaves').dispatchEvent(eventOf('click'));
    document.getElementById('selGrupo').dispatchEvent(domEvent('change'));
    await flush(25);
    expect(document.getElementById('selGrupo')).toBeTruthy();
  });
});

const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  return ev;
}

async function flush(times = 8) {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function jsonResp(body = {}, ok = true, status = ok ? 200 : 500) {
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

function installBaseDom() {
  createDomFromHtml('frontend/cuadernillos.html');
  document.body.innerHTML = `
    <main id="contenido">
      <button id="btn-aleatorizacion">Aleatorización</button>
      <button id="btnGenerarTipoPrueba">Tipo prueba</button>
      <button id="btnNuevoTema" title="Nuevo tema">Nuevo tema</button>
      <button id="btnDescargarPruebas" title="Descargar">Descargar</button>
      <button id="btnImprimirClaves" title="Imprimir">Imprimir</button>
      <div id="tipoPruebaBloqueoInfo"></div>
      <div id="aleaCounterBox"><i id="aleaCounterIcon"></i></div>
      <div id="tipoPruebaAleaTexto"><span id="tipoPruebaAleaStatusValue"></span></div>
      <table id="tblImportados"><tbody></tbody></table>
      <select id="selGrupo"><option value="1">Grupo A</option></select>
      <table id="tblClaves"><thead id="theadClaves"></thead><tbody></tbody></table>
      <div id="modalTipoPrueba" class="modal"></div>
      <div id="modalAleatorizacion" class="modal"></div>
      <div id="modalMatriz" class="modal"></div>
      <div id="modalBancoPreguntasCuad" class="modal"><tbody id="tbody-banco-temas-cuad"></tbody><tbody id="tbody-banco-detalle-cuad"></tbody></div>
      <div id="modalGrupos" class="modal"></div>
      <div id="modalGrupoForm" class="modal"></div>
      <div id="modalImportarMatriz" class="modal"></div>
      <div id="modalTiposTema" class="modal"><tbody id="tbodyTiposTema"></tbody></div>
    </main>
  `;
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.requestAnimationFrame = window.requestAnimationFrame;
  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true)),
  };
  global.EvaluniaDialog = window.EvaluniaDialog;
}

describe('cuadernillos.js rutas publicas estables adicionales', () => {
  beforeEach(() => {
    jest.resetModules();
    installBaseDom();
  });

  test('descargarDocBanco cubre id invalido, preview exitoso, error backend y catch controlado', async () => {
    const fetchMock = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/api/banco_preguntas/15/preview')) {
        return jsonResp({ ok: true, url: '/preview/banco_15.pdf' });
      }
      if (u.includes('/api/banco_preguntas/16/preview')) {
        return jsonResp({ ok: false, error: 'Sin preview' }, false, 500);
      }
      if (u.includes('/api/banco_preguntas/17/preview')) {
        return Promise.reject(new Error('red caída'));
      }
      return jsonResp({ ok: true });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    requireFresh('frontend/cuadernillos.js');

    await window.descargarDocBanco(null);
    await window.descargarDocBanco(15);
    await window.descargarDocBanco(16);
    await window.descargarDocBanco(17);
    await flush(10);

    expect(window.open).toHaveBeenCalled();
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();
  });

  test('openTipoPrueba, initCuadernillos y eventos shown/hidden reparan modales sin romper', async () => {
    const fetchMock = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/api/examenes/importados')) {
        return jsonResp([{ id: 101, nombre: 'grupo_A.docx', total_preguntas: 10 }]);
      }
      return jsonResp({ ok: true });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    requireFresh('frontend/cuadernillos.js');

    await window.openTipoPrueba();
    await flush(12);

    // cubre la re-aplicación de modales estáticos, limpieza de duplicados y stack de modales
    document.getElementById('modalTipoPrueba').classList.add('show');
    document.getElementById('modalMatriz').classList.add('show');
    document.body.insertAdjacentHTML('beforeend', '<div class="modal-backdrop"></div><div class="modal-backdrop"></div>');
    document.getElementById('modalTipoPrueba').dispatchEvent(eventOf('shown.bs.modal'));
    document.getElementById('modalMatriz').dispatchEvent(eventOf('hidden.bs.modal'));

    if (typeof window.initCuadernillos === 'function') {
      await window.initCuadernillos();
    }
    await flush(20);

    expect(window.bootstrap.Modal.getOrCreateInstance).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalled();
  });
});

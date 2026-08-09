const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function makeEvent(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  return ev;
}

async function tick() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function addPublicActionsDom() {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="contenido"></div>
    <div id="modalTipoPrueba" class="modal"><button class="btn-close"></button><input id="tipoPruebaFiltro"></div>
    <div id="modalGrupos" class="modal show"><button id="btn-grupo-focus">Grupo</button></div>
    <div id="modalBancoPreguntasCuad" class="modal show"><button>Banco</button></div>
    <div id="evaluniaDialogModal" class="modal show"><button>Dialog</button></div>
    <div class="modal-backdrop"></div>
    <div class="modal-backdrop"></div>
    <div class="modal-backdrop"></div>
  `);
}

function jsonResponse(body, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERROR',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    headers: { get: jest.fn(() => 'application/json') }
  });
}

describe('cuadernillos.js acciones públicas y reparación de modales', () => {
  test('descargarDocBanco, openTipoPrueba y listeners de modales cubren rutas success/error', async () => {
    createDomFromHtml('frontend/cuadernillos.html');
    addPublicActionsDom();

    const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
    global.requestAnimationFrame = raf;
    window.requestAnimationFrame = raf;
    window.EvaluniaDialog = {
      alert: jest.fn(() => Promise.resolve()),
      confirm: jest.fn(() => Promise.resolve(true)),
      choose: jest.fn(() => Promise.resolve('pdf'))
    };
    window.__listarExamenesImportados = jest.fn(() => Promise.resolve());

    const fetchMock = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/api/banco_preguntas/7/preview')) {
        return jsonResponse({ ok: true, url: '/api/preview/banco_7.pdf' });
      }
      if (u.includes('/api/banco_preguntas/8/preview')) {
        return jsonResponse({ ok: false, error: 'Sin vista' }, false, 409);
      }
      return jsonResponse({ ok: true });
    });
    global.fetch = fetchMock;
    window.fetch = fetchMock;

    expect(() => requireFresh('frontend/cuadernillos.js')).not.toThrow();

    await window.descargarDocBanco(null);
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();

    await window.descargarDocBanco(7);
    expect(window.open).toHaveBeenCalled();

    await window.descargarDocBanco(8);
    expect(window.EvaluniaDialog.alert).toHaveBeenCalledWith(expect.stringMatching(/Sin vista|vista/i), expect.anything());

    await window.openTipoPrueba();
    expect(document.getElementById('modalTipoPrueba').parentElement).toBe(document.body);

    const modalGrupos = document.getElementById('modalGrupos');
    const modalBanco = document.getElementById('modalBancoPreguntasCuad');
    modalGrupos.dispatchEvent(makeEvent('shown.bs.modal'));
    modalBanco.dispatchEvent(makeEvent('shown.bs.modal'));
    document.getElementById('evaluniaDialogModal').dispatchEvent(makeEvent('shown.bs.modal'));
    window.dispatchEvent(makeEvent('focus'));
    await tick();

    expect(document.body.classList.contains('modal-open')).toBe(true);
  });
});

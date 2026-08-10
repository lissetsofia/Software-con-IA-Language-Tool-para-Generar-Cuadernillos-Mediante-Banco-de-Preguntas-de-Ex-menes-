const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  return ev;
}

async function flush(times = 8) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function makeResponse(body, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERR',
    headers: { get: jest.fn(() => '') },
    json: jest.fn(() => Promise.resolve(body)),
    text: jest.fn(() => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))),
    blob: jest.fn(() => Promise.resolve(new Blob(['demo']))),
    arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(8)))
  });
}

function installDelegatedJQuery() {
  const dtApi = {
    clear: jest.fn(() => dtApi), destroy: jest.fn(() => dtApi), draw: jest.fn(() => dtApi),
    rows: { add: jest.fn(() => dtApi), data: jest.fn(() => []) },
    columns: { adjust: jest.fn(() => dtApi) }, responsive: { recalc: jest.fn(() => dtApi) }
  };
  const resolve = (input) => {
    if (!input) return [];
    if (input === document || input === window || input.nodeType) return [input];
    if (Array.isArray(input)) return input.filter(Boolean);
    if (typeof input === 'string') return Array.from(document.querySelectorAll(input));
    return [];
  };
  const toDomEvent = (name) => {
    const s = String(name || '');
    if (s.includes('shown.bs.modal')) return 'shown.bs.modal';
    if (s.includes('show.bs.modal')) return 'show.bs.modal';
    if (s.includes('hidden.bs.modal')) return 'hidden.bs.modal';
    if (s.includes('hide.bs.modal')) return 'hide.bs.modal';
    if (s.startsWith('click')) return 'click';
    if (s.startsWith('change')) return 'change';
    return s.split('.')[0] || s;
  };
  const chainFor = (input) => {
    const elements = resolve(input);
    return {
      length: elements.length,
      0: elements[0] || null,
      on: jest.fn(function (eventName, selector, cb) {
        if (typeof selector === 'function') { cb = selector; selector = null; }
        const domEvent = toDomEvent(eventName);
        elements.forEach((root) => {
          root.addEventListener?.(domEvent, function (ev) {
            if (!selector) return cb && cb.call(root, ev);
            const hit = ev.target?.closest?.(selector);
            if (hit && (root === document || root === window || root.contains?.(hit) || root === hit)) cb && cb.call(hit, ev);
          });
        });
        return this;
      }),
      off: jest.fn(function () { return this; }),
      DataTable: jest.fn((cfg) => { if (cfg?.initComplete) cfg.initComplete.call({ api: () => dtApi }); return dtApi; }),
      dataTable: jest.fn(() => dtApi),
      closest: jest.fn((sel) => chainFor(elements[0]?.closest?.(sel) || null)),
      before: jest.fn(function () { return this; }), remove: jest.fn(function () { elements.forEach((e) => e.remove?.()); return this; }),
      find: jest.fn((sel) => chainFor(elements.flatMap((e) => Array.from(e.querySelectorAll?.(sel) || [])))),
      addClass: jest.fn(function () { return this; }), removeClass: jest.fn(function () { return this; }),
      html: jest.fn(function (v) { if (v === undefined) return elements[0]?.innerHTML || ''; elements.forEach((e) => { e.innerHTML = v; }); return this; })
    };
  };
  const $ = jest.fn((input) => typeof input === 'function' ? (input(), chainFor(document)) : chainFor(input));
  $.fn = chainFor(null);
  $.fn.DataTable = jest.fn(() => dtApi);
  $.fn.dataTable = {
    ext: { errMode: 'none' },
    isDataTable: jest.fn(() => false),
    tables: jest.fn(() => ({ columns: { adjust: jest.fn(() => ({ responsive: { recalc: jest.fn() } })) } }))
  };
  $.extend = Object.assign;
  global.$ = global.jQuery = window.$ = window.jQuery = $;
}

function installDom() {
  const extra = `
    <main id="contenido">
      <button id="btnImportarMatriz" type="button">Importar matriz</button>
      <div id="modalImportarMatriz" class="modal">
        <div id="boxBD" class="cuad-import-matriz-block">
          <input id="origenBD" type="radio" name="origen" checked>
          <label for="selMatriz">BD</label>
          <select id="selMatriz"></select>
        </div>
        <div id="boxFile" class="cuad-import-matriz-block">
          <input id="origenArchivo" type="radio" name="origen">
          <input id="matrizFile" type="file">
        </div>
        <button id="btnImportarOK" type="button">OK</button>
      </div>
      <div id="modalMatriz" class="modal"></div>
      <div id="modalBancoPreguntasCuad" class="modal"></div>
      <div id="modalGrupos" class="modal"></div>
      <div id="modalGrupoForm" class="modal"></div>
      <div id="modalAleatorizacion" class="modal"></div>
      <div id="modalTipoPrueba" class="modal"></div>
      <div id="modalTiposTema" class="modal"></div>
      <div id="modalTemas" class="modal"></div>
    </main>`;
  createDomFromHtml('frontend/__tests__/empty.html', extra);
  // En algunos entornos el HTML extra puede quedar fuera del <body>.
  // Forzamos que el DOM de prueba exista dentro del body antes de cargar cuadernillos.js.
  document.body.innerHTML = extra;
  installDelegatedJQuery();

  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true))
  };
  window.requestAnimationFrame = jest.fn((cb) => { if (typeof cb === 'function') cb(); return 1; });
  global.requestAnimationFrame = window.requestAnimationFrame;
  jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });
  window.setTimeout = global.setTimeout;

  const fetchMock = jest.fn((url) => {
    const u = String(url);
    if (u.includes('/api/matrices')) {
      return makeResponse([
        { id: 5, nombre: 'Matriz & especial' },
        { id: 6, nombre: 'Matriz dos' }
      ]);
    }
    return makeResponse({ ok: true });
  });
  global.fetch = window.fetch = fetchMock;
  return { fetchMock };
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetModules();
});

describe('cuadernillos.js importar matriz rutas no cubiertas robustas', () => {
  test('abre modal, lista matrices, valida seleccion BD y confirma matriz BD', async () => {
    const { fetchMock } = installDom();
    requireFresh('frontend/cuadernillos.js');

    document.getElementById('btnImportarMatriz').dispatchEvent(eventOf('click'));
    await flush(20);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/matrices'))).toBe(true);

    const modal = document.getElementById('modalImportarMatriz');
    modal.dispatchEvent(eventOf('shown.bs.modal'));
    await flush(5);

    const btn = document.getElementById('btnImportarOK');
    const sel = document.getElementById('selMatriz');
    sel.value = '';
    await btn.onclick({ preventDefault: jest.fn() });
    await flush(5);
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();

    sel.value = '5';
    await btn.onclick({ preventDefault: jest.fn() });
    await flush(8);
    expect(window.__matrizSeleccionada).toEqual(expect.objectContaining({ tipo: 'db', id: 5 }));
  });

  test('cambia a archivo, valida archivo faltante y acepta matriz DOCX', async () => {
    installDom();
    requireFresh('frontend/cuadernillos.js');

    document.getElementById('btnImportarMatriz').dispatchEvent(eventOf('click'));
    await flush(15);
    const modal = document.getElementById('modalImportarMatriz');
    modal.dispatchEvent(eventOf('shown.bs.modal'));
    await flush(5);

    document.getElementById('origenBD').checked = false;
    document.getElementById('origenArchivo').checked = true;
    document.getElementById('origenArchivo').dispatchEvent(eventOf('change'));

    const btn = document.getElementById('btnImportarOK');
    await btn.onclick({ preventDefault: jest.fn() });
    await flush(5);
    expect(window.EvaluniaDialog.alert).toHaveBeenCalled();

    const fileInput = document.getElementById('matrizFile');
    const file = new File(['docx'], 'matriz_importada.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });

    await btn.onclick({ preventDefault: jest.fn() });
    await flush(8);
    expect(window.__matrizSeleccionada).toEqual(expect.objectContaining({ tipo: 'docx', nombre: 'matriz_importada.docx' }));
  });
});

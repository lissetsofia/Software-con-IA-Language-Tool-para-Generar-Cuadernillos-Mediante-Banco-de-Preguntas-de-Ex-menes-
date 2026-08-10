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
    blob: jest.fn(() => Promise.resolve(new Blob(['docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))),
    arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(8)))
  });
}

function installDelegatedJQuery() {
  const dtApi = {
    clear: jest.fn(() => dtApi),
    draw: jest.fn(() => dtApi),
    destroy: jest.fn(() => dtApi),
    rows: { add: jest.fn(() => dtApi), data: jest.fn(() => []) },
    columns: { adjust: jest.fn(() => dtApi) },
    responsive: { recalc: jest.fn(() => dtApi) },
    search: jest.fn(() => dtApi),
    page: jest.fn(() => ({ draw: jest.fn(() => dtApi) }))
  };

  const resolve = (input) => {
    if (!input) return [];
    if (Array.isArray(input)) return input.filter(Boolean);
    if (input === window || input === document) return [input];
    if (input.nodeType) return [input];
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
    if (s.startsWith('keydown')) return 'keydown';
    return s.split('.')[0] || s;
  };

  const chainFor = (input) => {
    const elements = resolve(input);
    const chain = {
      length: elements.length,
      0: elements[0] || null,
      on: jest.fn(function (eventName, selector, cb) {
        if (typeof selector === 'function') {
          cb = selector;
          selector = null;
        }
        const domEvent = toDomEvent(eventName);
        elements.forEach((root) => {
          if (!root || typeof root.addEventListener !== 'function') return;
          root.addEventListener(domEvent, function (ev) {
            if (!selector) return cb && cb.call(root, ev);
            const hit = ev.target && ev.target.closest ? ev.target.closest(selector) : null;
            if (hit && (root === document || root === window || root.contains?.(hit) || root === hit)) {
              cb && cb.call(hit, ev);
            }
          });
        });
        return this;
      }),
      off: jest.fn(function () { return this; }),
      DataTable: jest.fn(function (config) {
        if (config && typeof config.initComplete === 'function') {
          config.initComplete.call({ api: () => dtApi });
        }
        return dtApi;
      }),
      dataTable: jest.fn(() => dtApi),
      closest: jest.fn((sel) => chainFor(elements[0]?.closest?.(sel) || null)),
      before: jest.fn(function (nodeOrChain) {
        const node = nodeOrChain && nodeOrChain.nodeType ? nodeOrChain : nodeOrChain && nodeOrChain[0];
        elements.forEach((el) => { if (node && el.parentNode) el.parentNode.insertBefore(node, el); });
        return this;
      }),
      remove: jest.fn(function () { elements.forEach((el) => el.remove?.()); return this; }),
      find: jest.fn((sel) => chainFor(elements.flatMap((el) => Array.from(el.querySelectorAll?.(sel) || [])))),
      addClass: jest.fn(function (cls) { elements.forEach((el) => el.classList?.add(...String(cls).split(/\s+/).filter(Boolean))); return this; }),
      removeClass: jest.fn(function (cls) { elements.forEach((el) => el.classList?.remove(...String(cls).split(/\s+/).filter(Boolean))); return this; }),
      html: jest.fn(function (val) { if (val === undefined) return elements[0]?.innerHTML || ''; elements.forEach((el) => { el.innerHTML = val; }); return this; }),
      text: jest.fn(function (val) { if (val === undefined) return elements.map((el) => el.textContent || '').join(''); elements.forEach((el) => { el.textContent = val; }); return this; }),
      val: jest.fn(function (val) { if (val === undefined) return elements[0]?.value || ''; elements.forEach((el) => { if ('value' in el) el.value = val; }); return this; })
    };
    return chain;
  };

  const $ = jest.fn((input) => {
    if (typeof input === 'function') {
      input();
      return chainFor(document);
    }
    return chainFor(input);
  });
  $.fn = chainFor(null);
  $.fn.DataTable = jest.fn(() => dtApi);
  $.fn.dataTable = {
    ext: { errMode: 'none' },
    isDataTable: jest.fn(() => false),
    tables: jest.fn(() => ({ columns: { adjust: jest.fn(() => ({ responsive: { recalc: jest.fn() } })) } }))
  };
  $.extend = Object.assign;
  global.$ = global.jQuery = window.$ = window.jQuery = $;
  return { $, dtApi };
}

function installDom() {
  const extra = `
    <main id="contenido">
      <button id="btnImportarMatriz" type="button">Importar matriz</button>
      <div id="modalMatriz" class="modal show">
        <button class="btn-close" type="button"></button>
        <input id="matriz-nombre" value="">
        <div id="totalCursosMatriz"></div>
        <div id="totalPreguntasMatriz"></div>
        <div id="matriz-generar-progress" class="d-none">
          <div id="matriz-generar-progress-bar"></div>
          <span id="matriz-generar-progress-label"></span>
          <span id="matriz-generar-progress-pct"></span>
        </div>
        <table><tbody id="tbody-matriz"></tbody></table>
        <button id="btn-add-fila" type="button">Agregar</button>
        <button id="btn-limpiar-filas" type="button">Limpiar</button>
        <button id="btn-generar-matriz" type="button">Generar matriz</button>
      </div>
      <div id="modalBancoPreguntasCuad" class="modal"></div>
      <div id="modalGrupos" class="modal"></div>
      <div id="modalGrupoForm" class="modal"></div>
      <div id="modalImportarMatriz" class="modal"></div>
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

  let uuid = 0;
  const cryptoMock = { randomUUID: jest.fn(() => `fila-${++uuid}`) };
  Object.defineProperty(global, 'crypto', { value: cryptoMock, configurable: true });
  Object.defineProperty(window, 'crypto', { value: cryptoMock, configurable: true });

  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true))
  };

  window.requestAnimationFrame = jest.fn((cb) => { if (typeof cb === 'function') cb(); return 1; });
  global.requestAnimationFrame = window.requestAnimationFrame;

  jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });
  window.setTimeout = global.setTimeout;
  jest.spyOn(global, 'setInterval').mockImplementation(() => 1);
  window.setInterval = global.setInterval;
  jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
  window.clearInterval = global.clearInterval;

  const fetchMock = jest.fn((url, opts = {}) => {
    const u = String(url);
    if (u.includes('/api/temas_cuad')) {
      return makeResponse([
        { id: 1, nombre: 'Álgebra', activo: true },
        { id: 2, nombre: 'Geometría', activo: true }
      ]);
    }
    if (u.endsWith('/api/matriz') && String(opts.method).toUpperCase() === 'POST') {
      return makeResponse({ ok: true, matriz_id: 77 });
    }
    if (u.includes('/api/matriz/77/upload')) return makeResponse({ ok: true });
    if (u.includes('/api/matriz/77/generar')) return makeResponse({ ok: true });
    return makeResponse({ ok: true });
  });
  global.fetch = window.fetch = fetchMock;

  window.localStorage.setItem('matriz_draft_v1', JSON.stringify({
    nombre: 'Matriz prueba',
    filas: [{ tema_id: 1, cantidad: 2 }]
  }));

  return { fetchMock };
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetModules();
});

describe('cuadernillos.js matriz rutas no cubiertas robustas', () => {
  test('abre matriz desde show.bs.modal, edita filas, valida duplicados y genera DOCX', async () => {
    const { fetchMock } = installDom();
    requireFresh('frontend/cuadernillos.js');

    const modal = document.getElementById('modalMatriz');
    modal.dispatchEvent(eventOf('show.bs.modal'));
    await flush(20);

    const tbody = document.getElementById('tbody-matriz');
    expect(tbody.querySelectorAll('tr').length).toBeGreaterThanOrEqual(1);

    const addBtn = document.getElementById('btn-add-fila');
    await addBtn.onclick();
    await flush(5);
    expect(tbody.querySelectorAll('tr').length).toBeGreaterThanOrEqual(2);

    const rows = tbody.querySelectorAll('tr');
    const duplicateSelect = rows[1].querySelector('.sel-tema');
    duplicateSelect.value = '1';
    duplicateSelect.dispatchEvent(eventOf('change'));
    await flush(8);

    rows[1].querySelector('.btn-quitar').dispatchEvent(eventOf('click'));
    await flush(5);

    const firstRow = tbody.querySelector('tr');
    const fileInput = firstRow.querySelector('.inp-file');
    const file = new File(['docx'], 'algebra.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.dispatchEvent(eventOf('change'));
    await flush(8);

    const genBtn = document.getElementById('btn-generar-matriz');
    await genBtn.onclick();
    await flush(30);

    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/matriz'))).toBe(true);
    expect(document.getElementById('matriz-generar-progress').classList.contains('d-none')).toBe(true);
  });

  test('limpiar filas, modal hidden y hide bloqueado cubren ramas de interfaz matriz', async () => {
    installDom();
    requireFresh('frontend/cuadernillos.js');

    const modal = document.getElementById('modalMatriz');
    modal.dispatchEvent(eventOf('show.bs.modal'));
    await flush(15);

    document.getElementById('btn-limpiar-filas').onclick();
    expect(document.getElementById('tbody-matriz').children.length).toBe(0);

    modal.setAttribute('data-matriz-generando', '1');
    const hideEv = eventOf('hide.bs.modal');
    jest.spyOn(hideEv, 'preventDefault');
    modal.dispatchEvent(hideEv);
    expect(hideEv.preventDefault).toHaveBeenCalled();

    modal.dispatchEvent(eventOf('hidden.bs.modal'));
    await flush(5);
    expect(modal.getAttribute('data-matriz-generando')).toBe(null);
  });
});

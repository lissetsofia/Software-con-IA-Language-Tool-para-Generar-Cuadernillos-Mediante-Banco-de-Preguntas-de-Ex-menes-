const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

const flush = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));

function eventOf(name) {
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  return ev;
}

function mapEventName(name) {
  const s = String(name || '').split(' ')[0];
  if (s.startsWith('shown.bs.modal')) return 'shown.bs.modal';
  if (s.startsWith('hidden.bs.modal')) return 'hidden.bs.modal';
  if (s.startsWith('click')) return 'click';
  if (s.startsWith('change')) return 'change';
  if (s.startsWith('keydown')) return 'keydown';
  return s.split('.')[0] || s;
}

function installDelegatedJQuery() {
  const makeApi = () => ({
    clear: jest.fn(() => makeApi()),
    destroy: jest.fn(() => makeApi()),
    columns: { adjust: jest.fn(() => makeApi()) },
    responsive: { recalc: jest.fn(() => makeApi()) },
  });
  const dt = jest.fn(() => makeApi());
  dt.isDataTable = jest.fn(() => false);

  function resolve(selector) {
    if (selector === document || selector === window) return [selector];
    if (selector && selector.nodeType) return [selector];
    if (Array.isArray(selector)) return selector;
    if (typeof selector === 'string') return Array.from(document.querySelectorAll(selector));
    return [];
  }

  const $ = jest.fn((selector) => {
    const elements = resolve(selector);
    const chain = {
      length: elements.length,
      0: elements[0] || null,
      DataTable: jest.fn(() => makeApi()),
      on: jest.fn(function (name, sel, cb) {
        if (typeof sel === 'function') { cb = sel; sel = null; }
        const nativeName = mapEventName(name);
        elements.forEach((root) => {
          root.addEventListener(nativeName, function (ev) {
            if (!sel) return cb.call(root, ev);
            const target = ev.target && ev.target.closest ? ev.target.closest(sel) : null;
            if (target && (root === document || root.contains(target) || root === target)) {
              cb.call(target, ev);
            }
          });
        });
        return this;
      }),
      off: jest.fn(function () { return this; }),
      closest: jest.fn(function (sel) { return $(elements[0] ? elements[0].closest(sel) : null); }),
      before: jest.fn(function () { return this; }),
      remove: jest.fn(function () { elements.forEach((el) => el.remove && el.remove()); return this; }),
      html: jest.fn(function (value) { if (value === undefined) return elements[0]?.innerHTML || ''; elements.forEach((el) => { el.innerHTML = value; }); return this; }),
      empty: jest.fn(function () { elements.forEach((el) => { el.innerHTML = ''; }); return this; }),
    };
    return chain;
  });
  $.fn = { DataTable: dt, dataTable: { ext: { errMode: 'none' }, isDataTable: jest.fn(() => false) } };
  $.fn.DataTable = dt;
  $.fn.dataTable = { ext: { errMode: 'none' }, isDataTable: jest.fn(() => false) };
  global.$ = window.$ = $;
  global.jQuery = window.jQuery = $;
}

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob(['zip'])),
    headers: { get: jest.fn(() => 'application/json') },
  });
}

function installDom() {
  const html = `
    <div id="contenido">
      <button id="btnTemasMatriz">Temas</button>
      <div id="modalMatriz" class="modal show"></div>
      <div id="modalTemas" class="modal show" data-ctx="" data-return-to="">
        <button id="btnAgregarTema">Agregar</button>
        <input id="chkVerInactivosTemas" type="checkbox" />
        <div id="temarioDtToolbarHost"></div>
        <table id="tabla-temas"><thead></thead><tbody>
          <tr>
            <td><button class="btn-editar-tema" data-id="5" data-nombre="Álgebra">Editar</button></td>
            <td><button class="btn-toggle-tema" data-id="5">Toggle</button></td>
          </tr>
        </tbody></table>
        <div id="panelTemaCuad" aria-hidden="true">
          <i id="panelTemaCuadIcon"></i>
          <h4 id="panelTemaCuadTitulo"></h4>
          <input id="temaIdCuad" />
          <input id="temaNombreCuad" />
          <button id="btnTemaCuadGuardar"><span class="btn-text">Guardar</span></button>
          <button id="btnTemaCuadCancelar">Cancelar</button>
        </div>
      </div>
    </div>
  `;
  createDomFromHtml('frontend/__tests__/empty.html', html);
  document.body.innerHTML = html;
  installDelegatedJQuery();

  window.EvaluniaDialog = { alert: jest.fn(() => Promise.resolve()), confirm: jest.fn(() => Promise.resolve(true)) };
  window.EvaluniaTemarioModal = {
    TOOLBAR_HOST_ID: 'temarioDtToolbarHost',
    lengthMenu: [8, 25, 50],
    dom: 'rtip',
    destroy: jest.fn(),
    rebuildThead: jest.fn(),
    columnDefsForMode: jest.fn(() => []),
    buildColumns: jest.fn(() => [
      { data: 'id' },
      { data: 'nombre' },
      { data: 'activo' },
      { data: null },
    ]),
    language: jest.fn(() => ({})),
    wireToolbar: jest.fn(),
  };
  global.requestAnimationFrame = (cb) => cb();
  window.requestAnimationFrame = global.requestAnimationFrame;
  global.console.group = jest.fn();
  global.console.groupEnd = jest.fn();

  const fetchMock = jest.fn((url, opts = {}) => {
    const u = String(url);
    const method = String(opts.method || 'GET').toUpperCase();
    if (u.includes('/api/temas') && method === 'GET') {
      return jsonResponse([{ id: 5, nombre: 'Álgebra', activo: 1, n_preguntas: 2 }]);
    }
    if (u.includes('/api/temas') && method === 'POST') return jsonResponse({ ok: true, id: 6 });
    if (u.includes('/api/temas/5/toggle')) return jsonResponse({ ok: true });
    if (u.includes('/api/temas/5') && method === 'PUT') return jsonResponse({ ok: true });
    return jsonResponse({ ok: true });
  });
  global.fetch = window.fetch = fetchMock;
  return fetchMock;
}

describe('cuadernillos.js modal temas CRUD delegado profundo', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('abre modal de temas, renderiza, crea, edita, togglea, cancela y retorna a matriz', async () => {
    const fetchMock = installDom();
    requireFresh('frontend/cuadernillos.js');

    document.getElementById('btnTemasMatriz').dispatchEvent(eventOf('click'));
    await flush();
    expect(document.getElementById('modalTemas').dataset.ctx).toBe('cuad');

    document.getElementById('modalTemas').dispatchEvent(eventOf('shown.bs.modal'));
    await flush();

    document.getElementById('chkVerInactivosTemas').checked = true;
    document.getElementById('chkVerInactivosTemas').dispatchEvent(eventOf('change'));
    await flush();

    document.getElementById('btnAgregarTema').dispatchEvent(eventOf('click'));
    await flush();
    document.getElementById('temaNombreCuad').value = 'Geometría';
    document.getElementById('btnTemaCuadGuardar').dispatchEvent(eventOf('click'));
    await flush(40);

    document.querySelector('.btn-editar-tema').dispatchEvent(eventOf('click'));
    await flush();
    document.getElementById('temaNombreCuad').value = 'Álgebra actualizada';
    document.getElementById('btnTemaCuadGuardar').dispatchEvent(eventOf('click'));
    await flush(40);

    document.querySelector('.btn-toggle-tema').dispatchEvent(eventOf('click'));
    await flush(40);

    document.getElementById('btnAgregarTema').dispatchEvent(eventOf('click'));
    await flush();
    document.dispatchEvent(Object.assign(eventOf('keydown'), { key: 'Escape' }));
    document.getElementById('btnTemaCuadCancelar').dispatchEvent(eventOf('click'));
    document.getElementById('modalTemas').dispatchEvent(eventOf('hidden.bs.modal'));
    await flush();

    expect(fetchMock).toHaveBeenCalled();
    expect(window.EvaluniaDialog.confirm).toHaveBeenCalled();
    expect(bootstrap.Modal.getOrCreateInstance).toHaveBeenCalled();
  });
});

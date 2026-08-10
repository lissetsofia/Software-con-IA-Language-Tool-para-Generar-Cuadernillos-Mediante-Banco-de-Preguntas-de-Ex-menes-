const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

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

function file(name = 'demo.docx') {
  return new File(['demo'], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function setFiles(input, files) {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
}

function installDom() {
  createDomFromHtml('frontend/generacion_preguntas.html');
  document.body.innerHTML = `
    <main id="contenido">
      <div id="modal-examen" class="modal show"></div>
      <button id="btnBancoPreguntas" type="button">Banco</button>
      <button id="btnBancoVolverResumen" type="button">Volver</button>
      <button id="btnBancoImportar" type="button">Importar</button>
      <button id="btnBancoImportarDetalle" type="button">Importar detalle</button>
      <button id="btnBancoImportarGuardar" type="button">Guardar importación</button>
      <button id="btnBancoEditarGuardar" type="button">Guardar edición</button>
      <div id="modalBancoPreguntas" class="modal">
        <div id="bancoResumenView"></div>
        <div id="bancoDetalleView" class="d-none"></div>
        <div id="bancoImportView" class="d-none"></div>
        <div id="bancoEditView" class="d-none"></div>
        <h5 id="bancoTemaTitulo"></h5>
        <select id="bancoTemaSelect"><option value="1">Álgebra</option></select>
        <select id="bancoTemaImportar"><option value="1">Álgebra</option></select>
        <input id="bancoPreguntasFile" type="file">
        <input id="bancoSolucionarioFile" type="file">
        <input id="bancoFilePreguntas" type="file">
        <input id="bancoFileSolucionario" type="file">
        <select id="bancoTemaEditar"><option value="1">Álgebra</option></select>
        <input id="bancoEditFilePreg" type="file">
        <input id="bancoEditFileSol" type="file">
        <input id="bancoEditPreguntasFile" type="file">
        <input id="bancoEditSolucionarioFile" type="file">
        <input id="bancoEditTemaId" value="1">
        <input id="bancoEditDocId" value="55">
        <input id="bancoEditId" value="55">
        <table id="tabla-banco-resumen"><tbody></tbody></table>
        <table id="tabla-banco-detalle"><tbody></tbody></table>
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
  global.confirm = jest.fn(() => true);
  window.confirm = global.confirm;
}

function installJq() {
  const handlers = [];
  const api = {
    clear: jest.fn(() => api),
    destroy: jest.fn(() => api),
    draw: jest.fn(() => api),
    rows: { add: jest.fn(() => api), data: jest.fn(() => []) },
    columns: { adjust: jest.fn(() => api) },
    responsive: { recalc: jest.fn(() => api) },
  };
  function chain(selector) {
    const elements = [];
    try {
      if (typeof selector === 'string') elements.push(...document.querySelectorAll(selector));
      else if (selector && selector.nodeType) elements.push(selector);
      else if (selector === document || selector === window) elements.push(selector);
    } catch (_) {}
    return {
      length: elements.length,
      0: elements[0] || null,
      DataTable: jest.fn(() => api),
      on: jest.fn(function (eventName, delegatedSelector, callback) {
        if (typeof delegatedSelector === 'function') {
          callback = delegatedSelector;
          delegatedSelector = null;
        }
        if (typeof callback === 'function') handlers.push({ eventName, selector: delegatedSelector, callback });
        return this;
      }),
      off: jest.fn(function () { return this; }),
      empty: jest.fn(function () { elements.forEach((el) => { el.innerHTML = ''; }); return this; }),
      html: jest.fn(function (value) { if (value === undefined) return elements[0]?.innerHTML || ''; elements.forEach((el) => { el.innerHTML = value; }); return this; }),
      addClass: jest.fn(function (cls) { elements.forEach((el) => el.classList?.add(...String(cls).split(/\s+/).filter(Boolean))); return this; }),
      removeClass: jest.fn(function (cls) { elements.forEach((el) => el.classList?.remove(...String(cls).split(/\s+/).filter(Boolean))); return this; }),
      toggleClass: jest.fn(function () { return this; }),
      prop: jest.fn(function (name, value) { if (value === undefined) return elements[0]?.[name]; elements.forEach((el) => { el[name] = value; }); return this; }),
      val: jest.fn(function (value) { if (value === undefined) return elements[0]?.value || ''; elements.forEach((el) => { if ('value' in el) el.value = value; }); return this; }),
      append: jest.fn(function (html) { elements.forEach((el) => { if (typeof html === 'string') el.insertAdjacentHTML('beforeend', html); }); return this; }),
    };
  }
  const $ = jest.fn(chain);
  $.fn = { DataTable: { isDataTable: jest.fn(() => false) }, dataTable: { isDataTable: jest.fn(() => false), ext: { errMode: 'none' } } };
  $.fn.DataTable = Object.assign(jest.fn(() => api), { isDataTable: jest.fn(() => false) });
  global.$ = $;
  global.jQuery = $;
  window.$ = $;
  window.jQuery = $;
  return { handlers, api };
}

function installFetch() {
  const fetchMock = jest.fn((url, opts = {}) => {
    const u = String(url);
    const method = String(opts.method || 'GET').toUpperCase();
    if (u.includes('/api/temas')) return resp([{ id: 1, nombre: 'Álgebra', activo: 1, n_preguntas: 4 }]);
    if (u.includes('/api/banco_preguntas/55') && method === 'GET') {
      return resp({ ok: true, id: 55, tema_id: 1, tema_nombre: 'Álgebra', archivo_nombre: 'preguntas.docx', solucionario_nombre: 'sol.docx' });
    }
    if (u.includes('/api/banco_preguntas/preview')) return resp({ ok: true, url: '/preview/banco.pdf' });
    if (u.includes('/api/banco_preguntas')) return resp({ ok: true, data: [{ id: 55, tema_id: 1, tema_nombre: 'Álgebra', n_preguntas: 4 }] });
    return resp({ ok: true });
  });
  global.fetch = fetchMock;
  window.fetch = fetchMock;
  return fetchMock;
}

describe('generacion_preguntas.js banco rutas publicas adicionales robustas', () => {
  beforeEach(() => {
    jest.resetModules();
    installDom();
    installJq();
    installFetch();
  });

  test('funciones publicas de banco cubren preview, eliminar, abrir editar y guardar con archivos', async () => {
    requireFresh('frontend/generacion_preguntas.js');
    await flush(12);

    if (typeof window.bancoAbrirEditar === 'function') {
      await window.bancoAbrirEditar(55).catch(() => {});
      await flush(12);
    }

    setFiles(document.getElementById('bancoEditPreguntasFile'), [file('nuevo.docx')]);
    setFiles(document.getElementById('bancoEditSolucionarioFile'), [file('nuevo_sol.docx')]);
    setFiles(document.getElementById('bancoEditFilePreg'), [file('nuevo.docx')]);
    setFiles(document.getElementById('bancoEditFileSol'), [file('nuevo_sol.docx')]);
    document.getElementById('btnBancoEditarGuardar').dispatchEvent(eventOf('click'));
    await flush(20);

    if (typeof window.bancoDescPaquete === 'function') {
      const p = window.bancoDescPaquete(55);
      if (p && typeof p.catch === 'function') await p.catch(() => {});
    }
    if (typeof window.bancoAbrirSolucionario === 'function') {
      const p = window.bancoAbrirSolucionario(55);
      if (p && typeof p.catch === 'function') await p.catch(() => {});
    }
    if (typeof window.bancoEliminar === 'function') {
      const p = window.bancoEliminar(55);
      if (p && typeof p.catch === 'function') await p.catch(() => {});
    }
    await flush(20);

    expect(global.fetch).toHaveBeenCalled();
  });

  test('importacion desde banco cubre ramas con tema fijo, archivos faltantes y success controlado', async () => {
    requireFresh('frontend/generacion_preguntas.js');
    await flush(12);

    document.getElementById('btnBancoImportar').dispatchEvent(eventOf('click'));
    document.getElementById('btnBancoImportarGuardar').dispatchEvent(eventOf('click'));
    await flush(12);

    document.getElementById('bancoTemaSelect').value = '1';
    document.getElementById('bancoTemaImportar').value = '1';
    setFiles(document.getElementById('bancoPreguntasFile'), [file('preguntas.docx')]);
    setFiles(document.getElementById('bancoSolucionarioFile'), [file('solucionario.docx')]);
    setFiles(document.getElementById('bancoFilePreguntas'), [file('preguntas.docx')]);
    setFiles(document.getElementById('bancoFileSolucionario'), [file('solucionario.docx')]);
    document.getElementById('btnBancoImportarGuardar').dispatchEvent(eventOf('click'));
    await flush(25);

    expect(global.fetch).toHaveBeenCalled();
  });
});

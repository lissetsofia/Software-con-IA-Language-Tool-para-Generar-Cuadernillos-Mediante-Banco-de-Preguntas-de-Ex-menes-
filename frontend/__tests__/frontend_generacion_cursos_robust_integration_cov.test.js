const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(type = 'click') {
  const event = document.createEvent('Event');
  event.initEvent(type, true, true);
  return event;
}

async function flush(times = 20) {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

function response(body = {}, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERROR',
    headers: { get: jest.fn(() => 'application/json') },
    json: jest.fn(() => Promise.resolve(body)),
    text: jest.fn(() => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))),
    blob: jest.fn(() => Promise.resolve(new Blob(['demo'])))
  });
}

function mountCursosDom() {
  document.body.innerHTML = `
    <button type="button" class="btn-buscar" data-id="31"><span>Cursos</span></button>
    <div id="modalBuscar" class="modal show" data-gen-cursos-vista="lista">
      <button type="button" class="gen-cursos-header-close">Cerrar</button>
      <i id="genCursosHeaderIcon"></i>
      <h2 id="genCursosTituloTexto"></h2>

      <section id="gen-cursos-vista-lista" class="gen-cursos-view gen-cursos-view--active">
        <table id="tabla-buscar-temas"><tbody></tbody></table>
      </section>
      <section id="gen-cursos-vista-detalle" class="gen-cursos-view">
        <table id="tabla-preguntas-tema"><tbody></tbody></table>
      </section>
      <section id="gen-cursos-vista-progreso" class="gen-cursos-view">
        <div id="gen-cursos-progreso-overlay">
          <div id="gen-cursos-progreso-bar" class="progress-bar"></div>
          <span id="gen-cursos-progreso-label"></span>
          <span id="gen-cursos-progreso-pct"></span>
        </div>
      </section>
      <footer id="gen-cursos-footer-detalle" class="d-none">
        <button type="button" id="btnGenCursosVolver">Volver</button>
      </footer>
    </div>

    <div id="modal-examen" class="modal">
      <div id="gen-examen-visor-idle">
        <div class="gen-examen-visor-idle-hero">
          <span id="gen-examen-visor-idle-hero-badge" class="d-none">
            <i id="gen-examen-visor-idle-hero-badge-ic"></i>
          </span>
        </div>
      </div>
      <div id="gen-examen-seleccion-hint" class="d-none"></div>
      <div id="visor-examen"><div id="pdf-host"></div></div>
    </div>
  `;
}

function installJQueryWithHandlers() {
  const base$ = window.$;
  const handlers = [];
  const configs = [];
  const activeTables = new WeakSet();
  const apis = new WeakMap();

  function makeApi(table, config = {}) {
    const api = {
      clear: jest.fn(() => api),
      destroy: jest.fn(() => api),
      draw: jest.fn(() => api),
      columns: { adjust: jest.fn(() => api) },
      responsive: { recalc: jest.fn(() => api) }
    };
    api.rows = { add: jest.fn(() => api) };
    api.table = jest.fn(() => ({ container: () => table }));
    api.api = jest.fn(() => api);
    activeTables.add(table);
    apis.set(table, api);
    if (config && Object.keys(config).length) configs.push({ table, config, api });
    return api;
  }

  function normalize(selector) {
    if (selector === document || selector === window || selector?.nodeType) return selector;
    if (typeof selector === 'string') return document.querySelector(selector);
    return null;
  }

  function patched$(selector) {
    const chain = base$(selector);
    const table = normalize(selector);
    chain.off = jest.fn(function () { return this; });
    chain.on = jest.fn(function (eventName, delegatedSelector, callback) {
      let cb = callback;
      let delegated = delegatedSelector;
      if (typeof delegatedSelector === 'function') {
        cb = delegatedSelector;
        delegated = null;
      }
      if (typeof cb === 'function') handlers.push({ eventName, selector: delegated, callback: cb });
      return this;
    });
    chain.DataTable = jest.fn((config) => {
      if (table && apis.has(table) && !config) return apis.get(table);
      return makeApi(table || document.createElement('table'), config || {});
    });
    return chain;
  }

  Object.assign(patched$, base$);
  patched$.fn = base$.fn;
  patched$.fn.DataTable = patched$.fn.DataTable || jest.fn();
  patched$.fn.DataTable.isDataTable = jest.fn((target) => {
    const table = normalize(target);
    return !!table && activeTables.has(table);
  });
  patched$.fn.dataTable = patched$.fn.dataTable || {};
  patched$.fn.dataTable.ext = patched$.fn.dataTable.ext || { errMode: 'none' };
  patched$.fn.dataTable.isDataTable = patched$.fn.DataTable.isDataTable;
  patched$.fn.dataTable.tables = jest.fn(() => ({
    columns: { adjust: jest.fn(() => ({ responsive: { recalc: jest.fn() } })) }
  }));

  global.$ = patched$;
  global.jQuery = patched$;
  window.$ = patched$;
  window.jQuery = patched$;

  return { handlers, configs, activeTables, apis };
}

function makeEventSource(mode = 'done', payloadOverride = null) {
  return class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      this.close = jest.fn();
      Promise.resolve().then(() => {
        if (mode === 'unavailable') {
          if (typeof this.onerror === 'function') this.onerror(new Error('SSE no disponible'));
          return;
        }
        const payload = payloadOverride || (
          mode === 'error'
            ? { status: 'error', done: 1, total: 1, message: 'Documento inválido' }
            : { status: 'done', done: 4, total: 4, message: 'done' }
        );
        const event = { data: JSON.stringify(payload) };
        if (typeof this.onmessage === 'function') this.onmessage(event);
        (this.listeners.progress || []).forEach((callback) => callback(event));
      });
    }

    addEventListener(type, callback) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(callback);
    }
  };
}

function setup(fetchMock, eventSourceMode = 'done', payloadOverride = null) {
  createDomFromHtml('frontend/__tests__/blank.html');
  mountCursosDom();
  const jquery = installJQueryWithHandlers();

  const modalInstance = { show: jest.fn(), hide: jest.fn(), dispose: jest.fn() };
  const Modal = jest.fn(() => modalInstance);
  Modal.getInstance = jest.fn(() => modalInstance);
  Modal.getOrCreateInstance = jest.fn(() => modalInstance);
  global.bootstrap = { Modal };
  window.bootstrap = global.bootstrap;

  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true)),
    choose: jest.fn(() => Promise.resolve(null))
  };
  global.fetch = fetchMock;
  window.fetch = fetchMock;

  global.EventSource = makeEventSource(eventSourceMode, payloadOverride);
  window.EventSource = global.EventSource;

  const raf = jest.fn((callback) => {
    if (typeof callback === 'function') callback();
    return 1;
  });
  global.requestAnimationFrame = raf;
  window.requestAnimationFrame = raf;

  jest.spyOn(global, 'setTimeout').mockImplementation((callback, delay = 0) => {
    if (Number(delay) < 10000 && typeof callback === 'function') Promise.resolve().then(callback);
    return 1;
  });
  jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});
  window.setTimeout = global.setTimeout;
  window.clearTimeout = global.clearTimeout;

  requireFresh('frontend/generacion_preguntas.js');
  return { ...jquery, modalInstance };
}

function findHandler(handlers, selector, eventName = 'click') {
  return handlers.find((handler) =>
    handler.selector === selector && String(handler.eventName).split('.')[0] === eventName
  )?.callback;
}

function successfulFetch() {
  return jest.fn((url, options = {}) => {
    const target = String(url);
    if (target.includes('/partir_y_guardar_async')) {
      return response({ ok: true, job_id: 'job-31' });
    }
    if (target.includes('/api/examenes/31/temas')) {
      return response([{ id: 5, nombre: 'Álgebra <A> & "B"', n_preguntas: 12 }]);
    }
    if (target.includes('/api/preguntas?examen=31&tema=5')) {
      return response([{
        numero_p: 1,
        archivo_nombre: 'pregunta 1.docx',
        archivo_ruta: 'C:\\Banco\\pregunta 1.docx'
      }]);
    }
    return response({ ok: true, method: options.method });
  });
}

describe('generacion_preguntas.js procesamiento robusto de cursos', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('procesa cursos por SSE, carga temas y abre el detalle de preguntas', async () => {
    const fetchMock = successfulFetch();
    const { handlers, configs, modalInstance, apis } = setup(fetchMock);
    const searchButton = document.querySelector('.btn-buscar');
    const searchHandler = findHandler(handlers, '.btn-buscar');

    await searchHandler.call(searchButton, eventOf('click'));
    await flush(30);

    const startCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/partir_y_guardar_async'));
    expect(startCall[1]).toEqual({ method: 'POST' });
    expect(modalInstance.show).toHaveBeenCalled();
    expect(document.getElementById('gen-cursos-progreso-bar').style.width).toBe('100%');
    expect(document.getElementById('gen-cursos-progreso-pct').textContent).toBe('100%');
    expect(document.getElementById('modalBuscar').dataset.genCursosProcesando).toBe('0');
    expect(searchButton.dataset.loading).toBe('0');
    expect(searchButton.disabled).toBe(false);
    expect(searchButton.innerHTML).toContain('Cursos');

    const temasConfigEntry = configs.find(({ table }) => table.id === 'tabla-buscar-temas');
    expect(temasConfigEntry.config.data).toHaveLength(1);
    const detailButtonHtml = temasConfigEntry.config.columns[3].render(temasConfigEntry.config.data[0]);
    expect(detailButtonHtml).toContain('data-tema="5"');
    expect(detailButtonHtml).toContain('Álgebra &lt;A> &amp; &quot;B&quot;');

    const detailHandler = findHandler(handlers, '.btn-ver-tema');
    const detailButton = document.createElement('button');
    detailButton.dataset.tema = '5';
    detailButton.dataset.nombre = 'Álgebra';
    await detailHandler.call(detailButton, eventOf('click'));

    expect(document.getElementById('genCursosTituloTexto').textContent).toBe('Preguntas — Álgebra');
    expect(document.getElementById('gen-cursos-vista-detalle').classList.contains('gen-cursos-view--active')).toBe(true);
    const questionsEntry = configs.find(({ table }) => table.id === 'tabla-preguntas-tema');
    expect(questionsEntry.config.data).toHaveLength(1);
    expect(questionsEntry.config.columns[2].render(questionsEntry.config.data[0])).toContain(
      'file:///C:/Banco/pregunta%201.docx'
    );

    await detailHandler.call(detailButton, eventOf('click'));
    expect(apis.get(document.getElementById('tabla-preguntas-tema')).clear).toHaveBeenCalled();
    expect(apis.get(document.getElementById('tabla-preguntas-tema')).rows.add).toHaveBeenCalled();
  });

  test('el botón de cabecera vuelve al listado, respeta el bloqueo y luego cierra', async () => {
    const fetchMock = successfulFetch();
    const { handlers, modalInstance } = setup(fetchMock);
    const searchHandler = findHandler(handlers, '.btn-buscar');
    await searchHandler.call(document.querySelector('.btn-buscar'), eventOf('click'));

    const modal = document.getElementById('modalBuscar');
    const closeButton = document.querySelector('.gen-cursos-header-close');
    modal.dataset.genCursosVista = 'detalle';
    document.getElementById('gen-cursos-vista-detalle').classList.add('gen-cursos-view--active');
    closeButton.dispatchEvent(eventOf('click'));
    expect(modal.dataset.genCursosVista).toBe('lista');

    modal.dataset.genCursosVista = 'detalle';
    modal.dataset.genCursosProcesando = '1';
    closeButton.dispatchEvent(eventOf('click'));
    expect(modal.dataset.genCursosVista).toBe('detalle');

    modal.dataset.genCursosProcesando = '0';
    modal.dataset.genCursosVista = 'lista';
    closeButton.dispatchEvent(eventOf('click'));
    expect(modalInstance.hide).toHaveBeenCalled();
  });

  test.each([
    ['abc', false],
    ['0', false],
    ['31', true]
  ])('valida el id y el guard anti doble clic (%s)', async (id, loading) => {
    const fetchMock = jest.fn(() => response({ ok: true }));
    const { handlers } = setup(fetchMock);
    const handler = findHandler(handlers, '.btn-buscar');
    const button = document.querySelector('.btn-buscar');
    button.dataset.id = id;
    if (loading) button.dataset.loading = '1';

    await handler.call(button, eventOf('click'));

    expect(fetchMock).not.toHaveBeenCalled();
    if (loading) {
      expect(window.EvaluniaDialog.alert).not.toHaveBeenCalled();
    } else {
      expect(window.EvaluniaDialog.alert).toHaveBeenCalledWith('ID de examen inválido', {});
    }
  });

  test('muestra el error de inicio y restaura el botón para reintentar', async () => {
    const fetchMock = jest.fn((url) => {
      if (String(url).includes('/partir_y_guardar_async')) {
        return response({ ok: false, error: 'No se pudo iniciar el trabajo' }, false, 503);
      }
      return response({ ok: true });
    });
    const { handlers } = setup(fetchMock);
    const button = document.querySelector('.btn-buscar');

    await findHandler(handlers, '.btn-buscar').call(button, eventOf('click'));

    expect(window.EvaluniaDialog.alert).toHaveBeenCalledWith('No se pudo iniciar el trabajo', {});
    expect(button.disabled).toBe(false);
    expect(button.dataset.loading).toBe('0');
    expect(document.getElementById('modalBuscar').dataset.genCursosProcesando).toBe('0');
  });

  test('propaga un trabajo SSE en estado error sin intentar cargar temas', async () => {
    const fetchMock = jest.fn((url) => {
      if (String(url).includes('/partir_y_guardar_async')) {
        return response({ ok: true, job_id: 'job-error' });
      }
      if (String(url).includes('/api/examenes/31/temas')) {
        return response([{ id: 1, nombre: 'No debe cargarse' }]);
      }
      return response({ ok: true });
    });
    const { handlers } = setup(fetchMock, 'error');

    await findHandler(handlers, '.btn-buscar').call(
      document.querySelector('.btn-buscar'),
      eventOf('click')
    );

    expect(window.EvaluniaDialog.alert).toHaveBeenCalledWith('Documento inválido', {});
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/examenes/31/temas'))).toBe(false);
  });

  test('si SSE no está disponible continúa mediante polling y finaliza', async () => {
    let statusCalls = 0;
    const fetchMock = jest.fn((url) => {
      const target = String(url);
      if (target.includes('/partir_y_guardar_async')) {
        return response({ ok: true, job_id: 'job-poll' });
      }
      if (target.includes('/jobs/job-poll')) {
        statusCalls += 1;
        return response({ status: 'done', done: 3, total: 3, message: 'done' });
      }
      if (target.includes('/api/examenes/31/temas')) {
        return response([{ id: 9, nombre: 'Historia', n_preguntas: 4 }]);
      }
      return response({ ok: true });
    });
    const { handlers, configs } = setup(fetchMock, 'unavailable');

    await findHandler(handlers, '.btn-buscar').call(
      document.querySelector('.btn-buscar'),
      eventOf('click')
    );

    expect(statusCalls).toBe(1);
    expect(configs.find(({ table }) => table.id === 'tabla-buscar-temas').config.data).toEqual([
      { id: 9, nombre: 'Historia', n_preguntas: 4 }
    ]);
    expect(window.EvaluniaDialog.alert).not.toHaveBeenCalled();
  });

  test('controla fallos al cargar preguntas y la ausencia de su tabla', async () => {
    const fetchMock = successfulFetch();
    const { handlers } = setup(fetchMock);
    const searchHandler = findHandler(handlers, '.btn-buscar');
    await searchHandler.call(document.querySelector('.btn-buscar'), eventOf('click'));

    const detailHandler = findHandler(handlers, '.btn-ver-tema');
    const detailButton = document.createElement('button');
    detailButton.dataset.tema = '5';
    detailButton.dataset.nombre = 'Álgebra';
    document.getElementById('tabla-preguntas-tema').remove();

    await detailHandler.call(detailButton, eventOf('click'));

    expect(window.EvaluniaDialog.alert).toHaveBeenCalledWith('No se pudieron cargar las preguntas.', {});
    expect(console.error).toHaveBeenCalledWith(expect.objectContaining({
      message: 'No se encontró la tabla de preguntas.'
    }));
  });
});

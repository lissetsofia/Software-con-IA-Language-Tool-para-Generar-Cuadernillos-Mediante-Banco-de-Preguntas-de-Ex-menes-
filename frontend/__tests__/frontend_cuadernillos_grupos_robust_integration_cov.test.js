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
    blob: jest.fn(() => Promise.resolve(new Blob(['zip'], { type: 'application/zip' })))
  });
}

function mountGruposDom() {
  document.body.innerHTML = `
    <main id="contenido">
      <div id="modalGrupos" class="modal show">
        <button type="button" class="btn-close">Cerrar</button>
        <button type="button" id="btnGenerarGrupos">Descargar grupos</button>
        <button type="button" id="btnNuevoGrupo">Nuevo grupo</button>
        <div id="grupos-generar-progress" class="d-none">
          <div id="grupos-generar-progress-bar" class="progress-bar"></div>
          <span id="grupos-generar-progress-label"></span>
          <span id="grupos-generar-progress-pct"></span>
        </div>
        <table id="tablaGrupos"><tbody></tbody></table>
      </div>

      <div id="modalGrupoForm" class="modal">
        <div class="modal-header">
          <i id="tituloGrupoIcon"></i>
          <h2 id="tituloGrupo"></h2>
        </div>
        <form id="formGrupo">
          <input id="grupo-id" />
          <input id="grupo-clave" />
          <input id="grupo-nombre" />
          <div id="cuotasWrap"></div>
          <output id="totalCuotas">0</output>
          <button type="button" id="btnAddCuota">Añadir cuota</button>
          <button type="submit" id="btnGuardarGrupo">Guardar</button>
        </form>
      </div>

      <div id="modalMatriz" class="modal"></div>
      <div id="modalImportarMatriz" class="modal"></div>
      <div id="modalAleatorizacion" class="modal"></div>
      <div id="modalTipoPrueba" class="modal"></div>
      <div id="modalTiposTema" class="modal"></div>
      <div id="modalBancoPreguntasCuad" class="modal"></div>
    </main>
  `;
}

function patchJQueryAndCaptureSubmit() {
  const base$ = window.$;
  let submitHandler = null;

  function patched$(selector) {
    const chain = base$(selector);
    chain.off = jest.fn(function () { return this; });
    chain.on = jest.fn(function (eventName, delegatedSelector, callback) {
      if (eventName === 'submit.cuadGrupoForm') {
        submitHandler = callback;
      }
      return this;
    });
    return chain;
  }

  Object.assign(patched$, base$);
  patched$.fn = base$.fn;
  patched$.fn.dataTable = patched$.fn.dataTable || { ext: { errMode: 'none' } };
  patched$.fn.dataTable.ext = patched$.fn.dataTable.ext || { errMode: 'none' };
  patched$.fn.dataTable.tables = jest.fn(() => ({
    columns: { adjust: jest.fn(() => ({ responsive: { recalc: jest.fn() } })) }
  }));

  global.$ = patched$;
  global.jQuery = patched$;
  window.$ = patched$;
  window.jQuery = patched$;

  return { getSubmitHandler: () => submitHandler };
}

function setup(fetchMock) {
  createDomFromHtml('frontend/__tests__/blank.html');
  mountGruposDom();
  const jqueryCapture = patchJQueryAndCaptureSubmit();

  const modalInstance = { show: jest.fn(), hide: jest.fn(), dispose: jest.fn() };
  const Modal = jest.fn(() => modalInstance);
  Modal.getInstance = jest.fn(() => modalInstance);
  Modal.getOrCreateInstance = jest.fn(() => modalInstance);
  global.bootstrap = { Modal };
  window.bootstrap = global.bootstrap;

  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true))
  };
  global.fetch = fetchMock;
  window.fetch = fetchMock;

  const requestAnimationFrameMock = jest.fn((callback) => {
    if (typeof callback === 'function') callback();
    return 1;
  });
  global.requestAnimationFrame = requestAnimationFrameMock;
  window.requestAnimationFrame = requestAnimationFrameMock;

  jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
    if (typeof callback === 'function') callback();
    return 1;
  });
  jest.spyOn(global, 'setInterval').mockImplementation(() => 1);
  jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
  window.setTimeout = global.setTimeout;
  window.setInterval = global.setInterval;
  window.clearInterval = global.clearInterval;

  const downloaded = [];
  jest.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    downloaded.push({ href: this.href, download: this.download });
  });

  requireFresh('frontend/cuadernillos.js');
  return { jqueryCapture, modalInstance, downloaded };
}

function defaultGruposFetch(overrides = {}) {
  return jest.fn((url, options = {}) => {
    const target = String(url);
    const method = String(options.method || 'GET').toUpperCase();

    if (overrides.route) {
      const routed = overrides.route(target, method, options);
      if (routed) return routed;
    }
    if (target.includes('/api/grupos?all=1')) {
      return response([
        { idgrupo: 7, clave: 'A', nombre: 'Grupo A', total_preguntas: 10 },
        { idgrupo: 8, clave: 'B', nombre: 'Grupo B', total_preguntas: 20 }
      ]);
    }
    if (target.endsWith('/api/temas')) {
      return response([
        { id: 1, nombre: 'Álgebra', activo: true },
        { id: 2, nombre: 'Comunicación', activo: true },
        { id: 3, nombre: 'Inactivo', activo: false }
      ]);
    }
    if (target.includes('/api/grupos/7/cuotas') && method === 'GET') {
      return response([{ tema_id: 1, cantidad: 6 }]);
    }
    return response({ ok: true });
  });
}

describe('cuadernillos.js integración robusta de grupos', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renderiza grupos y abre el editor con cuotas persistidas', async () => {
    const fetchMock = defaultGruposFetch();
    const { modalInstance } = setup(fetchMock);

    document.getElementById('modalGrupos').dispatchEvent(eventOf('shown.bs.modal'));
    await flush();

    const rows = [...document.querySelectorAll('#tablaGrupos tbody tr[data-id]')];
    expect(rows).toHaveLength(2);
    expect(rows[0].children[1].textContent).toBe('A');
    expect(rows[1].children[3].textContent).toBe('20');

    rows[0].querySelector('.btn-edit').dispatchEvent(eventOf('click'));
    await flush(30);

    expect(document.getElementById('grupo-id').value).toBe('7');
    expect(document.getElementById('grupo-clave').value).toBe('A');
    expect(document.getElementById('grupo-nombre').value).toBe('Grupo A');
    expect(document.querySelectorAll('#cuotasWrap .cuota-row')).toHaveLength(1);
    expect(document.querySelector('#cuotasWrap .sel-tema').value).toBe('1');
    expect(document.querySelector('#cuotasWrap .inp-cant').value).toBe('6');
    expect(document.getElementById('totalCuotas').textContent).toBe('6');
    expect(modalInstance.show).toHaveBeenCalled();
  });

  test('editor impide temas repetidos y mantiene el total al agregar y quitar cuotas', async () => {
    const fetchMock = defaultGruposFetch();
    setup(fetchMock);

    document.getElementById('btnNuevoGrupo').dispatchEvent(eventOf('click'));
    await flush(30);

    document.getElementById('btnAddCuota').dispatchEvent(eventOf('click'));
    const rows = [...document.querySelectorAll('#cuotasWrap .cuota-row')];
    expect(rows).toHaveLength(2);

    rows[0].querySelector('.sel-tema').value = '1';
    rows[0].querySelector('.inp-cant').value = '4';
    rows[1].querySelector('.sel-tema').value = '1';
    rows[1].querySelector('.sel-tema').dispatchEvent(eventOf('change'));
    await flush();

    expect(window.EvaluniaDialog.alert).toHaveBeenCalledWith('No repitas el mismo tema.', {});
    expect(rows[1].querySelector('.sel-tema').value).toBe('');

    rows[1].querySelector('.btnQuitarCuota').dispatchEvent(eventOf('click'));
    expect(document.querySelectorAll('#cuotasWrap .cuota-row')).toHaveLength(1);
    expect(document.getElementById('totalCuotas').textContent).toBe('4');
  });

  test('crea un grupo, guarda cuotas ordenadas y restaura el formulario', async () => {
    const fetchMock = defaultGruposFetch({
      route: (target, method) => {
        if (target.endsWith('/api/grupos') && method === 'POST') return response({ idgrupo: 15 });
        if (target.endsWith('/api/grupos/15/cuotas') && method === 'PUT') return response({ ok: true });
        return null;
      }
    });
    const { jqueryCapture, modalInstance } = setup(fetchMock);

    document.getElementById('btnNuevoGrupo').dispatchEvent(eventOf('click'));
    await flush(30);
    document.getElementById('grupo-clave').value = ' c ';
    document.getElementById('grupo-nombre').value = ' Grupo Ciencias ';
    document.querySelector('#cuotasWrap .sel-tema').value = '2';
    document.querySelector('#cuotasWrap .inp-cant').value = '8';

    const submitHandler = jqueryCapture.getSubmitHandler();
    expect(typeof submitHandler).toBe('function');
    await submitHandler.call(document.getElementById('formGrupo'), eventOf('submit'));
    await flush(30);

    const createCall = fetchMock.mock.calls.find(([url, options]) =>
      String(url).endsWith('/api/grupos') && options?.method === 'POST'
    );
    expect(JSON.parse(createCall[1].body)).toEqual({ clave: 'C', nombre: 'Grupo Ciencias' });

    const cuotasCall = fetchMock.mock.calls.find(([url, options]) =>
      String(url).endsWith('/api/grupos/15/cuotas') && options?.method === 'PUT'
    );
    expect(JSON.parse(cuotasCall[1].body)).toEqual({
      cuotas: [{ tema_id: 2, cantidad: 8, orden: 1 }]
    });
    expect(modalInstance.hide).toHaveBeenCalled();
    expect(document.getElementById('formGrupo').dataset.saving).toBe('0');
    expect(document.getElementById('btnGuardarGrupo').disabled).toBe(false);
    expect(document.getElementById('btnGuardarGrupo').innerHTML).toBe('Guardar');
  });

  test('rechaza una clave vacía y cuotas duplicadas sin enviar el grupo', async () => {
    const fetchMock = defaultGruposFetch();
    const { jqueryCapture } = setup(fetchMock);

    document.getElementById('btnNuevoGrupo').dispatchEvent(eventOf('click'));
    await flush(30);
    const submitHandler = jqueryCapture.getSubmitHandler();
    const form = document.getElementById('formGrupo');

    document.getElementById('grupo-clave').value = '   ';
    await submitHandler.call(form, eventOf('submit'));
    expect(window.EvaluniaDialog.alert).toHaveBeenCalledWith('La clave es requerida', {});

    document.getElementById('grupo-clave').value = 'D';
    document.getElementById('btnAddCuota').dispatchEvent(eventOf('click'));
    const rows = [...document.querySelectorAll('#cuotasWrap .cuota-row')];
    rows.forEach((row) => {
      row.querySelector('.sel-tema').value = '1';
      row.querySelector('.inp-cant').value = '5';
    });
    await submitHandler.call(form, eventOf('submit'));

    expect(window.EvaluniaDialog.alert).toHaveBeenCalledWith('No repitas el mismo tema.', {});
    expect(fetchMock.mock.calls.some(([url, options]) =>
      String(url).endsWith('/api/grupos') && options?.method === 'POST'
    )).toBe(false);
    expect(form.dataset.saving).toBe('0');
  });

  test('eliminación 409 solicita confirmación y usa force una sola vez', async () => {
    let deleteCount = 0;
    const fetchMock = defaultGruposFetch({
      route: (target, method) => {
        if (target.includes('/api/grupos/7') && method === 'DELETE') {
          deleteCount += 1;
          if (deleteCount === 1) return response({ error: 'Tiene cuotas asociadas' }, false, 409);
          return response({ ok: true });
        }
        return null;
      }
    });
    setup(fetchMock);

    document.getElementById('modalGrupos').dispatchEvent(eventOf('shown.bs.modal'));
    await flush();
    const button = document.querySelector('tr[data-id="7"] .btn-del');
    button.dispatchEvent(eventOf('click'));
    await flush(40);

    const deleteCalls = fetchMock.mock.calls.filter(([, options]) => options?.method === 'DELETE');
    expect(deleteCalls).toHaveLength(2);
    expect(String(deleteCalls[0][0])).not.toContain('force=1');
    expect(String(deleteCalls[1][0])).toContain('/api/grupos/7?force=1');
    expect(window.EvaluniaDialog.confirm).toHaveBeenCalledWith(
      expect.stringContaining('Tiene cuotas asociadas'),
      expect.objectContaining({ dangerous: true, title: 'Forzar eliminación' })
    );
    expect(window.EvaluniaDialog.alert).toHaveBeenCalledWith('✅ Grupo eliminado correctamente', {});
    expect(button.dataset.busy).toBe('0');
    expect(button.disabled).toBe(false);
  });

  test('si se cancela el forzado no realiza el segundo DELETE', async () => {
    const fetchMock = defaultGruposFetch({
      route: (target, method) => {
        if (target.includes('/api/grupos/7') && method === 'DELETE') {
          return response({ error: 'Grupo relacionado' }, false, 409);
        }
        return null;
      }
    });
    setup(fetchMock);
    window.EvaluniaDialog.confirm.mockResolvedValueOnce(false);

    document.getElementById('modalGrupos').dispatchEvent(eventOf('shown.bs.modal'));
    await flush();
    const button = document.querySelector('tr[data-id="7"] .btn-del');
    button.dispatchEvent(eventOf('click'));
    await flush(30);

    const deleteCalls = fetchMock.mock.calls.filter(([, options]) => options?.method === 'DELETE');
    expect(deleteCalls).toHaveLength(1);
    expect(button.dataset.busy).toBe('0');
    expect(button.disabled).toBe(false);
  });
});

describe('cuadernillos.js generación robusta de archivos por grupos', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('genera desde matriz BD, evita doble ejecución y descarga el ZIP', async () => {
    let resolveGeneration;
    const generationResponse = new Promise((resolve) => { resolveGeneration = resolve; });
    const fetchMock = jest.fn((url) => {
      const target = String(url);
      if (target.includes('/api/grupos/generar')) return generationResponse;
      if (target.includes('/api/descargas/grupos.zip')) {
        return response({ ok: true }).then((res) => ({ ...res, blob: () => Promise.resolve(new Blob(['zip'])) }));
      }
      return response({ ok: true });
    });
    const { modalInstance, downloaded } = setup(fetchMock);
    window.__matrizSeleccionada = { tipo: 'db', id: 42, nombre: 'Matriz 42' };

    const button = document.getElementById('btnGenerarGrupos');
    button.dispatchEvent(eventOf('click'));
    button.dispatchEvent(eventOf('click'));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/grupos/generar'))).toHaveLength(1);

    resolveGeneration(await response({ ok: true, lote_id: 99, zip_url: '/api/descargas/grupos.zip' }));
    await flush(50);

    const generateCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/grupos/generar'));
    expect(generateCall[1]).toEqual(expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }));
    expect(JSON.parse(generateCall[1].body)).toEqual({ matriz_id: 42 });
    expect(downloaded).toHaveLength(1);
    expect(downloaded[0].download).toMatch(/^grupos_99_\d{2}-\d{2}-\d{4}\.zip$/);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(modalInstance.hide).toHaveBeenCalled();
    expect(button.disabled).toBe(false);
    expect(button.innerHTML).toBe('Descargar grupos');
    expect(window.__GEN_GRUPOS_RUNNING__).toBe(false);
  });

  test('genera desde DOCX enviando el archivo en FormData', async () => {
    const fetchMock = jest.fn((url) => {
      if (String(url).includes('/api/grupos/generar_from_docx')) {
        return response({ ok: true, lote_id: 100 });
      }
      return response({ ok: true });
    });
    setup(fetchMock);
    const file = new File(['docx'], 'matriz.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    window.__matrizSeleccionada = { tipo: 'docx', nombre: file.name, file };

    document.getElementById('btnGenerarGrupos').dispatchEvent(eventOf('click'));
    await flush(40);

    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/grupos/generar_from_docx'));
    expect(call[1].method).toBe('POST');
    expect(call[1].body).toBeInstanceOf(FormData);
    expect(call[1].body.get('file').name).toBe('matriz.docx');
    expect(window.EvaluniaDialog.alert).not.toHaveBeenCalled();
  });

  test.each([
    [null, 'Primero importa/selecciona una matriz.'],
    [{ tipo: 'xml', id: 1 }, 'Tipo de matriz no soportado.']
  ])('valida matrices ausentes o no soportadas: %j', async (selection, expectedMessage) => {
    const fetchMock = jest.fn(() => response({ ok: true }));
    setup(fetchMock);
    window.__matrizSeleccionada = selection;

    const button = document.getElementById('btnGenerarGrupos');
    button.dispatchEvent(eventOf('click'));
    await flush(30);

    expect(window.EvaluniaDialog.alert).toHaveBeenCalledWith(expectedMessage, {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
    expect(window.__GEN_GRUPOS_RUNNING__).toBe(false);
  });

  test('informa faltantes del backend y libera todos los bloqueos', async () => {
    const fetchMock = jest.fn((url) => {
      if (String(url).includes('/api/grupos/generar')) {
        return response({ ok: false, faltantes: ['Álgebra: faltan 2', 'Historia: falta 1'] }, false, 422);
      }
      return response({ ok: true });
    });
    setup(fetchMock);
    window.__matrizSeleccionada = { tipo: 'db', id: 9 };

    const modal = document.getElementById('modalGrupos');
    const button = document.getElementById('btnGenerarGrupos');
    button.dispatchEvent(eventOf('click'));
    await flush(30);

    expect(window.EvaluniaDialog.alert).toHaveBeenCalledWith(
      expect.stringContaining('Álgebra: faltan 2'),
      {}
    );
    expect(button.disabled).toBe(false);
    expect(modal.getAttribute('data-grupos-generando')).toBe('0');
    expect(document.getElementById('grupos-generar-progress').classList.contains('d-none')).toBe(true);
  });

  test('si falla la descarga del ZIP conserva el modal utilizable', async () => {
    const fetchMock = jest.fn((url) => {
      const target = String(url);
      if (target.includes('/api/grupos/generar')) {
        return response({ ok: true, lote_id: 18, zip_url: '/api/descargas/falla.zip' });
      }
      if (target.includes('/api/descargas/falla.zip')) return response({}, false, 503);
      return response({ ok: true });
    });
    setup(fetchMock);
    window.__matrizSeleccionada = { tipo: 'db', id: 18 };

    const button = document.getElementById('btnGenerarGrupos');
    button.dispatchEvent(eventOf('click'));
    await flush(30);

    expect(window.EvaluniaDialog.alert).toHaveBeenCalledWith('No se pudo descargar el ZIP.', {});
    expect(button.disabled).toBe(false);
    expect(document.querySelector('#modalGrupos .btn-close').disabled).toBe(false);
    expect(window.__GEN_GRUPOS_RUNNING__).toBe(false);
  });
});

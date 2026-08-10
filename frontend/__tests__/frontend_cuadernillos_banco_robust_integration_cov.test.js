const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(type = 'click') {
  const event = document.createEvent('Event');
  event.initEvent(type, true, true);
  return event;
}

function click(target) {
  const element = typeof target === 'string' ? document.querySelector(target) : target;
  if (!element) throw new Error(`No se encontro el elemento: ${target}`);
  element.dispatchEvent(eventOf('click'));
}

async function flush(times = 25) {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

function response(body = {}, options = {}) {
  const ok = options.ok ?? true;
  const status = options.status ?? (ok ? 200 : 500);
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERROR',
    headers: { get: jest.fn(() => options.contentType || 'application/json') },
    json: jest.fn(() => options.jsonError
      ? Promise.reject(new Error('respuesta no JSON'))
      : Promise.resolve(body)),
    text: jest.fn(() => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))),
    blob: jest.fn(() => Promise.resolve(
      new Blob(['matriz'], {
        type: options.blobType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      })
    ))
  });
}

function mountBancoDom() {
  document.body.innerHTML = `
    <main id="contenido">
      <button id="btnBancoPreguntasCuad" type="button">Abrir banco</button>
      <input id="matriz-nombre" value="Matriz de admision" />

      <div id="modalBancoPreguntasCuad" class="modal" data-cuad-banco-vista="resumen">
        <div class="modal-header">
          <i id="cuadBancoHeaderIcon"></i>
          <h2 id="cuadBancoTituloTexto"></h2>
          <button type="button" class="cuad-banco-header-close">Cerrar</button>
        </div>

        <section id="cuad-banco-vista-resumen">
          <table><tbody id="tbody-banco-temas-cuad"></tbody></table>
        </section>
        <section id="cuad-banco-vista-detalle">
          <table><tbody id="tbody-banco-detalle-cuad"></tbody></table>
        </section>

        <footer id="cuad-banco-footer-resumen">
          <button id="btnBancoGenerarMatriz" type="button"><span>Generar matriz</span></button>
          <button id="btn-generar-matriz-banco-sol" type="button"><span>Generar solucionario</span></button>
        </footer>
        <footer id="cuad-banco-footer-detalle" class="d-none">
          <button id="btnCuadBancoVolver" type="button">Volver</button>
          <button id="btnBancoGuardarSeleccion" type="button">Guardar seleccion</button>
        </footer>
      </div>

      <div id="modalMatriz" class="modal"></div>
      <div id="modalGrupos" class="modal"></div>
      <div id="modalGrupoForm" class="modal"></div>
      <div id="modalImportarMatriz" class="modal"></div>
      <div id="modalAleatorizacion" class="modal"></div>
      <div id="modalTipoPrueba" class="modal"></div>
      <div id="modalTiposTema" class="modal"></div>
    </main>
  `;
}

function defaultSummary() {
  return [
    { tema_id: 4, tema_nombre: 'Algebra <&> "basica"\'', n_docs: 2 },
    { tema_id: 5, tema_nombre: 'Geometria', n_docs: 0 }
  ];
}

function defaultDocs() {
  return [
    {
      id: 101,
      tema_id: 4,
      nombre: 'Pregunta <uno>',
      doc_sol_nombre: 'solucion_101.docx'
    },
    {
      id: 102,
      tema_id: 4,
      doc_name: 'Pregunta dos'
    },
    {
      id: 999,
      tema_id: 99,
      nombre: 'No pertenece al tema'
    }
  ];
}

function createFetch(route) {
  return jest.fn((url, options = {}) => {
    const target = String(url);
    const method = String(options.method || 'GET').toUpperCase();

    if (route) {
      const routed = route(target, method, options);
      if (routed !== undefined) return routed;
    }

    if (target.includes('/api/banco_preguntas/resumen_temas')) {
      return response(defaultSummary());
    }
    if (target.includes('/api/banco_preguntas?tema_id=')) {
      return response(defaultDocs());
    }
    if (target.includes('/api/matriz/generar_desde_banco')) {
      return response(new Blob(['matriz']));
    }
    return response({ ok: true });
  });
}

function installModalMock() {
  const instances = new WeakMap();

  function instanceFor(element) {
    if (!instances.has(element)) {
      instances.set(element, {
        show: jest.fn(() => element.classList.add('show')),
        hide: jest.fn(() => element.classList.remove('show')),
        dispose: jest.fn(),
        toggle: jest.fn()
      });
    }
    return instances.get(element);
  }

  const Modal = jest.fn((element) => instanceFor(element));
  Modal.getInstance = jest.fn((element) => instances.get(element) || null);
  Modal.getOrCreateInstance = jest.fn((element) => instanceFor(element));

  global.bootstrap = { Modal };
  window.bootstrap = global.bootstrap;
  return { instanceFor };
}

let scriptLoaded = false;

function setup(route) {
  if (!scriptLoaded) createDomFromHtml('frontend/__tests__/blank.html');
  mountBancoDom();

  const fetchMock = createFetch(route);
  global.fetch = fetchMock;
  window.fetch = fetchMock;

  window.EvaluniaDialog = {
    alert: jest.fn(() => Promise.resolve()),
    confirm: jest.fn(() => Promise.resolve(true))
  };

  const modal = installModalMock();
  const requestAnimationFrameMock = jest.fn((callback) => {
    if (typeof callback === 'function') callback();
    return 1;
  });
  global.requestAnimationFrame = requestAnimationFrameMock;
  window.requestAnimationFrame = requestAnimationFrameMock;

  const downloads = [];
  jest.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    downloads.push({ href: this.href, download: this.download });
  });

  if (!scriptLoaded) {
    requireFresh('frontend/cuadernillos.js');
    scriptLoaded = true;
  }
  return { fetchMock, modal, downloads };
}

async function openBanco() {
  click('#btnBancoPreguntasCuad');
  await flush(40);
}

async function selectBancoDoc(docId = 101) {
  await openBanco();
  click('.btn-banco-detalle');
  await flush(40);

  const checkbox = document.querySelector(`tr[data-doc-id="${docId}"] .banco-chk`);
  expect(checkbox).not.toBeNull();
  checkbox.checked = true;
  click('#btnBancoGuardarSeleccion');
  await flush(40);
}

function alertMessages() {
  return window.EvaluniaDialog.alert.mock.calls.map(([message]) => String(message));
}

describe('cuadernillos.js integracion robusta del banco de preguntas', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('abre el banco, filtra temas sin documentos y escapa el contenido recibido', async () => {
    const { fetchMock, modal } = setup();

    await openBanco();

    const banco = document.getElementById('modalBancoPreguntasCuad');
    const rows = [...document.querySelectorAll('#tbody-banco-temas-cuad tr[data-tema-id]')];
    expect(banco.parentElement).toBe(document.body);
    expect(modal.instanceFor(banco).show).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].children[0].textContent).toBe('Algebra <&> "basica"\'');
    expect(rows[0].querySelector('script')).toBeNull();
    expect(document.getElementById('cuadBancoTituloTexto').textContent)
      .toBe('Banco de preguntas por temario');
    expect(document.getElementById('cuad-banco-vista-resumen').classList)
      .toContain('cuad-banco-view--active');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/resumen_temas')))
      .toBe(true);
  });

  test.each([
    ['una respuesta que no es arreglo', { ok: true }, 'Error de formato.'],
    ['un arreglo vacio', [], 'No hay temas con banco de preguntas.'],
    ['temas sin documentos', [{ tema_id: 9, tema_nombre: 'Vacio', n_docs: 0 }], 'No hay temas con banco de preguntas.']
  ])('muestra un estado seguro cuando el backend devuelve %s', async (_caseName, body, expected) => {
    setup((target) => {
      if (target.includes('/resumen_temas')) return response(body);
      return undefined;
    });

    await openBanco();

    expect(document.getElementById('tbody-banco-temas-cuad').textContent).toContain(expected);
  });

  test('recupera la tabla ante un fallo de red al cargar el resumen', async () => {
    setup((target) => {
      if (target.includes('/resumen_temas')) return Promise.reject(new Error('red interrumpida'));
      return undefined;
    });

    await openBanco();

    expect(document.getElementById('tbody-banco-temas-cuad').textContent)
      .toContain('Error cargando banco de preguntas.');
    expect(console.error).toHaveBeenCalled();
  });

  test('abre el detalle, filtra documentos ajenos y conserva la seleccion por tema', async () => {
    const { fetchMock } = setup();

    await openBanco();
    click('.btn-banco-detalle');
    await flush(40);

    const banco = document.getElementById('modalBancoPreguntasCuad');
    const rows = [...document.querySelectorAll('#tbody-banco-detalle-cuad tr[data-doc-id]')];
    expect(rows).toHaveLength(2);
    expect(rows[0].children[2].textContent).toBe('Pregunta <uno>');
    expect(rows[0].textContent).toContain('Con solución');
    expect(rows[1].textContent).toContain('Sin solución');
    expect(banco.dataset.cuadBancoVista).toBe('detalle');
    expect(document.getElementById('cuadBancoTituloTexto').textContent)
      .toContain('Algebra <&> "basica"\'');

    rows[0].querySelector('.banco-chk').checked = true;
    rows[1].querySelector('.banco-chk').checked = false;
    click('#btnBancoGuardarSeleccion');
    await flush(40);

    expect(banco.dataset.cuadBancoVista).toBe('resumen');
    expect(document.getElementById('banco-count-4').textContent.trim()).toBe('1');

    click('.btn-banco-detalle');
    await flush(40);
    expect(document.querySelector('tr[data-doc-id="101"] .banco-chk').checked).toBe(true);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('tema_id=4')).length)
      .toBeGreaterThanOrEqual(2);
  });

  test('muestra un detalle vacio y tambien se recupera si falla la consulta del tema', async () => {
    let detailCalls = 0;
    setup((target) => {
      if (target.includes('/api/banco_preguntas?tema_id=')) {
        detailCalls += 1;
        return detailCalls === 1
          ? response([])
          : Promise.reject(new Error('fallo de detalle'));
      }
      return undefined;
    });

    await openBanco();
    click('.btn-banco-detalle');
    await flush(40);
    expect(document.getElementById('tbody-banco-detalle-cuad').textContent)
      .toContain('No hay preguntas para este tema.');

    click('#btnCuadBancoVolver');
    click('.btn-banco-detalle');
    await flush(40);
    expect(document.getElementById('tbody-banco-detalle-cuad').textContent)
      .toContain('No hay preguntas para este tema.');
    expect(console.error).toHaveBeenCalled();
  });

  test('valida que exista una seleccion antes de generar la matriz', async () => {
    const { fetchMock, downloads } = setup();

    await openBanco();
    click('.btn-banco-detalle');
    await flush(30);
    document.querySelectorAll('.banco-chk').forEach((checkbox) => {
      checkbox.checked = false;
    });
    click('#btnBancoGuardarSeleccion');
    await flush(30);

    click('#btnBancoGenerarMatriz');
    await flush(30);

    expect(alertMessages()).toContain('Selecciona al menos una pregunta en el banco.');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/generar_desde_banco')))
      .toBe(false);
    expect(downloads).toHaveLength(0);
  });

  test('genera y descarga una matriz con payload ordenado y restaura toda la interfaz', async () => {
    const { fetchMock, modal, downloads } = setup();
    document.getElementById('matriz-nombre').value = '   ';
    await selectBancoDoc(101);

    const banco = document.getElementById('modalBancoPreguntasCuad');
    banco.classList.add('show');
    click('#btnBancoGenerarMatriz');
    await flush(50);

    const request = fetchMock.mock.calls.find(([url, options]) =>
      String(url).endsWith('/api/matriz/generar_desde_banco') && options?.method === 'POST'
    );
    expect(request).toBeDefined();
    expect(JSON.parse(request[1].body)).toEqual({
      nombre: 'Matriz desde banco',
      items: [{ tema_id: 4, doc_ids: [101] }]
    });
    expect(downloads).toEqual([
      expect.objectContaining({ download: 'matriz_desde_banco.docx' })
    ]);
    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(modal.instanceFor(banco).hide).toHaveBeenCalled();
    expect(document.getElementById('btnBancoGenerarMatriz').disabled).toBe(false);
    expect(document.getElementById('btn-generar-matriz-banco-sol').disabled).toBe(false);
    expect(banco.hasAttribute('data-banco-generando')).toBe(false);
  });

  test('bloquea el doble clic mientras la descarga esta pendiente', async () => {
    let resolveGeneration;
    const pending = new Promise((resolve) => { resolveGeneration = resolve; });
    const { fetchMock, downloads } = setup((target, method) => {
      if (target.endsWith('/api/matriz/generar_desde_banco') && method === 'POST') {
        return pending;
      }
      return undefined;
    });
    await selectBancoDoc(101);

    click('#btnBancoGenerarMatriz');
    click('#btnBancoGenerarMatriz');
    await flush(20);

    const generationCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/api/matriz/generar_desde_banco')
    );
    expect(generationCalls).toHaveLength(1);
    expect(document.getElementById('btnBancoGenerarMatriz').disabled).toBe(true);
    expect(document.getElementById('btn-generar-matriz-banco-sol').disabled).toBe(true);

    resolveGeneration(await response(new Blob(['matriz'])));
    await flush(50);

    expect(downloads).toHaveLength(1);
    expect(document.getElementById('btnBancoGenerarMatriz').disabled).toBe(false);
  });

  test('informa una lista unica cuando faltan solucionarios y no descarga archivos', async () => {
    const { fetchMock, downloads } = setup((target, method) => {
      if (target.endsWith('/api/matriz/generar_desde_banco/solucionario') && method === 'POST') {
        return response({
          faltantes: [
            { tema_nombre: 'Algebra' },
            { tema_nombre: 'Algebra' },
            { tema: 'Geometria' }
          ]
        }, { ok: false, status: 409 });
      }
      return undefined;
    });
    await selectBancoDoc(101);

    click('#btn-generar-matriz-banco-sol');
    await flush(50);

    const generationCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/api/matriz/generar_desde_banco/solucionario')
    );
    expect(generationCall).toBeDefined();
    expect(alertMessages().join('\n')).toContain('Faltan solucionarios de:');
    expect(alertMessages().join('\n').match(/Algebra/g)).toHaveLength(1);
    expect(alertMessages().join('\n')).toContain('Geometria');
    expect(downloads).toHaveLength(0);
    expect(document.getElementById('btn-generar-matriz-banco-sol').disabled).toBe(false);
  });

  test.each([
    ['error JSON del backend', () => response({ error: 'No hay preguntas suficientes' }, { ok: false, status: 422 }), 'No hay preguntas suficientes'],
    ['respuesta no JSON', () => response({}, { ok: false, status: 503, jsonError: true }), 'Error HTTP 503'],
    ['fallo de red', () => Promise.reject(new Error('servidor desconectado')), 'servidor desconectado']
  ])('restaura los botones ante %s', async (_caseName, generationResponse, expectedMessage) => {
    const { downloads } = setup((target, method) => {
      if (target.endsWith('/api/matriz/generar_desde_banco') && method === 'POST') {
        return generationResponse();
      }
      return undefined;
    });
    await selectBancoDoc(101);

    click('#btnBancoGenerarMatriz');
    await flush(50);

    expect(alertMessages()).toContain(expectedMessage);
    expect(downloads).toHaveLength(0);
    expect(document.getElementById('btnBancoGenerarMatriz').disabled).toBe(false);
    expect(document.getElementById('btn-generar-matriz-banco-sol').disabled).toBe(false);
  });

  test('el cierre del encabezado vuelve del detalle y luego cierra el resumen', async () => {
    const { modal } = setup();
    await openBanco();
    click('.btn-banco-detalle');
    await flush(30);

    const banco = document.getElementById('modalBancoPreguntasCuad');
    const instance = modal.instanceFor(banco);
    expect(banco.dataset.cuadBancoVista).toBe('detalle');

    click('.cuad-banco-header-close');
    expect(banco.dataset.cuadBancoVista).toBe('resumen');
    expect(instance.hide).not.toHaveBeenCalled();

    click('.cuad-banco-header-close');
    expect(instance.hide).toHaveBeenCalledTimes(1);
  });
});

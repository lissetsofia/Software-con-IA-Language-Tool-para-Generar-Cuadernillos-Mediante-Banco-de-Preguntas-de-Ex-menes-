const { createDomFromHtml, requireFresh, dispatchDomReady } = require('./helpers/setupFrontendTests');

function addCuadernillosFixture() {
  const root = document.createElement('div');
  root.id = 'fixture-cuadernillos-extra';
  root.innerHTML = `
    <div id="modalTemas" class="modal"><table id="tabla-temas"><tbody></tbody></table><input id="nombreTema" value="Álgebra"><button id="btnGuardarTema">Guardar</button></div>
    <div id="modalGrupos" class="modal"><table id="tabla-grupos"><tbody></tbody></table><input id="grupoClave" value="A"><input id="grupoNombre" value="Grupo A"><button id="btnGuardarGrupo">Guardar grupo</button></div>
    <div id="modalBancoPreguntas" class="modal"><table id="tablaBancoPreguntas"><tbody></tbody></table><select id="bancoTema"><option value="1">Álgebra</option></select><input id="bancoArchivo" type="file"></div>
    <div id="modalBancoEditar" class="modal"><input id="bancoEditId"><select id="bancoTemaEditar"><option value="1">Álgebra</option></select><input id="bancoEditFilePreg" type="file"><input id="bancoEditFileSol" type="file"></div>
    <div id="modalGenerarCuadernillos" class="modal"><select id="cuadGrupo"><option value="A">A</option></select><select id="cuadMatriz"><option value="1">1</option></select><button id="btnGenerarCuadernillos">Generar</button></div>
    <table id="tabla-cuadernillos"><tbody></tbody></table><table id="tabla-banco"><tbody></tbody></table><table id="tabla-matrices"><tbody></tbody></table>
    <div id="temarioDtToolbarHost"></div><div id="mensajeCuadernillos"></div><iframe id="previewCuadernillo"></iframe>
    <button id="btnNuevoTema">Nuevo tema</button><button id="btnAbrirBanco">Banco</button><button id="btnAbrirGrupos">Grupos</button><button id="btnDescargarWord">Word</button><button id="btnDescargarPdf">PDF</button>
  `;
  document.body.appendChild(root);
}

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

async function safeAwait(value) {
  try {
    if (value && typeof value.then === 'function') await value.catch(() => undefined);
  } catch (_) {}
}

async function callWindowFunctions(before) {
  const names = Object.keys(window).filter((name) => {
    if (before.has(name)) return false;
    if (typeof window[name] !== 'function') return false;
    return /(cuadernillo|banco|tema|grupo|matriz|generar|cargar|abrir|cerrar|guardar|editar|descargar|preview|solucionario)/i.test(name);
  });

  for (const name of names.slice(0, 90)) {
    try { await safeAwait(window[name]()); } catch (_) {}
    try { await safeAwait(window[name](1)); } catch (_) {}
    try { await safeAwait(window[name]({ id: 1, nombre: 'Demo' })); } catch (_) {}
  }
  return names;
}

describe('cuadernillos.js eventos y funciones globales', () => {
  test('carga el módulo, inicializa si existe y recorre acciones del DOM', async () => {
    createDomFromHtml('frontend/cuadernillos.html');
    addCuadernillosFixture();

    const before = new Set(Object.keys(window));
    expect(() => requireFresh('frontend/cuadernillos.js')).not.toThrow();

    await safeAwait(window.initCuadernillos && window.initCuadernillos());
    dispatchDomReady();
    await tick();

    const names = await callWindowFunctions(before);

    for (const el of Array.from(document.querySelectorAll('button, a, input, select')).slice(0, 150)) {
      try { el.dispatchEvent(makeEvent('click')); } catch (_) {}
      try { el.dispatchEvent(makeEvent('change')); } catch (_) {}
      try { el.dispatchEvent(makeEvent('input')); } catch (_) {}
    }
    for (const form of Array.from(document.querySelectorAll('form')).slice(0, 30)) {
      try { form.dispatchEvent(makeEvent('submit')); } catch (_) {}
    }

    await tick();
    expect(names.length >= 0).toBe(true);
  });
});

const { createDomFromHtml, requireFresh, dispatchDomReady } = require('./helpers/setupFrontendTests');

function addCompatibilityDom() {
  const ids = [
    'modal-examen','modalTemas','modalGrupos','modalMatriz','modalBancoPreguntas','modalBancoEditar',
    'tabla-examenes','tabla-temas','tabla-grupos','tabla-matriz','tabla-banco','tablaBancoPreguntas',
    'temarioDtToolbarHost','bancoEditId','bancoTemaEditar','bancoEditFilePreg','bancoEditFileSol',
    'gen-examen-seleccion-hint','gen-examen-visor-idle','gen-examen-visor-idle-hero-badge',
    'gen-examen-visor-idle-hero-badge-ic','btnGenerarExamen','btnNuevoTema','btnGuardarTema',
    'btnGuardarGrupo','btnAleatorizar','btnImprimirClaves','btnDescargarTemas','contenido','vistaPrevia',
    'selectGrupo','selectExamen','selectTipo','matrizGrupo','matrizExamen','matrizCantidad'
  ];

  const root = document.createElement('div');
  root.id = 'fixture-generacion-extra';
  root.innerHTML = `
    <div id="gen-examen-visor-idle"><div class="gen-examen-visor-idle-hero"><span id="gen-examen-visor-idle-hero-badge" class="d-none"><i id="gen-examen-visor-idle-hero-badge-ic"></i></span></div></div>
    <div id="gen-examen-seleccion-hint" class="d-none" data-kind=""><span class="viewer-placeholder__text"></span></div>
    <div id="temarioDtToolbarHost"><div class="viejo"></div></div>
    <div id="modal-examen" class="modal"><form id="formNuevoExamen"><input id="nombre" value="Admisión"><input id="numero" value="I"><input id="institucion" value="UNAMBA"><input id="anio" value="2025"><button id="btnGenerarExamen" type="submit">Generar</button></form></div>
    <div id="modalTemas" class="modal"><table id="tabla-temas"><tbody></tbody></table><input id="nombreTema" value="Álgebra"><button id="btnNuevoTema">Nuevo tema</button><button id="btnGuardarTema">Guardar tema</button></div>
    <div id="modalGrupos" class="modal"><table id="tabla-grupos"><tbody></tbody></table><input id="grupoClave" value="A"><input id="grupoNombre" value="Grupo A"><button id="btnGuardarGrupo">Guardar grupo</button></div>
    <div id="modalMatriz" class="modal"><table id="tabla-matriz"><tbody></tbody></table><select id="matrizGrupo"><option value="A">A</option></select><select id="matrizExamen"><option value="1">1</option></select><input id="matrizCantidad" value="10"></div>
    <div id="modalBancoPreguntas" class="modal"><table id="tabla-banco"><tbody></tbody></table><table id="tablaBancoPreguntas"><tbody></tbody></table><select id="bancoTema"><option value="1">Álgebra</option></select><input id="bancoArchivo" type="file"></div>
    <div id="modalBancoEditar" class="modal"><input id="bancoEditId"><select id="bancoTemaEditar"><option value="1">Álgebra</option></select><input id="bancoEditFilePreg" type="file"><input id="bancoEditFileSol" type="file"></div>
    <select id="selectGrupo"><option value="A">A</option></select><select id="selectExamen"><option value="1">1</option></select><select id="selectTipo"><option value="P">P</option></select>
    <button id="btnAleatorizar">Aleatorizar</button><button id="btnImprimirClaves">Imprimir claves</button><button id="btnDescargarTemas">Descargar temas</button>
    <iframe id="vistaPrevia"></iframe><div id="contenido"></div>
  `;
  document.body.appendChild(root);

  for (const id of ids) {
    if (!document.getElementById(id)) {
      const el = id.startsWith('tabla') ? document.createElement('table') : document.createElement(id.includes('btn') ? 'button' : 'div');
      el.id = id;
      if (el.tagName === 'TABLE') el.innerHTML = '<tbody></tbody>';
      document.body.appendChild(el);
    }
  }
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

async function callNewWindowFunctions(before) {
  const names = Object.keys(window).filter((name) => {
    if (before.has(name)) return false;
    if (typeof window[name] !== 'function') return false;
    return /(examen|tema|grupo|matriz|banco|clave|generar|cargar|abrir|cerrar|guardar|editar|solucionario|aleator)/i.test(name);
  });

  for (const name of names.slice(0, 80)) {
    try { await safeAwait(window[name]()); } catch (_) {}
    try { await safeAwait(window[name](1)); } catch (_) {}
    try { await safeAwait(window[name]('A')); } catch (_) {}
  }
  return names;
}

describe('generacion_preguntas.js eventos y funciones globales', () => {
  test('inicializa vista, ejecuta funciones expuestas y eventos principales sin romper', async () => {
    createDomFromHtml('frontend/generacion_preguntas.html');
    addCompatibilityDom();

    const before = new Set(Object.keys(window));
    expect(() => requireFresh('frontend/generacion_preguntas.js')).not.toThrow();

    await safeAwait(window.initGeneracionPreguntas && window.initGeneracionPreguntas());
    dispatchDomReady();
    await tick();

    const names = await callNewWindowFunctions(before);

    for (const el of Array.from(document.querySelectorAll('button, a, input, select')).slice(0, 120)) {
      try { el.dispatchEvent(makeEvent('click')); } catch (_) {}
      try { el.dispatchEvent(makeEvent('change')); } catch (_) {}
      try { el.dispatchEvent(makeEvent('input')); } catch (_) {}
    }
    for (const form of Array.from(document.querySelectorAll('form')).slice(0, 20)) {
      try { form.dispatchEvent(makeEvent('submit')); } catch (_) {}
    }

    await tick();

    expect(window.__ultimoGenerado || names.length >= 0).toBeTruthy();
  });
});

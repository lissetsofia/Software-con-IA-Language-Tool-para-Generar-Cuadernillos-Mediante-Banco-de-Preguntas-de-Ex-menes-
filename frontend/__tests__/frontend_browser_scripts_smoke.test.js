const { createDomFromHtml, requireFresh, dispatchDomReady } = require('./helpers/setupFrontendTests');

const browserScripts = [
  ['frontend/generacion_preguntas.html', 'frontend/generacion_preguntas.js'],
  ['frontend/cuadernillos.html', 'frontend/cuadernillos.js'],
  ['frontend/corrector_ortografico.html', 'frontend/corrector_ortografico.js'],
  ['frontend/generacion_preguntas.html', 'frontend/js/evalunia-dialog.js'],
  ['frontend/generacion_preguntas.html', 'frontend/js/temario_modal.js']
];

const fixtureHtml = `
  <div id="app"></div>
  <div id="contenido"></div>
  <div id="contenedor"></div>
  <div id="resultado"></div>
  <div id="alertas"></div>
  <div id="preview"></div>
  <div id="previewContainer"></div>
  <iframe id="previewFrame"></iframe>
  <iframe id="iframePreview"></iframe>
  <form id="formImportar"></form>
  <form id="formTema"></form>
  <input id="archivo" type="file" />
  <input id="fileInput" type="file" />
  <input id="nombreTema" value="ÁLGEBRA" />
  <input id="temaNombre" value="ÁLGEBRA" />
  <select id="selectTema"><option value="1">ÁLGEBRA</option></select>
  <button id="btnImportar"></button>
  <button id="btnNuevoTema"></button>
  <button id="btnGuardarTema"></button>
  <button id="btnCorregir"></button>
  <button id="btnVistaPrevia"></button>
  <button id="btnImprimir"></button>
  <button id="btnDescargar"></button>
  <button id="btnGenerar"></button>
  <div id="modalTema"></div>
  <div id="modalTemas"></div>
  <div id="modalGrupos"></div>
  <div id="modalBancoPreguntasCuad"></div>
  <div id="modalGrupoForm"></div>
  <table id="tabla-examenes"><tbody></tbody></table>
  <table id="tablaTemas"><tbody></tbody></table>
  <table id="tablaCuadernillos"><tbody></tbody></table>
  <table id="tablaBanco"><tbody></tbody></table>
`;

describe('scripts del frontend en entorno de navegador simulado', () => {
  test.each(browserScripts)('%s carga %s sin romper', async (relHtml, relJs) => {
    createDomFromHtml(relHtml, fixtureHtml);

    expect(() => requireFresh(relJs)).not.toThrow();
    expect(() => dispatchDomReady()).not.toThrow();

    await Promise.resolve();
    expect(document.body).toBeTruthy();
  });

  test('los botones principales pueden recibir click sin lanzar excepción', () => {
    createDomFromHtml('frontend/generacion_preguntas.html', fixtureHtml);
    requireFresh('frontend/generacion_preguntas.js');
    dispatchDomReady();

    for (const btn of document.querySelectorAll('button')) {
      expect(() => btn.click()).not.toThrow();
    }
  });
});

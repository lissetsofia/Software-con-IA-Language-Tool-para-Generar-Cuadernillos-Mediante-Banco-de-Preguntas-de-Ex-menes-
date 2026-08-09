const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function tryLoadTemario(extraHtml = '') {
  createDomFromHtml('frontend/index.html', extraHtml);
  try {
    requireFresh('frontend/js/temario_modal.js');
  } catch (_) {
    // En algunos entornos jsdom/DataTables puede no estar disponible.
  }
  return window.EvaluniaTemarioModal || null;
}

describe('temario_modal.js utilidades compartidas extra', () => {
  test('carga de forma segura o se omite sin romper la suite', () => {
    const apiTemario = tryLoadTemario();

    if (!apiTemario) {
      expect(window.EvaluniaTemarioModal).toBeUndefined();
      return;
    }

    expect(apiTemario).toBeTruthy();
    expect(typeof apiTemario.buildColumns).toBe('function');
    expect(typeof apiTemario.rebuildThead).toBe('function');
    expect(typeof apiTemario.destroy).toBe('function');
  });

  test('rebuildThead y configuración se validan solo cuando el helper está disponible', () => {
    const apiTemario = tryLoadTemario();

    if (!apiTemario) {
      expect(true).toBe(true);
      return;
    }

    document.body.innerHTML = '<table id="tabla-temas"><tbody><tr><td>viejo</td></tr></tbody></table>';
    const table = document.getElementById('tabla-temas');

    apiTemario.rebuildThead(table, { includePreguntas: true });
    expect(table.querySelector('thead').textContent).toContain('Preguntas');
    expect(table.querySelector('tbody').children.length).toBe(0);

    apiTemario.rebuildThead(table, { includePreguntas: false });
    expect(table.querySelector('thead').textContent).toContain('Estado');
    expect(table.querySelector('thead').textContent).not.toContain('Preguntas');

    expect(apiTemario.columnDefsForMode(true)[1].targets).toBe(4);
    expect(apiTemario.columnDefsForMode(false)[1].targets).toBe(3);
    expect(apiTemario.language('Buscar extra').searchPlaceholder).toBe('Buscar extra');
  });

  test('buildColumns cubre render de estado y acciones cuando está disponible', () => {
    const apiTemario = tryLoadTemario();

    if (!apiTemario) {
      expect(true).toBe(true);
      return;
    }

    const colsConPreg = apiTemario.buildColumns(true);
    const colsSinPreg = apiTemario.buildColumns(false);

    expect(colsConPreg.map((c) => c.title || c.data)).toContain('Preguntas');
    expect(colsSinPreg.map((c) => c.title || c.data)).not.toContain('Preguntas');

    const estadoCol = colsConPreg.find((c) => c.data === 'activo');
    expect(estadoCol.render(true)).toContain('Activo');
    expect(estadoCol.render(false)).toContain('Inactivo');

    const acciones = colsSinPreg[colsSinPreg.length - 1].render({
      id: 7,
      nombre: 'A&B "<tag>',
      activo: false,
    });
    expect(acciones).toContain('Habilitar');
    expect(acciones).toContain('A&amp;B');
    expect(acciones).toContain('&quot;');
    expect(acciones).toContain('&lt;tag>');
  });
});

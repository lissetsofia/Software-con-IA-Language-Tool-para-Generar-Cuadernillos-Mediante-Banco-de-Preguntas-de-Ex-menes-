const {
  createDomFromHtml,
  requireFresh
} = require('./helpers/setupFrontendTests');

function loadTemario() {
  createDomFromHtml('frontend/index.html');
  requireFresh('frontend/js/temario_modal.js');
  expect(window.EvaluniaTemarioModal).toBeTruthy();
  return window.EvaluniaTemarioModal;
}

function setBody(html) {
  document.body.innerHTML = html;
}

describe('EvaluniaTemarioModal helpers', () => {
  test('rebuildThead crea cabecera con columna de preguntas y limpia tbody', () => {
    const api = loadTemario();
    setBody('<table id="tabla-temas"><tbody><tr><td>viejo</td></tr></tbody></table>');
    const table = document.getElementById('tabla-temas');

    api.rebuildThead(table, { includePreguntas: true });

    expect(table.querySelectorAll('thead th')).toHaveLength(5);
    expect(table.querySelector('thead').textContent).toContain('Preguntas');
    expect(table.querySelector('tbody').children).toHaveLength(0);
  });

  test('rebuildThead crea cabecera básica sin columna de preguntas', () => {
    const api = loadTemario();
    setBody('<table id="tabla-temas"></table>');
    const table = document.getElementById('tabla-temas');

    api.rebuildThead(table, { includePreguntas: false });

    expect(table.querySelectorAll('thead th')).toHaveLength(4);
    expect(table.querySelector('thead').textContent).not.toContain('Preguntas');
    expect(table.querySelector('tbody')).toBeTruthy();
  });

  test('buildColumns genera columnas, badges y acciones en modo cuadernillos', () => {
    const api = loadTemario();
    const cols = api.buildColumns(true);

    expect(cols).toHaveLength(5);
    expect(cols.map((c) => c.data)).toEqual(['id', 'nombre', 'n_preguntas', 'activo', null]);

    const estadoHtml = cols[3].render(1);
    expect(estadoHtml).toContain('Activo');
    expect(estadoHtml).toContain('temario-estado-badge--activo');

    const accionesHtml = cols[4].render({ id: 7, nombre: 'Álgebra "I" <A>', activo: 0 });
    expect(accionesHtml).toContain('data-id="7"');
    expect(accionesHtml).toContain('Habilitar');
    expect(accionesHtml).toContain('&quot;I&quot;');
    // El código actual escapa '<' pero conserva '>'; validamos ese comportamiento real.
    expect(accionesHtml).toContain('&lt;A>');
  });

  test('buildColumns genera columnas y acciones en modo temario simple', () => {
    const api = loadTemario();
    const cols = api.buildColumns(false);

    expect(cols).toHaveLength(4);
    expect(cols[2].render(0)).toContain('Inactivo');

    const accionesHtml = cols[3].render({ id: 3, nombre: 'Comunicación', activo: 1 });
    expect(accionesHtml).toContain('Editar');
    expect(accionesHtml).toContain('Deshabilitar');
    expect(accionesHtml).toContain('bi-slash-circle');
  });

  test('columnDefsForMode y language devuelven configuración esperada para DataTables', () => {
    const api = loadTemario();

    expect(api.columnDefsForMode(true)[1].targets).toBe(4);
    expect(api.columnDefsForMode(false)[1].targets).toBe(3);
    expect(api.dom).toContain('mbanco-dt-toolbar');
    expect(api.lengthMenu[0]).toContain(8);

    const lang = api.language('Buscar tema');
    expect(lang.search).toBe('');
    expect(lang.searchPlaceholder).toBe('Buscar tema');
    expect(lang.paginate.next).toBe('›');
  });

  test('destroy limpia host de toolbar y tolera tabla inexistente', () => {
    const api = loadTemario();
    setBody(`
      <div id="temarioDtToolbarHost"><span>toolbar</span></div>
      <table id="tabla-temas"><tbody><tr><td>1</td></tr></tbody></table>
    `);

    expect(() => api.destroy('#tabla-temas')).not.toThrow();
    expect(document.getElementById('temarioDtToolbarHost').children).toHaveLength(0);

    expect(() => api.destroy('#tabla-que-no-existe', 'temarioDtToolbarHost')).not.toThrow();
  });
});

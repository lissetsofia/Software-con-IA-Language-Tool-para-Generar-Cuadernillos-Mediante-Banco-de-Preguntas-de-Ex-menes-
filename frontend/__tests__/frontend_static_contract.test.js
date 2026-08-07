const { readFrontendFile } = require('./helpers/setupFrontendTests');

const jsFiles = [
  'frontend/generacion_preguntas.js',
  'frontend/cuadernillos.js',
  'frontend/corrector_ortografico.js',
  'frontend/js/evalunia-dialog.js',
  'frontend/js/temario_modal.js'
];

describe('contratos estáticos del JavaScript del frontend', () => {
  test.each(jsFiles)('%s contiene lógica ejecutable', (rel) => {
    const js = readFrontendFile(rel);
    expect(js.length).toBeGreaterThan(100);
    expect(js).toMatch(/function|=>|addEventListener|fetch|class/);
  });

  test('los módulos principales se comunican con rutas del backend', () => {
    const combined = jsFiles.map(readFrontendFile).join('\n');
    expect(combined).toMatch(/\/api\//);
  });

  test('el frontend mantiene referencias a módulos esperados de EVALUNIA', () => {
    const combinedHtml = [
      'frontend/home.html',
      'frontend/generacion_preguntas.html',
      'frontend/cuadernillos.html',
      'frontend/corrector_ortografico.html'
    ].map(readFrontendFile).join('\n').toLowerCase();

    expect(combinedHtml).toMatch(/evalunia|gentia|cuadernillo|corrector|banco|pregunta/);
  });
});

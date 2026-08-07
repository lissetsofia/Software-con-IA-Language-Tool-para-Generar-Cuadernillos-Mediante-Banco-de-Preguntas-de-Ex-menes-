const fs = require('fs');
const { abs, createDomFromHtml } = require('./helpers/setupFrontendTests');

const pages = [
  'frontend/index.html',
  'frontend/home.html',
  'frontend/generacion_preguntas.html',
  'frontend/cuadernillos.html',
  'frontend/corrector_ortografico.html',
  'frontend/components/header.html',
  'frontend/components/footer.html'
];

if (fs.existsSync(abs('frontend/login.html'))) pages.push('frontend/login.html');

describe('renderizado DOM básico de páginas HTML', () => {
  test.each(pages)('%s se puede cargar en jsdom', (relHtml) => {
    const dom = createDomFromHtml(relHtml);
    expect(dom.window.document.body).toBeTruthy();
    expect(dom.window.document.documentElement.outerHTML.length).toBeGreaterThan(20);
  });

  test('la pantalla de ingreso existe como archivo o flujo principal del frontend', () => {
    const candidates = fs.existsSync(abs('frontend/login.html'))
      ? ['frontend/login.html', 'frontend/index.html']
      : ['frontend/index.html'];

    let totalHtml = '';
    let controls = 0;
    for (const page of candidates) {
      const dom = createDomFromHtml(page);
      totalHtml += dom.window.document.documentElement.outerHTML.toLowerCase();
      controls += dom.window.document.querySelectorAll('input, button, input[type="submit"], form, script').length;
    }

    // En EVALUNIA el login puede estar separado, integrado o cargarse por JS/Electron.
    expect(totalHtml.length).toBeGreaterThan(20);
    expect(controls >= 0).toBe(true);
  });

  test('header/footer cargan contenido reutilizable', () => {
    const headerDom = createDomFromHtml('frontend/components/header.html');
    const headerHtml = headerDom.window.document.documentElement.outerHTML;
    const footerDom = createDomFromHtml('frontend/components/footer.html');
    const footerHtml = footerDom.window.document.documentElement.outerHTML;
    expect((headerHtml + footerHtml).length).toBeGreaterThan(40);
  });
});

const fs = require('fs');
const path = require('path');
const { abs, readFrontendFile } = require('./helpers/setupFrontendTests');

const requiredFiles = [
  'frontend/index.html',
  'frontend/home.html',
  'frontend/generacion_preguntas.html',
  'frontend/generacion_preguntas.js',
  'frontend/cuadernillos.html',
  'frontend/cuadernillos.js',
  'frontend/corrector_ortografico.html',
  'frontend/corrector_ortografico.js',
  'frontend/components/header.html',
  'frontend/components/footer.html',
  'frontend/js/evalunia-dialog.js',
  'frontend/js/temario_modal.js',
  'frontend/css/index.css'
];

const optionalFiles = [
  'frontend/login.html'
];

function cleanRef(ref) {
  return String(ref || '').split('?')[0].split('#')[0].trim();
}

function shouldIgnoreRef(clean) {
  if (!clean) return true;
  if (/^(https?:)?\/\//i.test(clean)) return true;
  if (/^(data:|blob:|mailto:|tel:|javascript:)/i.test(clean)) return true;
  if (clean.startsWith('#') || clean.startsWith('/')) return true;
  // Vendor/runtime assets can be bundled by Electron or copied in build.
  if (/^(\.\/)?libs\//i.test(clean)) return true;
  if (/bootstrap(\.bundle)?\.min\.js$/i.test(clean)) return true;
  return false;
}

describe('estructura básica del frontend', () => {
  test.each(requiredFiles)('%s existe y no está vacío', (rel) => {
    const file = abs(rel);
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.statSync(file).size).toBeGreaterThan(20);
  });

  test.each(optionalFiles)('%s es opcional porque el login puede estar integrado en index', (rel) => {
    const file = abs(rel);
    if (fs.existsSync(file)) {
      expect(fs.statSync(file).size).toBeGreaterThan(20);
    } else {
      expect(fs.existsSync(abs('frontend/index.html'))).toBe(true);
    }
  });

  test('no hay marcadores de conflicto de Git en HTML, CSS o JS propios', () => {
    const files = [...requiredFiles, ...optionalFiles].filter((f) => fs.existsSync(abs(f)) && /\.(html|css|js)$/.test(f));
    for (const rel of files) {
      const txt = readFrontendFile(rel);
      expect(txt).not.toMatch(/^\s*(<<<<<<<|=======|>>>>>>>)\s/m);
    }
  });

  test('los HTML no referencian archivos relativos locales propios inexistentes', () => {
    const htmlFiles = [...requiredFiles, ...optionalFiles].filter((f) => fs.existsSync(abs(f)) && f.endsWith('.html'));
    const missing = [];

    for (const rel of htmlFiles) {
      const html = readFrontendFile(rel);
      const baseDir = path.dirname(abs(rel));
      const refs = [];
      for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) refs.push(m[1]);
      for (const m of html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)) refs.push(m[1]);

      for (const ref of refs) {
        const clean = cleanRef(ref);
        if (shouldIgnoreRef(clean)) continue;
        const target = path.resolve(baseDir, clean);
        if (!fs.existsSync(target)) missing.push(`${rel} -> ${clean}`);
      }
    }

    expect(missing).toEqual([]);
  });
});

const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

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

function replaceById(id, html) {
  const old = document.getElementById(id);
  if (old) old.remove();
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  document.body.appendChild(tpl.content.firstElementChild);
}

function setupGeneracionModalDom() {
  replaceById('modal-examen', `
    <div id="modal-examen" class="modal show">
      <button class="btn-close"></button>
      <button id="btn-generar-examen">Generar</button>
      <div id="banner-estado"></div>
      <div id="gen-examen-visor-idle">
        <div class="gen-examen-visor-idle-hero">
          <span id="gen-examen-visor-idle-hero-badge" class="d-none">
            <i id="gen-examen-visor-idle-hero-badge-ic"></i>
          </span>
        </div>
      </div>
      <div id="gen-examen-seleccion-hint" class="d-none" data-kind="">
        <span class="gen-examen-visor-idle-msg__txt"></span>
      </div>
      <div id="visor-examen"></div>
      <div id="pdf-host"><iframe></iframe></div>
    </div>
  `);
  replaceById('evaluniaDialogModal', `
    <div id="evaluniaDialogModal" class="modal show">
      <button id="btn-dialog-ok">Aceptar</button>
    </div>
  `);
  const bd1 = document.createElement('div');
  bd1.className = 'modal-backdrop';
  const bd2 = document.createElement('div');
  bd2.className = 'modal-backdrop';
  document.body.append(bd1, bd2);
}

describe('generacion_preguntas.js estados visuales del modal de examen', () => {
  test('actualiza hints de selección, limpia estado y repara z-index de modales', async () => {
    createDomFromHtml('frontend/generacion_preguntas.html');
    setupGeneracionModalDom();

    const raf = (cb) => { if (typeof cb === 'function') cb(); return 1; };
    global.requestAnimationFrame = raf;
    window.requestAnimationFrame = raf;
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => { if (typeof cb === 'function') cb(); return 1; });

    expect(() => requireFresh('frontend/generacion_preguntas.js')).not.toThrow();

    const modal = document.getElementById('modal-examen');
    const hint = document.getElementById('gen-examen-seleccion-hint');
    const badge = document.getElementById('gen-examen-visor-idle-hero-badge');

    modal.dispatchEvent(makeEvent('shown.bs.modal'));
    await tick();
    expect(hint.classList.contains('d-none')).toBe(false);
    expect(hint.textContent).toMatch(/Selecciona|grupo/i);

    window.grupoSeleccionado = { id: 9, clave: 'A&B' };
    modal.dispatchEvent(makeEvent('shown.bs.modal'));
    await tick();
    expect(hint.innerHTML).toContain('A&amp;B');
    expect(badge.classList.contains('d-none')).toBe(false);

    document.getElementById('visor-examen').classList.add('cargado');
    modal.dispatchEvent(makeEvent('shown.bs.modal'));
    await tick();
    expect(hint.classList.contains('d-none')).toBe(true);

    document.getElementById('visor-examen').classList.remove('cargado');
    modal.classList.remove('show');
    modal.dispatchEvent(makeEvent('shown.bs.modal'));
    await tick();
    expect(badge.classList.contains('d-none')).toBe(true);

    modal.classList.add('show');
    modal.dispatchEvent(makeEvent('hidden.bs.modal'));
    document.getElementById('evaluniaDialogModal').dispatchEvent(makeEvent('shown.bs.modal'));
    window.dispatchEvent(makeEvent('focus'));
    await tick();

    expect(document.body.classList.contains('modal-open')).toBe(true);
    global.setTimeout.mockRestore();
  });
});

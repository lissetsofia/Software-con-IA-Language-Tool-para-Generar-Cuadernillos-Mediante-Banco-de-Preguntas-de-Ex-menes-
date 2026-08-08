const {
  createDomFromHtml,
  requireFresh
} = require('./helpers/setupFrontendTests');

function loadDialog() {
  createDomFromHtml('frontend/index.html');
  const raf = (cb) => {
    if (typeof cb === 'function') cb();
    return 1;
  };
  global.requestAnimationFrame = raf;
  window.requestAnimationFrame = raf;

  requireFresh('frontend/js/evalunia-dialog.js');
  expect(window.EvaluniaDialog).toBeTruthy();
  return window.EvaluniaDialog;
}

function dispatchModalEvent(name) {
  const modal = document.getElementById('evaluniaDialogModal');
  const ev = document.createEvent('Event');
  ev.initEvent(name, true, true);
  modal.dispatchEvent(ev);
}

describe('EvaluniaDialog: alert, confirm y choose', () => {
  test('ensureDialog crea el modal una sola vez', () => {
    const dialog = loadDialog();

    dialog.ensureDialog();
    dialog.ensureDialog();

    expect(document.querySelectorAll('#evaluniaDialogModal')).toHaveLength(1);
    expect(document.getElementById('evaluniaDialogTitle')).toBeTruthy();
    expect(document.getElementById('evaluniaDialogBody')).toBeTruthy();
    expect(document.getElementById('evaluniaDialogFooter')).toBeTruthy();
  });

  test('alert renderiza título, variante inferida, mensaje con salto y botón aceptar', async () => {
    const dialog = loadDialog();

    const promise = dialog.alert('✅ Guardado\ncorrectamente', {
      title: 'Resultado'
    });

    const modal = document.getElementById('evaluniaDialogModal');
    expect(modal).toBeTruthy();
    expect(document.getElementById('evaluniaDialogTitle').textContent).toBe('Resultado');
    expect(document.getElementById('evaluniaDialogIcon').className).toContain('bi-check-circle-fill');
    expect(document.getElementById('evaluniaDialogBody').innerHTML).toContain('Guardado<br>correctamente');

    document.querySelector('[data-evalunia-dialog-ok]').click();
    dispatchModalEvent('hidden.bs.modal');

    await expect(promise).resolves.toBeUndefined();
  });

  test('confirm devuelve true al confirmar y usa estilo danger cuando corresponde', async () => {
    const dialog = loadDialog();

    const promise = dialog.confirm('Eliminar registro?', {
      variant: 'danger',
      title: 'Confirmar eliminación',
      confirmLabel: 'Sí, eliminar',
      cancelLabel: 'No'
    });

    expect(document.getElementById('evaluniaDialogTitle').textContent).toBe('Confirmar eliminación');
    expect(document.querySelector('[data-evalunia-dialog-confirm]').textContent).toContain('Sí, eliminar');
    expect(document.querySelector('[data-evalunia-dialog-confirm]').className).toContain('btn-danger');

    document.querySelector('[data-evalunia-dialog-confirm]').click();

    await expect(promise).resolves.toBe(true);
  });

  test('confirm devuelve false al cancelar', async () => {
    const dialog = loadDialog();

    const promise = dialog.confirm('Salir sin guardar?', {
      variant: 'warning',
      confirmLabel: 'Salir',
      cancelLabel: 'Volver'
    });

    document.querySelector('[data-evalunia-dialog-cancel]').click();

    await expect(promise).resolves.toBe(false);
  });

  test('choose devuelve el valor seleccionado y sanea iconos inválidos', async () => {
    const dialog = loadDialog();

    const promise = dialog.choose('Seleccione formato', {
      title: 'Exportar',
      actions: [
        { value: 'pdf', label: 'PDF', icon: 'bi-file-earmark-pdf', className: 'btn-primary' },
        { value: 'word', label: 'Word', icon: 'javascript:alert(1)', className: 'btn-outline-primary' }
      ],
      cancelLabel: 'Cancelar'
    });

    expect(document.getElementById('evaluniaDialogTitle').textContent).toBe('Exportar');
    expect(document.querySelectorAll('[data-evalunia-dialog-choice]')).toHaveLength(2);
    expect(document.querySelector('.bi-file-earmark-pdf')).toBeTruthy();
    expect(document.querySelector('.javascript\\:alert\\(1\\)')).toBeFalsy();

    document.querySelector('[data-evalunia-dialog-choice="pdf"]').click();

    await expect(promise).resolves.toBe('pdf');
  });

  test('choose sin acciones devuelve null', async () => {
    const dialog = loadDialog();
    await expect(dialog.choose('Sin opciones', { actions: [] })).resolves.toBeNull();
  });

  test('usa alert, confirm y prompt nativos cuando Bootstrap no está disponible', async () => {
    const dialog = loadDialog();

    window.bootstrap = null;
    global.bootstrap = null;
    window.alert = jest.fn();
    window.confirm = jest.fn(() => false);
    window.prompt = jest.fn(() => 'manual');

    await expect(dialog.alert('Mensaje simple')).resolves.toBeUndefined();
    expect(window.alert).toHaveBeenCalledWith('Mensaje simple');

    await expect(dialog.confirm('Confirmar?')).resolves.toBe(false);
    expect(window.confirm).toHaveBeenCalledWith('Confirmar?');

    await expect(dialog.choose('Elige')).resolves.toBe('manual');
    expect(window.prompt).toHaveBeenCalled();
  });
});

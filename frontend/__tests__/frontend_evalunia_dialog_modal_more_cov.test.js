const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

function eventOf(type) {
  const ev = document.createEvent('Event');
  ev.initEvent(type, true, true);
  return ev;
}

async function flush(times = 6) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function loadDialog() {
  createDomFromHtml('frontend/index.html');
  window.requestAnimationFrame = global.requestAnimationFrame = (cb) => { if (typeof cb === 'function') cb(); return 1; };

  const instances = [];
  window.bootstrap = {
    Modal: {
      getOrCreateInstance: jest.fn(() => {
        const inst = {
          show: jest.fn(() => {
            const modal = document.getElementById('evaluniaDialogModal');
            if (modal) modal.dispatchEvent(eventOf('show.bs.modal'));
          }),
          hide: jest.fn(() => {
            const modal = document.getElementById('evaluniaDialogModal');
            if (modal) modal.dispatchEvent(eventOf('hidden.bs.modal'));
          })
        };
        instances.push(inst);
        return inst;
      })
    }
  };
  global.bootstrap = window.bootstrap;
  requireFresh('frontend/js/evalunia-dialog.js');
  return instances;
}

describe('evalunia-dialog.js ramas modales adicionales', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('alert con prefijos y backdrop cubre normalizacion de variante y z-index apilado', async () => {
    loadDialog();
    document.body.insertAdjacentHTML('beforeend', '<div class="modal show"></div><div class="modal-backdrop"></div>');

    const p = window.EvaluniaDialog.alert('❌ Error controlado', { title: 'Titulo propio' });
    await flush(2);

    const modal = document.getElementById('evaluniaDialogModal');
    expect(modal.style.zIndex).not.toBe('');
    expect(document.getElementById('evaluniaDialogBody').innerHTML).toContain('Error controlado');
    expect(document.getElementById('evaluniaDialogIcon').className).toContain('danger');

    modal.querySelector('[data-evalunia-dialog-ok]').dispatchEvent(eventOf('click'));
    await p;
  });

  test('confirm peligroso, cancelar y cierre hidden devuelven false sin romper', async () => {
    loadDialog();
    const p = window.EvaluniaDialog.confirm('¿Eliminar?', {
      variant: 'danger',
      dangerous: true,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Volver'
    });
    await flush(2);

    const modal = document.getElementById('evaluniaDialogModal');
    expect(modal.querySelector('[data-evalunia-dialog-confirm]').className).toContain('btn-danger');
    modal.querySelector('[data-evalunia-dialog-cancel]').dispatchEvent(eventOf('click'));
    const result = await p;
    expect(result).toBe(false);
  });

  test('choose con cancelar visible resuelve null y limpia clase de modo choice', async () => {
    loadDialog();
    const p = window.EvaluniaDialog.choose('Elige formato', {
      actions: [{ value: 'pdf', label: 'PDF', icon: 'bi-file-earmark-pdf' }],
      cancelLabel: 'Cancelar'
    });
    await flush(2);

    const modal = document.getElementById('evaluniaDialogModal');
    expect(modal.classList.contains('evalunia-dialog-modal--choice')).toBe(true);
    modal.querySelector('[data-evalunia-dialog-cancel]').dispatchEvent(eventOf('click'));
    const result = await p;
    expect(result).toBeNull();
    expect(modal.classList.contains('evalunia-dialog-modal--choice')).toBe(false);
  });
});

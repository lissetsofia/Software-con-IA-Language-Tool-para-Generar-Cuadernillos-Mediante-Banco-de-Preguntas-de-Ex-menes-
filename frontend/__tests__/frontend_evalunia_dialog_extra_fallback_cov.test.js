const { createDomFromHtml, requireFresh } = require('./helpers/setupFrontendTests');

async function flush(times = 6) {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

function eventOf(type) {
  const ev = document.createEvent('Event');
  ev.initEvent(type, true, true);
  return ev;
}

function loadDialogWithoutBootstrap() {
  createDomFromHtml('frontend/index.html');
  delete window.bootstrap;
  delete global.bootstrap;
  window.alert = jest.fn();
  window.confirm = jest.fn(() => true);
  window.prompt = jest.fn(() => 'opcion');
  global.alert = window.alert;
  global.confirm = window.confirm;
  global.prompt = window.prompt;
  requireFresh('frontend/js/evalunia-dialog.js');
}

function loadDialogWithBootstrap() {
  createDomFromHtml('frontend/index.html');
  const instances = [];
  const modalFactory = () => {
    const inst = {
      show: jest.fn(function () {
        const modal = document.getElementById('evaluniaDialogModal');
        if (modal) modal.dispatchEvent(eventOf('show.bs.modal'));
      }),
      hide: jest.fn(function () {
        const modal = document.getElementById('evaluniaDialogModal');
        if (modal) modal.dispatchEvent(eventOf('hidden.bs.modal'));
      })
    };
    instances.push(inst);
    return inst;
  };
  window.bootstrap = {
    Modal: {
      getOrCreateInstance: jest.fn(() => modalFactory())
    }
  };
  global.bootstrap = window.bootstrap;
  requireFresh('frontend/js/evalunia-dialog.js');
  return instances;
}

describe('evalunia-dialog.js ramas extra fallback y choice', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('fallback sin Bootstrap usa alert confirm y prompt nativos', async () => {
    loadDialogWithoutBootstrap();

    await window.EvaluniaDialog.alert('✅ Operación lista');
    const ok = await window.EvaluniaDialog.confirm('¿Confirmar?');
    const pick = await window.EvaluniaDialog.choose('Elige');

    expect(window.alert).toHaveBeenCalled();
    expect(ok).toBe(true);
    expect(pick).toBe('opcion');
  });

  test('choose sin acciones retorna null y choose con icono inseguro lo sanea', async () => {
    loadDialogWithBootstrap();

    const empty = await window.EvaluniaDialog.choose('Nada', { actions: [] });
    expect(empty).toBeNull();

    const promise = window.EvaluniaDialog.choose('Selecciona', {
      title: 'Opciones',
      variant: 'success',
      cancelLabel: false,
      actions: [
        { value: 'word', label: 'Word', icon: 'bi-file-earmark-word' },
        { value: 'bad', label: '<script>', icon: 'bi-x bad' }
      ]
    });
    await flush(2);

    const modal = document.getElementById('evaluniaDialogModal');
    expect(modal.innerHTML).toContain('bi-file-earmark-word');
    expect(modal.innerHTML).not.toContain('bi-x bad');
    const btn = modal.querySelector('[data-evalunia-dialog-choice="word"]');
    btn.dispatchEvent(eventOf('click'));
    const chosen = await promise;
    expect(chosen).toBe('word');
  });
});

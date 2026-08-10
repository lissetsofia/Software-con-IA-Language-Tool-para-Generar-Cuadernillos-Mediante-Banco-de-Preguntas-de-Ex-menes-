const {
  createDomFromHtml,
  requireFresh
} = require('./helpers/setupFrontendTests');

function installDomJQuery() {
  class JQ {
    constructor(elements) {
      this.elements = elements.filter(Boolean);
      this.length = this.elements.length;
      this.elements.forEach((el, idx) => { this[idx] = el; });
    }

    find(selector) {
      const found = [];
      this.elements.forEach((el) => found.push(...el.querySelectorAll(selector)));
      return new JQ(found);
    }

    first() {
      return new JQ(this.elements.length ? [this.elements[0]] : []);
    }

    addClass(className) {
      String(className || '').split(/\s+/).filter(Boolean).forEach((cls) => {
        this.elements.forEach((el) => el.classList.add(cls));
      });
      return this;
    }

    detach() {
      this.elements.forEach((el) => el.parentNode?.removeChild(el));
      return this;
    }

    appendTo(target) {
      const dest = target instanceof JQ ? target.elements[0] : typeof target === 'string' ? document.querySelector(target) : target;
      if (dest) this.elements.forEach((el) => dest.appendChild(el));
      return this;
    }

    append(...items) {
      this.elements.forEach((parent) => {
        items.forEach((item) => {
          if (item instanceof JQ) {
            item.elements.forEach((el) => parent.appendChild(el));
          } else if (item instanceof window.Element) {
            parent.appendChild(item);
          } else if (typeof item === 'string') {
            parent.insertAdjacentHTML('beforeend', item);
          }
        });
      });
      return this;
    }

    prepend(item) {
      this.elements.forEach((parent) => {
        if (item instanceof JQ) {
          [...item.elements].reverse().forEach((el) => parent.insertBefore(el, parent.firstChild));
        } else if (item instanceof window.Element) {
          parent.insertBefore(item, parent.firstChild);
        } else if (typeof item === 'string') {
          parent.insertAdjacentHTML('afterbegin', item);
        }
      });
      return this;
    }

    remove() {
      this.elements.forEach((el) => el.parentNode?.removeChild(el));
      return this;
    }

    empty() {
      this.elements.forEach((el) => { el.innerHTML = ''; });
      return this;
    }

    attr(name, value) {
      if (typeof name === 'object') {
        Object.entries(name).forEach(([k, v]) => this.attr(k, v));
        return this;
      }
      if (value === undefined) return this.elements[0]?.getAttribute(name);
      this.elements.forEach((el) => el.setAttribute(name, value));
      return this;
    }

    closest(selector) {
      const closest = [];
      this.elements.forEach((el) => {
        const found = el.closest(selector);
        if (found && !closest.includes(found)) closest.push(found);
      });
      return new JQ(closest);
    }

    before(item) {
      this.elements.forEach((target) => {
        const source = item instanceof JQ ? item.elements : [item];
        source.filter(Boolean).forEach((el) => target.parentNode?.insertBefore(el, target));
      });
      return this;
    }

    DataTable(...args) {
      return jq.fn.DataTable.apply(this, args);
    }
  }

  function jq(input) {
    if (input instanceof JQ) return input;
    if (input instanceof window.Element || input === window || input === document) return new JQ([input]);
    if (Array.isArray(input)) return new JQ(input);
    if (typeof input === 'string') {
      if (input.trim().startsWith('<')) {
        const tpl = document.createElement('template');
        tpl.innerHTML = input.trim();
        return new JQ([...tpl.content.children]);
      }
      return new JQ([...document.querySelectorAll(input)]);
    }
    return new JQ([]);
  }

  jq.fn = JQ.prototype;
  jq.fn.DataTable = jest.fn(() => ({
    clear: jest.fn(function clear() { return this; }),
    destroy: jest.fn(function destroy() { return this; })
  }));
  jq.fn.DataTable.isDataTable = jest.fn(() => false);

  window.$ = window.jQuery = global.$ = global.jQuery = jq;
  return jq;
}

function loadTemario() {
  createDomFromHtml('frontend/index.html');
  installDomJQuery();
  requireFresh('frontend/js/temario_modal.js');
  expect(window.EvaluniaTemarioModal).toBeTruthy();
  return window.EvaluniaTemarioModal;
}

describe('temario_modal.js toolbar DataTables extra', () => {
  test('wireToolbar reubica toolbar, normaliza selector de filas y buscador', () => {
    const api = loadTemario();

    document.body.innerHTML = `
      <div id="temarioDtToolbarHost"></div>
      <div id="dt-container">
        <div class="mbanco-dt-toolbar">
          <div class="dt-length">
            <label>Mostrar</label>
            <select><option value="8">8</option></select>
          </div>
          <div class="dt-search">
            <label>Buscar</label>
            <input type="search" value="">
          </div>
        </div>
        <table id="tabla-temas"><tbody></tbody></table>
      </div>
    `;

    const fakeApi = {
      table: () => ({
        container: () => document.getElementById('dt-container')
      })
    };

    expect(() => api.wireToolbar(fakeApi, {
      hostSelector: '#temarioDtToolbarHost',
      lengthId: 'temarioLengthExtra',
      searchId: 'temarioSearchExtra',
      searchPlaceholder: 'Buscar tema completo…'
    })).not.toThrow();

    const host = document.getElementById('temarioDtToolbarHost');
    expect(host.querySelector('.mbanco-dt-toolbar')).toBeTruthy();
    expect(host.querySelector('#temarioLengthExtra')).toBeTruthy();
    expect(host.querySelector('label[for="temarioLengthExtra"]').textContent).toContain('Filas');
    expect(host.querySelector('#temarioSearchExtra')).toBeTruthy();
    expect(host.querySelector('#temarioSearchExtra').getAttribute('placeholder')).toBe('Buscar tema completo…');
    expect(host.querySelector('.input-group')).toBeTruthy();
  });

  test('wireToolbar tolera host ausente, controles ausentes y mantiene ejecución sin romper', () => {
    const api = loadTemario();

    document.body.innerHTML = `
      <div id="dt-container">
        <div class="mbanco-dt-toolbar"></div>
        <table id="tabla-temas"></table>
      </div>
    `;

    const fakeApi = {
      table: () => ({
        container: () => document.getElementById('dt-container')
      })
    };

    expect(() => api.wireToolbar(fakeApi, {
      hostSelector: '#no-existe',
      lengthId: 'lenNoHost',
      searchId: 'searchNoHost',
      searchPlaceholder: 'Nada'
    })).not.toThrow();
  });

  test('destroy limpia host y tolera wrappers sin depender del mock DataTable', () => {
    const api = loadTemario();

    document.body.innerHTML = `
      <div id="temarioDtToolbarHost"><span>toolbar</span></div>
      <div class="dataTables_wrapper">
        <div class="dt-container">
          <table id="tabla-temas"><thead><tr><th>Old</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
        </div>
      </div>
    `;

    expect(() => api.destroy('#tabla-temas', 'temarioDtToolbarHost')).not.toThrow();
    expect(document.getElementById('temarioDtToolbarHost').children).toHaveLength(0);
    expect(document.getElementById('tabla-temas')).toBeTruthy();

    expect(() => api.destroy('#tabla-no-existe', 'temarioDtToolbarHost')).not.toThrow();
  });
});

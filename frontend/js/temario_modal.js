/**
 * DataTable + toolbar compartidos para el modal #modalTemas
 * (Generación y Cuadernillos).
 */
(function (global) {
  const $ = global.jQuery;
  if (!$ || !$.fn || !$.fn.DataTable) return;

  const TOOLBAR_HOST_ID = "temarioDtToolbarHost";

  function wireTemarioDataTableToolbar(api, opts) {
    const {
      hostSelector = "#" + TOOLBAR_HOST_ID,
      lengthId = "temarioDtLength",
      searchId = "temarioDtSearch",
      searchPlaceholder = "Buscar…",
    } = opts || {};

    const $wrap = $(api.table().container());
    $wrap.addClass("mbanco-dt-wrap");
    const $toolbar = $wrap.find(".mbanco-dt-toolbar").first();
    const $host = $(hostSelector);
    if ($host.length && $toolbar.length) {
      $toolbar.detach().appendTo($host);
    }

    const findCtl = (sel) => {
      let $el = $host.find(sel);
      if (!$el.length) $el = $toolbar.find(sel);
      if (!$el.length) $el = $wrap.find(sel);
      return $el;
    };

    const $length = findCtl(".dt-length, .dataTables_length");
    const $lenSelect = $length.find("select").first().detach();
    if ($lenSelect.length && $length.length) {
      $length.addClass("mbanco-toolbar-field mbanco-toolbar-field--length");
      $length.find("label").remove();
      $lenSelect.addClass("form-select mbanco-length-select");
      $lenSelect.attr("id", lengthId);
      $length.find(".mbanco-toolbar-block-label--length").remove();
      $length.prepend(
        `<label class="form-label mbanco-toolbar-block-label mbanco-toolbar-block-label--length" for="${lengthId}">Filas por página</label>`
      );
      $("<div>")
        .addClass("mbanco-length-wrap")
        .append($lenSelect)
        .appendTo($length);
    }

    const $fil = findCtl(".dt-search, .dataTables_filter");
    const $inp = $fil.find("input[type=search], input").first().detach();
    if ($inp.length && $fil.length) {
      $fil.empty();
      $fil.addClass(
        "mbanco-filter-wrap mbanco-toolbar-field mbanco-toolbar-field--search"
      );
      $fil.prepend(
        `<label class="form-label mbanco-toolbar-block-label mbanco-toolbar-block-label--search" for="${searchId}">Buscar en la tabla</label>`
      );
      $inp.attr({
        id: searchId,
        type: "search",
        placeholder: searchPlaceholder,
        autocomplete: "off",
      });
      $inp.addClass("form-control mbanco-search-input flex-grow-1");
      const $ig = $(
        '<div class="input-group mbanco-search-ig align-items-stretch"></div>'
      );
      $ig.append(
        '<span class="input-group-text mbanco-search-prefix" aria-hidden="true"><i class="bi bi-search"></i></span>',
        $inp
      );
      $("<div>")
        .addClass("mbanco-filter-label")
        .append($ig)
        .appendTo($fil);
    }
  }

  function destroy(tableSelector, hostId) {
    const hid = hostId || TOOLBAR_HOST_ID;
    global.document.getElementById(hid)?.replaceChildren();

    const t = global.document.querySelector(tableSelector || "#tabla-temas");
    if (!t) return;

    const $t = $(t);
    if ($.fn.DataTable.isDataTable(t)) {
      try {
        $t.DataTable().clear().destroy();
      } catch (_) {}
    }

    for (;;) {
      const $w = $t.closest(".dataTables_wrapper, .dt-container");
      if (!$w.length) break;
      $w.before($t);
      $w.remove();
    }
  }

  function rebuildThead(tableEl, options) {
    const includePreguntas = !!(options && options.includePreguntas);
    tableEl.querySelector("thead")?.remove();

    const thead = global.document.createElement("thead");
    thead.className = "table-dark";
    if (includePreguntas) {
      thead.innerHTML = `
    <tr>
      <th class="cuad-temas-th-id text-end">ID</th>
      <th>Nombre</th>
      <th class="text-center">Preguntas</th>
      <th class="text-center cuad-temas-th-estado">Estado</th>
      <th class="text-end cuad-temas-th-actions" style="width:1%">Acciones</th>
    </tr>`;
    } else {
      thead.innerHTML = `
    <tr>
      <th class="cuad-temas-th-id text-end">ID</th>
      <th>Nombre</th>
      <th class="text-center cuad-temas-th-estado">Estado</th>
      <th class="text-end cuad-temas-th-actions" style="width:1%">Acciones</th>
    </tr>`;
    }
    tableEl.prepend(thead);

    const tb = tableEl.querySelector("tbody") || global.document.createElement("tbody");
    tb.innerHTML = "";
    if (!tb.parentElement) tableEl.appendChild(tb);
  }

  function badgeHtml(v) {
    return v
      ? '<span class="temario-estado-badge temario-estado-badge--activo">Activo</span>'
      : '<span class="temario-estado-badge temario-estado-badge--inactivo">Inactivo</span>';
  }

  function accionesColumn(includePreguntas) {
    const render = (row) => {
      const toggleTxt = row.activo ? "Deshabilitar" : "Habilitar";
      const toggleOutline = row.activo
        ? "btn-outline-secondary"
        : "btn-outline-success";
      const nom = String(row.nombre ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
      const toggleIcon = row.activo ? "bi-slash-circle" : "bi-check-circle";
      return `
            <div class="temario-row-actions" role="group">
              <button type="button" class="btn btn-outline-primary btn-sm btn-editar-tema"
                      data-id="${row.id}" data-nombre="${nom}">
                <i class="bi bi-pencil" aria-hidden="true"></i>
                <span>Editar</span>
              </button>
              <button type="button" class="btn ${toggleOutline} btn-sm btn-toggle-tema"
                      data-id="${row.id}">
                <i class="bi ${toggleIcon}" aria-hidden="true"></i>
                <span>${toggleTxt}</span>
              </button>
            </div>`;
    };

    if (includePreguntas) {
      return {
        data: null,
        orderable: false,
        className: "text-end cuad-temas-col-actions cuad-temas-th-actions",
        render,
      };
    }
    return {
      data: null,
      title: "Acciones",
      orderable: false,
      className: "text-end cuad-temas-col-actions cuad-temas-th-actions",
      render,
    };
  }

  function buildColumns(includePreguntas) {
    const cols = [];
    if (includePreguntas) {
      cols.push(
        {
          data: "id",
          title: "ID",
          className:
            "text-muted text-nowrap text-end cuad-temas-col-id cuad-temas-th-id",
        },
        {
          data: "nombre",
          title: "Nombre",
          className: "cuad-temas-col-nombre",
        },
        {
          data: "n_preguntas",
          title: "Preguntas",
          className: "text-center",
        },
        {
          data: "activo",
          title: "Estado",
          className:
            "text-nowrap text-center cuad-temas-col-estado cuad-temas-th-estado",
          render: (v) => badgeHtml(v),
        }
      );
    } else {
      cols.push(
        {
          data: "id",
          title: "ID",
          className:
            "text-muted text-nowrap text-end cuad-temas-col-id cuad-temas-th-id",
        },
        {
          data: "nombre",
          title: "Nombre",
          className: "cuad-temas-col-nombre",
        },
        {
          data: "activo",
          title: "Estado",
          className:
            "text-nowrap text-center cuad-temas-col-estado cuad-temas-th-estado",
          render: (v) => badgeHtml(v),
        }
      );
    }
    cols.push(accionesColumn(includePreguntas));
    return cols;
  }

  function columnDefsForMode(includePreguntas) {
    const accionesIdx = includePreguntas ? 4 : 3;
    return [
      { targets: 0, width: "4.35rem" },
      { targets: accionesIdx, width: "16rem", minWidth: "14.75rem" },
    ];
  }

  const DT_DOM =
    "<'mbanco-dt-toolbar mbanco-dt-toolbar--row'lf>rt<'mbanco-dt-bottom d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2'ip>";

  const LENGTH_MENU = [
    [8, 12, 20, 50, -1],
    [8, 12, 20, 50, "Todos"],
  ];

  function buildLanguage(searchPlaceholder) {
    return {
      ...(global.DT_ES || {}),
      search: "",
      searchPlaceholder: searchPlaceholder || "Buscar…",
      lengthMenu: "_MENU_",
      zeroRecords: "No se encontraron resultados",
      info: "_START_–_END_ de _TOTAL_",
      infoEmpty: "0 temas",
      infoFiltered: "(de _MAX_)",
      paginate: {
        first: "«",
        last: "»",
        next: "›",
        previous: "‹",
      },
      processing: "Procesando…",
    };
  }

  global.EvaluniaTemarioModal = {
    TOOLBAR_HOST_ID,
    wireToolbar: wireTemarioDataTableToolbar,
    destroy,
    rebuildThead,
    buildColumns,
    columnDefsForMode,
    dom: DT_DOM,
    lengthMenu: LENGTH_MENU,
    language: buildLanguage,
  };

  global.wireTemarioDataTableToolbar = wireTemarioDataTableToolbar;
})(typeof window !== "undefined" ? window : this);

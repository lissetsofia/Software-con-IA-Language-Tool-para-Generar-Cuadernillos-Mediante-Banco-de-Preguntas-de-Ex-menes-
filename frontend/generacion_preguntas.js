// Último examen generado: URLs y nombres para guardar / enlaces
window.__ultimoGenerado = {
  docxUrl: null,
  pdfUrl: null,
  docxName: null,
  pdfName: null,
};

if (window.__GENERACION_PREGUNTAS_LOADED__) {
  console.warn("generacion_preguntas.js ya estaba cargado; omito segunda ejecución");
  throw new Error("STOP_DUP_GENERACION_PREGUNTAS");
} else {
  window.__GENERACION_PREGUNTAS_LOADED__ = true;
}

function generarNuevoExamen() {
  const el = document.getElementById("modal-examen");
  if (!el) return;
  if (el.parentElement !== document.body) {
    document.body.appendChild(el);
  }
  bootstrap.Modal.getOrCreateInstance(el, {
    backdrop: "static",
    focus: true,
    keyboard: false,
  }).show();
}

function cerrarModalExamen() {
  const el = document.getElementById("modal-examen");
  if (!el) return;
  const inst = bootstrap.Modal.getInstance(el);
  if (inst) inst.hide();
}

function genExamenBannerHtml(kind, msg) {
  const icons = {
    success: "bi-check-circle-fill",
    danger: "bi-exclamation-octagon-fill",
    warning: "bi-exclamation-triangle-fill",
    info: "bi-info-circle-fill",
  };
  const ic = icons[kind] || icons.info;
  return `<span class="gen-modal-examen-alert__inner"><i class="bi ${ic} gen-modal-examen-alert__icon" aria-hidden="true"></i><span class="gen-modal-examen-alert__text">${msg}</span></span>`;
}

function applyGenExamenBanner(el, kind, msg) {
  el.className = `gen-modal-examen-alert alert alert-${kind}`;
  el.setAttribute("role", "alert");
  el.innerHTML = genExamenBannerHtml(kind, msg);
}

const GEN_EXAMEN_HINT_SELECCION_VISTO_KEY = "evalunia_genExamen_seleccionHint_visto";
const GEN_EXAMEN_MSG_SUCCESS_MS = 2800;
const GEN_EXAMEN_MSG_COLLAPSE_MS = 380;
const genExamenAvisoTimers = { successHide: null, successCollapse: null };

function getGenExamenMensajeEl() {
  return document.getElementById("gen-examen-seleccion-hint");
}

function clearGenExamenAvisoTimers() {
  if (genExamenAvisoTimers.successHide) {
    clearTimeout(genExamenAvisoTimers.successHide);
    genExamenAvisoTimers.successHide = null;
  }
  if (genExamenAvisoTimers.successCollapse) {
    clearTimeout(genExamenAvisoTimers.successCollapse);
    genExamenAvisoTimers.successCollapse = null;
  }
}

function setGenExamenMensajeModal(msg, kind = "info") {
  const el = getGenExamenMensajeEl();
  if (!el) return;
  clearGenExamenAvisoTimers();
  el.classList.remove("d-none", "gen-modal-examen-alert--hiding");
  applyGenExamenBanner(el, kind, msg);
  el.classList.add("flex-shrink-0");
  const live = kind === "danger" || kind === "warning" ? "assertive" : "polite";
  el.setAttribute("aria-live", live);
  el.setAttribute("role", kind === "danger" || kind === "warning" ? "alert" : "status");

  if (kind === "success") {
    genExamenAvisoTimers.successHide = setTimeout(() => {
      el.classList.add("gen-modal-examen-alert--hiding");
      genExamenAvisoTimers.successHide = null;
      genExamenAvisoTimers.successCollapse = setTimeout(() => {
        el.classList.remove("gen-modal-examen-alert--hiding");
        el.classList.add("d-none");
        genExamenAvisoTimers.successCollapse = null;
        actualizarGenExamenHintSeleccionGrupo();
      }, GEN_EXAMEN_MSG_COLLAPSE_MS);
    }, GEN_EXAMEN_MSG_SUCCESS_MS);
  }
}

function escapeHtmlGenExamen(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function actualizarGenExamenHintSeleccionGrupo() {
  const modal = document.getElementById("modal-examen");
  const hint = getGenExamenMensajeEl();
  if (!hint) return;

  if (!modal?.classList.contains("show")) {
    hint.classList.add("d-none");
    return;
  }

  clearGenExamenAvisoTimers();
  hint.classList.remove("gen-modal-examen-alert--hiding");

  const sel = window.grupoSeleccionado;
  if (sel?.id) {
    const clave = escapeHtmlGenExamen(sel.clave);
    applyGenExamenBanner(
      hint,
      "success",
      `Grupo <b>${clave}</b> seleccionado. Pulsa <b>Generar</b> para crear el examen.`
    );
    hint.classList.add("flex-shrink-0");
    hint.setAttribute("role", "status");
    hint.setAttribute("aria-live", "polite");
    hint.classList.remove("d-none");
    return;
  }

  if (sessionStorage.getItem(GEN_EXAMEN_HINT_SELECCION_VISTO_KEY) === "1") {
    hint.classList.add("d-none");
    return;
  }

  applyGenExamenBanner(
    hint,
    "info",
    "Selecciona un grupo en el panel izquierdo para poder generar el examen."
  );
  hint.classList.add("flex-shrink-0");
  hint.setAttribute("role", "status");
  hint.setAttribute("aria-live", "polite");
  hint.classList.remove("d-none");
}

document.getElementById("modal-examen")?.addEventListener("shown.bs.modal", () => {
  actualizarGenExamenHintSeleccionGrupo();
});

function resetFlujoAvisosModalExamen() {
  clearGenExamenAvisoTimers();
  window.grupoSeleccionado = null;
  sessionStorage.removeItem(GEN_EXAMEN_HINT_SELECCION_VISTO_KEY);
  const hint = getGenExamenMensajeEl();
  if (hint) {
    hint.classList.remove("gen-modal-examen-alert--hiding");
    hint.classList.add("d-none");
  }
  document.querySelector("#modal-examen #banner-estado")?.remove();
  if (typeof renderGruposLeftPanel === "function") {
    void renderGruposLeftPanel();
  }
}

/** Z-index y backdrops con varios modales (alineado con cuadernillos.js). */
const EVALUNIA_DIALOG_MODAL_ID = "evaluniaDialogModal";

function repararEstadoModales() {
  const allShown = [...document.querySelectorAll(".modal.show")];
  let backdrops = [...document.querySelectorAll(".modal-backdrop")];

  if (!allShown.length) {
    backdrops.forEach((b) => b.remove());
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("padding-right");
    return;
  }

  document.body.classList.add("modal-open");
  document.body.style.removeProperty("padding-right");

  allShown.forEach((m) => {
    m.removeAttribute("aria-hidden");
    m.setAttribute("aria-modal", "true");
  });

  while (backdrops.length > allShown.length) {
    const b = backdrops.shift();
    b?.remove();
  }

  backdrops = [...document.querySelectorAll(".modal-backdrop")];

  let focusTarget = allShown[allShown.length - 1];

  if (allShown.length === 1) {
    allShown[0].style.removeProperty("z-index");
    backdrops.forEach((b) => {
      b.style.removeProperty("z-index");
      b.style.pointerEvents = "auto";
    });
  } else {
    const cuadStack = allShown.filter((m) => m.id !== EVALUNIA_DIALOG_MODAL_ID);
    cuadStack.sort((a, b) => {
      const ta = parseInt(a.dataset.cuadZStackTs || "0", 10);
      const tb = parseInt(b.dataset.cuadZStackTs || "0", 10);
      if (ta !== tb) return ta - tb;
      const bit = a.compareDocumentPosition(b);
      if (bit & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (bit & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    allShown.forEach((m) => m.style.removeProperty("z-index"));
    backdrops.forEach((b) => b.style.removeProperty("z-index"));

    // Escalera +10 como en cuadernillos.js / index.css
    cuadStack.forEach((m, i) => {
      m.style.zIndex = String(1055 + i * 10);
    });
    backdrops.forEach((b, i) => {
      b.style.zIndex = String(1050 + i * 10);
    });

    const evaluniaEl = document.getElementById(EVALUNIA_DIALOG_MODAL_ID);
    if (evaluniaEl && evaluniaEl.classList.contains("show")) {
      const shown = allShown.length;
      const base = 1055 + shown * 30;
      evaluniaEl.style.zIndex = String(base + 25);
      const lastBd = backdrops[backdrops.length - 1];
      if (lastBd) lastBd.style.zIndex = String(base + 15);
    }

    backdrops.forEach((b, i) => {
      b.style.pointerEvents = i === backdrops.length - 1 ? "auto" : "none";
    });

    const evaluniaOpen =
      document.getElementById(EVALUNIA_DIALOG_MODAL_ID)?.classList.contains("show");
    if (evaluniaOpen) {
      focusTarget = document.getElementById(EVALUNIA_DIALOG_MODAL_ID);
    } else if (cuadStack.length) {
      focusTarget = cuadStack[cuadStack.length - 1];
    }
  }

  setTimeout(() => {
    focusTarget
      ?.querySelector(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
      )
      ?.focus();
  }, 0);
}

if (!window.__evaluniaBsModalStackListeners) {
  window.__evaluniaBsModalStackListeners = true;
  document.addEventListener("shown.bs.modal", (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLElement) || !el.classList.contains("modal")) return;
    el.dataset.cuadZStackTs = String(Date.now());
    requestAnimationFrame(() => repararEstadoModales());
  });
  document.addEventListener("hidden.bs.modal", (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLElement) || !el.classList.contains("modal")) return;
    requestAnimationFrame(() => repararEstadoModales());
  });
}

function uiAlert(msg, opts) {
  const p =
    window.EvaluniaDialog && typeof window.EvaluniaDialog.alert === "function"
      ? window.EvaluniaDialog.alert(msg, opts || {})
      : Promise.resolve(window.alert(msg));
  return p.then(() => {
    setTimeout(repararEstadoModales, 0);
  });
}

function uiConfirm(msg, opts) {
  if (
    window.EvaluniaDialog &&
    typeof window.EvaluniaDialog.confirm === "function"
  ) {
    return window.EvaluniaDialog.confirm(msg, opts || {}).then((ok) => {
      setTimeout(repararEstadoModales, 0);
      return ok;
    });
  }
  const ok = window.confirm(msg);
  setTimeout(repararEstadoModales, 0);
  return Promise.resolve(ok);
}

function uiChoose(msg, opts) {
  if (
    window.EvaluniaDialog &&
    typeof window.EvaluniaDialog.choose === "function"
  ) {
    return window.EvaluniaDialog.choose(msg, opts || {}).then((value) => {
      setTimeout(repararEstadoModales, 0);
      return value;
    });
  }
  setTimeout(repararEstadoModales, 0);
  return Promise.resolve(null);
}

window.addEventListener("focus", () => {
  setTimeout(repararEstadoModales, 0);
});

/** Saca #tabla-examenes del wrapper DataTables (como #tabla-temas). */
function destroyDtWrappersExamenes() {
  const host = document.getElementById("bancoExamenesDtToolbarHost");
  if (host) host.replaceChildren();

  const t = document.querySelector("#tabla-examenes");
  if (!t) return;

  const $t = $(t);

  if ($.fn.DataTable.isDataTable(t)) {
    try {
      $t.DataTable().clear().destroy();
    } catch (e) {
      console.warn("[Examenes] destroy error:", e);
    }
  }

  for (;;) {
    const $w = $t.closest(".dataTables_wrapper, .dt-container");
    if (!$w.length) break;
    $w.before($t);
    $w.remove();
  }

  t.querySelector("thead")?.remove();

  const thead = document.createElement("thead");
  thead.className = "table-dark";
  thead.innerHTML = `
    <tr>
      <th class="banco-examenes-th-nombre">Nombre</th>
      <th class="text-end text-nowrap banco-examenes-th-numero">Número</th>
      <th class="banco-examenes-th-institucion">Institución</th>
      <th class="text-center text-nowrap banco-examenes-th-anio">Año</th>
      <th class="text-end text-nowrap banco-examenes-th-actions">Acciones</th>
    </tr>
  `;
  t.prepend(thead);

  const tb = t.querySelector("tbody") || document.createElement("tbody");
  tb.innerHTML = "";
  if (!tb.parentElement) t.appendChild(tb);
}

async function cargarExamenes() {
  try {
    const res = await fetch("http://localhost:5050/api/examenes");
    const examenes = await res.json();
    console.log("📄 Datos cargados:", examenes);

    const tabla = $("#tabla-examenes");
    if (!tabla.length) {
      console.error("❌ No se encontró la tabla con id #tabla-examenes");
      return;
    }

    destroyDtWrappersExamenes();

    tabla.DataTable({
      data: examenes,
      destroy: true,
      autoWidth: false,
      responsive: false,
      pageLength: 12,
      lengthMenu: [
        [8, 12, 20, 50, -1],
        [8, 12, 20, 50, "Todos"],
      ],
      dom: "<'banco-exam-dt-toolbar banco-exam-dt-toolbar--row'lf>rt<'banco-exam-dt-bottom d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2'ip>",
      columnDefs: [
        { targets: 0, width: "26%" },
        { targets: 1, width: "9%" },
        { targets: 2, width: "26%" },
        { targets: 3, width: "7%" },
        { targets: 4, width: "32%", orderable: false },
      ],
      columns: [
        {
          data: "nombre",
          className: "banco-examenes-col-nombre",
        },
        {
          data: "numero",
          className: "text-end text-nowrap banco-examenes-col-numero",
        },
        {
          data: "institucion",
          className: "banco-examenes-col-institucion",
        },
        {
          data: "anio",
          className: "text-center text-nowrap banco-examenes-col-anio",
        },
        {
          data: null,
          orderable: false,
          searchable: false,
          className: "text-end banco-examenes-col-actions",
          render: function (data, type, row) {
            const id = row.idexamenes;
            return `
<div class="btn-group btn-group-sm banco-examenes-actions-group" role="group">
  <button type="button" class="btn btn-primary btn-buscar d-inline-flex align-items-center gap-1" data-id="${id}">
    <i class="bi bi-mortarboard-fill" aria-hidden="true"></i>
    Cursos
  </button>
  <button type="button" class="btn btn-success d-inline-flex align-items-center gap-1" onclick="abrirModalExportar(${id})">
    <i class="bi bi-download" aria-hidden="true"></i>
    Exportar
  </button>
  <button type="button" class="btn btn-danger eliminar-examen d-inline-flex align-items-center gap-1" data-id="${id}">
    <i class="bi bi-trash" aria-hidden="true"></i>
    Eliminar
  </button>
</div>`;
          },
        },
      ],
      language: {
        ...(window.DT_ES || {}),
        search: "",
        searchPlaceholder: "Buscar por nombre, institución o año…",
        lengthMenu: "_MENU_",
        zeroRecords: "No se encontraron resultados",
        info: "_START_–_END_ de _TOTAL_",
        infoEmpty: "0 exámenes",
        infoFiltered: "(de _MAX_)",
        paginate: {
          first: "«",
          last: "»",
          next: "›",
          previous: "‹",
        },
        processing: "Procesando…",
      },
      initComplete: function () {
        const $wrap = $(this.api().table().container());
        $wrap.addClass("banco-exam-dt-wrap");
        const $toolbar = $wrap.find(".banco-exam-dt-toolbar").first();
        const $host = $("#bancoExamenesDtToolbarHost");
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
          $length.addClass(
            "banco-exam-toolbar-field banco-exam-toolbar-field--length"
          );
          $length.find("label").remove();
          $lenSelect.addClass("form-select banco-exam-length-select");
          const lenId =
            $lenSelect.attr("id") || "bancoExamenesDtLengthSelect";
          $lenSelect.attr("id", lenId);
          $length.find(".banco-exam-toolbar-block-label--length").remove();
          $length.prepend(
            `<label class="form-label banco-exam-toolbar-block-label banco-exam-toolbar-block-label--length" for="${lenId}">Filas por página</label>`
          );
          $("<div>")
            .addClass("banco-exam-length-wrap")
            .append($lenSelect)
            .appendTo($length);
        }

        const $fil = findCtl(".dt-search, .dataTables_filter");
        const $inp = $fil.find("input[type=search], input").first().detach();
        if ($inp.length && $fil.length) {
          $fil.empty();
          $fil.addClass(
            "banco-exam-filter-wrap banco-exam-toolbar-field banco-exam-toolbar-field--search"
          );
          const searchId = "bancoExamenesDtSearchInput";
          $fil.prepend(
            `<label class="form-label banco-exam-toolbar-block-label banco-exam-toolbar-block-label--search" for="${searchId}">Buscar en la tabla</label>`
          );
          $inp.attr({
            id: searchId,
            type: "search",
            placeholder: "Nombre, institución o número…",
            autocomplete: "off",
          });
          $inp.addClass("form-control banco-exam-search-input flex-grow-1");
          const $ig = $(
            '<div class="input-group banco-exam-search-ig align-items-stretch"></div>'
          );
          $ig.append(
            '<span class="input-group-text banco-exam-search-prefix" aria-hidden="true"><i class="bi bi-search"></i></span>',
            $inp
          );
          $("<div>")
            .addClass("banco-exam-filter-label")
            .append($ig)
            .appendTo($fil);
        }
      },
    });

    setTimeout(() => {
      try {
        const api = tabla.DataTable();
        api.columns.adjust();
        if (api.responsive && typeof api.responsive.recalc === "function") {
          api.responsive.recalc();
        }
      } catch (e) {
        console.warn("[Examenes] DataTable columns.adjust", e);
      }
    }, 0);
  } catch (error) {
    console.error("❌ Error al cargar exámenes:", error);
  }
}

window.initGeneracionPreguntas = function () {
  console.log("🔁 initGeneracionPreguntas() → recargar tabla y wiring");

  if ($.fn.dataTable && $.fn.dataTable.ext) {
    $.fn.dataTable.ext.errMode = "console";
  }

  cargarExamenes();

  setTimeout(() => {
    try {
      if ($.fn.DataTable.isDataTable("#tabla-examenes")) {
        const api = $("#tabla-examenes").DataTable();
        api.columns.adjust();
        if (api.responsive && typeof api.responsive.recalc === "function") {
          api.responsive.recalc();
        }
      }
    } catch (e) {}
  }, 150);

  const archivo = document.getElementById("archivo");
  const btnImportar = document.getElementById("btnImportar");

  if (archivo && btnImportar && !archivo.dataset.wired) {
    archivo.dataset.wired = "1";
    archivo.addEventListener("change", () => {
      btnImportar.disabled = false;
      const hint = document.getElementById("banco-file-name-display");
      if (hint) {
        hint.textContent = archivo.files[0]
          ? archivo.files[0].name
          : "Ningún archivo seleccionado";
      }
    });
  }
};



$(document).on("click", ".eliminar-examen", async function () {
  const id = $(this).data("id");

  if (
    !(await uiConfirm("¿Estás seguro de eliminar este examen?", {
      variant: "danger",
      title: "Eliminar examen",
      confirmLabel: "Eliminar",
      dangerous: true,
    }))
  ) {
    return;
  }

  try {
    const res = await fetch(`http://localhost:5050/api/examenes/${id}`, {
      method: "DELETE",
    });

    const data = await res.json();
    if (res.ok) {
      await uiAlert("✅ " + data.mensaje);
      cargarExamenes();
    } else {
      await uiAlert("❌ " + (data.error || "Error al eliminar examen"));
    }
  } catch (err) {
    console.error("Error eliminando examen:", err);
    await uiAlert("❌ Error al conectar con el servidor");
  }
});

async function importarExamen() {
  const input = document.getElementById("archivo");
  const archivo = input.files[0];
  const btnImportar = document.getElementById("btnImportar");

  if (!archivo) {
    await uiAlert("Selecciona un archivo primero");
    return;
  }

  const formData = new FormData();
  formData.append("archivo", archivo);

  try {
    const res = await fetch("http://localhost:5050/api/importar_examen", {
      method: "POST",
      body: formData,
    });

    const resultado = await res.json();
    if (resultado.exito) {
      await uiAlert("✅ Examen importado correctamente");

      document.getElementById("btnImportar").disabled = true;
      cargarExamenes();
    } else {
      await uiAlert("❌ " + (resultado.error || "Error al importar"));
    }
  } catch (err) {
    console.error(err);
    await uiAlert("❌ Error al conectar con el servidor");
  }
}

if (typeof examenSeleccionadoParaExportar === "undefined") {
  var examenSeleccionadoParaExportar = null;
}

async function abrirModalExportar(idexamen) {
  console.log("🧪 Elegir formato para exportar:", idexamen);
  const formato = await uiChoose("", {
    title: "¿En qué formato deseas exportar?",
    variant: "info",
    actions: [
      {
        value: "pdf",
        label: "Exportar PDF",
        className: "btn-danger",
        icon: "bi-file-earmark-pdf",
      },
      {
        value: "word",
        label: "Exportar Word",
        className: "btn-primary",
        icon: "bi-file-earmark-word",
      },
    ],
    cancelLabel: false,
  });
  if (!formato) return;
  examenSeleccionadoParaExportar = idexamen;
  await exportarExamenSeleccionado(formato);
}

function cerrarModalExportar() {
  examenSeleccionadoParaExportar = null;
}

async function exportarExamenSeleccionado(formato) {
  if (!examenSeleccionadoParaExportar) return;

  try {
    if (window.api && typeof window.api.exportarExamen === "function") {
      const res = await window.api.exportarExamen(
        examenSeleccionadoParaExportar,
        formato
      );
      if (res?.ok) {
        console.log("✅ Guardado en:", res.path);
      } else if (!res?.canceled) {
        await uiAlert(
          "❌ No se pudo exportar: " + (res?.message || "Error desconocido")
        );
      }
    } else {
      console.warn("window.api no disponible, usando fallback fetch.");
      const url = `http://localhost:5050/api/exportar_examen/${examenSeleccionadoParaExportar}?formato=${formato}`;
      window.open(url, "_blank");
    }
  } catch (e) {
    console.error("Error exportando:", e);
    await uiAlert("❌ Error exportando.");
  } finally {
    cerrarModalExportar();
  }
}

// Temario (#modalTemas, ctx banco): render al mostrar el modal

(() => {
  if (window.__TEMAS_WIRED__) return;
  window.__TEMAS_WIRED__ = true;

  let dtTemas = null;
  const PANEL_TEMA_OPEN_CLASS_BANCO = "cuad-tema-form-panel--open";

  $.fn.dataTable.ext.errMode = "console";

  const urlTemas = (all) => `${window.TEMAS_API_BASE}${all ? "?all=1" : ""}`;

  async function fetchTemas(includeInactive) {
    const url = urlTemas(includeInactive);
    console.log("[Temas] GET", url);
    const r = await fetch(url);
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`Temas HTTP ${r.status}: ${t}`);
    }
    const json = await r.json();
    console.log("[Temas] datos recibidos:", json);
    return Array.isArray(json) ? json : [];
  }
function esModalTemasBanco() {
  const modal = document.getElementById("modalTemas");
  return modal?.dataset?.ctx === "banco";
}

async function renderTemas() {
  const modal = document.getElementById("modalTemas");
  if (modal?.dataset?.ctx !== "banco") return;

  const showInactivos =
    document.getElementById("chkVerInactivosTemas")?.checked || false;

  const data = await fetchTemas(showInactivos);
  const $tabla = $("#tabla-temas");
  const ETM = window.EvaluniaTemarioModal;

  destroyDtWrappersBanco();

  console.log("[Temas] reconstruyendo DataTable...");

  if (!ETM) {
    console.error("[Temas] Falta EvaluniaTemarioModal (temario_modal.js).");
    return;
  }

  dtTemas = $tabla.DataTable({
    data,
    destroy: true,
    autoWidth: false,
    responsive: true,
    pageLength: 8,
    lengthMenu: ETM.lengthMenu,
    dom: ETM.dom,
    columnDefs: ETM.columnDefsForMode(true),
    columns: ETM.buildColumns(true),
    language: ETM.language("Nombre del tema…"),
    initComplete: function () {
      ETM.wireToolbar(this.api(), {
        hostSelector: "#temarioDtToolbarHost",
        lengthId: "temarioGenDtLength",
        searchId: "temarioGenDtSearch",
        searchPlaceholder: "Nombre del tema…",
      });
    },
  });

  $tabla.off("click.temasBanco", ".btn-editar-tema");
  $tabla.off("click.temasBanco", ".btn-toggle-tema");

  $tabla.on("click.temasBanco", ".btn-editar-tema", function () {
    showPanelTemaBanco("editar", {
      id: this.dataset.id,
      nombre: this.dataset.nombre || "",
    });
  });

  $tabla.on("click.temasBanco", ".btn-toggle-tema", async function () {
    const id = this.dataset.id;
    if (
      !(await uiConfirm("¿Cambiar el estado de este tema?", {
        variant: "warning",
        title: "Cambiar estado del tema",
        confirmLabel: "Sí, cambiar",
      }))
    ) {
      return;
    }

    try {
      const r = await fetch(`${window.TEMAS_API_BASE}/${id}/toggle`, {
        method: "PATCH",
      });
      const d = await r.json();

      if (!r.ok) {
        await uiAlert(d.error || "No se pudo cambiar el estado.");
        return;
      }

      await renderTemas();
    } catch (e) {
      console.error(e);
      await uiAlert("Error de red.");
    }
  });

  setTimeout(() => {
    try {
      const api = $tabla.DataTable();
      api.columns.adjust();
      if (api.responsive && typeof api.responsive.recalc === "function") {
        api.responsive.recalc();
      }
    } catch (e) {
      console.warn("[Temas] no se pudo ajustar DataTable", e);
    }
  }, 0);
}

function destroyDtWrappersBanco() {
  const t = document.querySelector("#tabla-temas");
  if (!t) return;

  const ETM = window.EvaluniaTemarioModal;
  if (ETM) {
    ETM.destroy("#tabla-temas", ETM.TOOLBAR_HOST_ID);
    ETM.rebuildThead(t, { includePreguntas: true });
    return;
  }

  document.getElementById("temarioDtToolbarHost")?.replaceChildren();

  const $t = $(t);

  if ($.fn.DataTable.isDataTable(t)) {
    try {
      $t.DataTable().clear().destroy();
    } catch (e) {
      console.warn("[Temas] destroy error:", e);
    }
  }

  for (;;) {
    const $w = $t.closest(".dataTables_wrapper, .dt-container");
    if (!$w.length) break;
    $w.before($t);
    $w.remove();
  }

  t.querySelector("thead")?.remove();

  const thead = document.createElement("thead");
  thead.className = "table-dark";
  thead.innerHTML = `
    <tr>
      <th>ID</th>
      <th>Nombre</th>
      <th>Preguntas</th>
      <th>Estado</th>
      <th>Acciones</th>
    </tr>
  `;
  t.prepend(thead);

  const tb = t.querySelector("tbody") || document.createElement("tbody");
  tb.innerHTML = "";
  if (!tb.parentElement) t.appendChild(tb);
}

  function panelTemaBancoEls() {
    return {
      panel: document.getElementById("panelTemaBanco"),
      titulo: document.getElementById("panelTemaBancoTitulo"),
      icon: document.getElementById("panelTemaBancoIcon"),
      idInput: document.getElementById("temaIdBanco"),
      nombreInput: document.getElementById("temaNombreBanco"),
      btnG: document.getElementById("btnTemaBancoGuardar"),
    };
  }

  function hidePanelTemaBanco() {
    const { panel, idInput, nombreInput, btnG, icon } = panelTemaBancoEls();
    if (!panel) return;
    panel.classList.remove(
      "cuad-tema-form-panel--crear",
      "cuad-tema-form-panel--editar",
      PANEL_TEMA_OPEN_CLASS_BANCO
    );
    panel.setAttribute("aria-hidden", "true");
    if (icon) icon.className = "bi bi-plus-circle";
    panel.dataset.modo = "";
    if (idInput) idInput.value = "";
    if (nombreInput) {
      nombreInput.value = "";
      nombreInput.disabled = false;
    }
    if (btnG) btnG.disabled = false;
  }

  function showPanelTemaBanco(modo, payload = {}) {
    const { panel, titulo, icon, idInput, nombreInput, btnG } = panelTemaBancoEls();
    if (!panel || !nombreInput) return;
    panel.classList.remove(
      "cuad-tema-form-panel--crear",
      "cuad-tema-form-panel--editar"
    );
    panel.classList.add(
      modo === "editar" ? "cuad-tema-form-panel--editar" : "cuad-tema-form-panel--crear"
    );
    if (icon) {
      icon.className =
        modo === "editar" ? "bi bi-pencil-square" : "bi bi-plus-circle";
    }
    panel.dataset.modo = modo;
    if (titulo) {
      titulo.textContent = modo === "editar" ? "Editar tema" : "Nuevo tema";
    }
    if (idInput) idInput.value = modo === "editar" ? String(payload.id ?? "") : "";
    nombreInput.value =
      modo === "editar" ? String(payload.nombre ?? "").trim() : "";
    if (btnG) {
      const label = btnG.querySelector(".btn-text");
      if (label) {
        label.textContent = modo === "editar" ? "Actualizar" : "Guardar";
      }
      btnG.classList.toggle("btn-success", modo !== "editar");
      btnG.classList.toggle("btn-primary", modo === "editar");
    }

    panel.setAttribute("aria-hidden", "false");
    panel.classList.remove(PANEL_TEMA_OPEN_CLASS_BANCO);
    void panel.offsetWidth;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.classList.add(PANEL_TEMA_OPEN_CLASS_BANCO);
        requestAnimationFrame(() => {
          try {
            nombreInput.focus();
          } catch (_) {}
        });
      });
    });
  }

  async function guardarPanelTemaBanco() {
    const modal = document.getElementById("modalTemas");
    if (modal?.dataset?.ctx !== "banco") return;

    const { panel, idInput, nombreInput, btnG } = panelTemaBancoEls();
    const modo = panel?.dataset?.modo;
    if (!modo || !panel.classList.contains(PANEL_TEMA_OPEN_CLASS_BANCO)) return;

    const nombre = nombreInput?.value.trim() || "";
    if (!nombre) return;

    if (btnG) btnG.disabled = true;
    if (nombreInput) nombreInput.disabled = true;

    try {
      if (modo === "crear") {
        const r = await fetch(window.TEMAS_API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre }),
        });
        const d = await r.json();
        if (!r.ok) {
          await uiAlert(d.error || "Error al crear.");
          return;
        }
      } else if (modo === "editar") {
        const id = idInput?.value;
        if (!id) return;
        const r = await fetch(`${window.TEMAS_API_BASE}/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre }),
        });
        const d = await r.json();
        if (!r.ok) {
          await uiAlert(d.error || "Error al actualizar.");
          return;
        }
      }
      hidePanelTemaBanco();
      await renderTemas();
    } catch (e2) {
      console.error(e2);
      await uiAlert("Error de red.");
    } finally {
      const els = panelTemaBancoEls();
      if (els.btnG) els.btnG.disabled = false;
      if (els.nombreInput) els.nombreInput.disabled = false;
    }
  }

$(document).off("show.bs.modal.temasBancoCtx", "#modalTemas");
$(document).on("show.bs.modal.temasBancoCtx", "#modalTemas", function (ev) {
  const trigger = ev.relatedTarget;

  if (trigger && trigger.id === "btnTemarioBanco") {
    this.dataset.ctx = "banco";
    this.dataset.returnTo = "";
    console.log("[Temas] ctx = banco");
  }
});

$(document).off("shown.bs.modal.temasBancoRender", "#modalTemas");
$(document).on("shown.bs.modal.temasBancoRender", "#modalTemas", async function () {
  if (this.dataset.ctx !== "banco") return;

  console.log("[Temas] shown -> renderTemas()");
  try {
    await renderTemas();
  } catch (e) {
    console.error(e);
    await uiAlert("No se pudo cargar Temas.");
  }
});

 $(document).on("change", "#chkVerInactivosTemas", async function () {
  const modal = document.getElementById("modalTemas");
  if (modal?.dataset?.ctx !== "banco") return;

  try {
    await renderTemas();
  } catch (e) {
    console.error(e);
  }
});

  $(document).on("click.temasBancoPanel", "#btnAgregarTemaBanco", function (ev) {
    ev.preventDefault();
    const modal = document.getElementById("modalTemas");
    if (modal?.dataset?.ctx !== "banco") return;
    showPanelTemaBanco("crear");
  });

  $(document).on("click.temasBancoPanel", "#btnTemaBancoGuardar", function (ev) {
    ev.preventDefault();
    void guardarPanelTemaBanco();
  });

  $(document).on("click.temasBancoPanel", "#btnTemaBancoCancelar", function (ev) {
    ev.preventDefault();
    hidePanelTemaBanco();
  });

  $(document).on("hidden.bs.modal.temasBancoPanel", "#modalTemas", function () {
    if (this.dataset.ctx !== "banco") return;
    hidePanelTemaBanco();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    const modal = document.getElementById("modalTemas");
    if (!modal?.classList.contains("show") || modal.dataset.ctx !== "banco") return;
    const panel = document.getElementById("panelTemaBanco");
    if (!panel || !panel.classList.contains(PANEL_TEMA_OPEN_CLASS_BANCO)) return;
    ev.stopPropagation();
    hidePanelTemaBanco();
  });
 })();

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${txt}`);
  }
  return r.json();
}
window.DT_ES ??= {
  search: "Buscar:",
  lengthMenu: "Mostrar _MENU_ registros por página",
  zeroRecords: "No se encontraron resultados",
  info: "Mostrando _START_ a _END_ de _TOTAL_ registros",
  infoEmpty: "Mostrando 0 a 0 de 0 registros",
  infoFiltered: "(filtrado de _MAX_ registros totales)",
  paginate: {
    first: "Primero",
    last: "Último",
    next: "Siguiente",
    previous: "Anterior",
  },
  processing: "Procesando...",
};

$(document).off("shown.bs.modal.dtFix");
$(document).on(
  "shown.bs.modal.dtFix",
  "#modalTemas, #modalBuscar, #modalBancoPreguntas, #modalBancoDetalle, #modalBancoImportar",
  function () {
    const modal = this;

    setTimeout(() => {
      try {
        $.fn.dataTable
          .tables({ visible: true, api: true })
          .columns.adjust()
          .responsive.recalc();
      } catch (e) {}

      const input =
        modal.querySelector(".dataTables_filter input") ||
        modal.querySelector(".dt-search input");

      if (input) {
        input.disabled = false;
        input.readOnly = false;
        input.focus();
        input.select?.();
      }
    }, 150);
  }
);

if (typeof window.examenActual === "undefined") window.examenActual = null;
if (typeof window.dtBuscarTemas === "undefined") window.dtBuscarTemas = null;
if (typeof window.dtBuscarPregs === "undefined") window.dtBuscarPregs = null;

const GEN_CURSOS_TITULO_LISTA = "Cursos";

function getModalBuscarEl() {
  const els = [...document.querySelectorAll("#modalBuscar")];
  const enContenido = els.find((el) =>
    document.getElementById("contenido")?.contains(el)
  );
  return enContenido || els[els.length - 1] || null;
}

function mostrarVistaGenCursos(vista) {
  const modal = getModalBuscarEl();
  if (!modal) return;

  modal.dataset.genCursosVista = vista;

  const vLista = modal.querySelector("#gen-cursos-vista-lista");
  const vDet = modal.querySelector("#gen-cursos-vista-detalle");
  const footDet = modal.querySelector("#gen-cursos-footer-detalle");
  const icon = modal.querySelector("#genCursosHeaderIcon");
  const titulo = modal.querySelector("#genCursosTituloTexto");
  const closeBtn = modal.querySelector(".gen-cursos-header-close");

  if (closeBtn) {
    closeBtn.setAttribute(
      "aria-label",
      vista === "detalle" ? "Volver al listado de cursos" : "Cerrar"
    );
  }

  if (vista === "lista") {
    vLista?.classList.add("gen-cursos-view--active");
    vDet?.classList.remove("gen-cursos-view--active");
    footDet?.classList.add("d-none");
    if (icon) {
      icon.className = "bi bi-journal-bookmark gen-modal-cursos-header-icon";
      icon.setAttribute("aria-hidden", "true");
    }
    if (titulo) titulo.textContent = GEN_CURSOS_TITULO_LISTA;
    requestAnimationFrame(() => {
      try {
        if (window.dtBuscarTemas) dtBuscarTemas.columns.adjust();
      } catch (e) {}
    });
  } else {
    vLista?.classList.remove("gen-cursos-view--active");
    vDet?.classList.add("gen-cursos-view--active");
    footDet?.classList.remove("d-none");
    if (icon) {
      icon.className = "bi bi-list-ul gen-modal-cursos-header-icon";
      icon.setAttribute("aria-hidden", "true");
    }
  }
}

if (!window.__GEN_CURSOS_HEADER_CLOSE_DELEGATED__) {
  window.__GEN_CURSOS_HEADER_CLOSE_DELEGATED__ = true;
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest(".gen-cursos-header-close");
      if (!btn) return;
      const modalRoot = btn.closest("#modalBuscar");
      if (!modalRoot || !modalRoot.classList.contains("show")) return;
      e.preventDefault();
      e.stopPropagation();
      if (modalRoot.dataset.genCursosVista === "detalle") {
        mostrarVistaGenCursos("lista");
      } else {
        const inst =
          bootstrap.Modal.getInstance(modalRoot) ||
          bootstrap.Modal.getOrCreateInstance(modalRoot);
        inst.hide();
      }
    },
    true
  );
}

$(document).on("click", "#btnGenCursosVolver", (e) => {
  e.preventDefault();
  mostrarVistaGenCursos("lista");
});

$(document).on("hidden.bs.modal", "#modalBuscar", () => {
  mostrarVistaGenCursos("lista");
});

$(document).on("click", ".btn-buscar", async function () {
  const btn = this;
  const raw = btn.dataset.id ?? $(btn).attr("data-id");
  const id = Number(raw);
  console.log("[Buscar] id =", raw, "->", id);

  if (!Number.isInteger(id) || id <= 0) {
    await uiAlert("ID de examen inválido");
    return;
  }

  if (btn.dataset.loading === "1") return;

  const oldHtml = btn.innerHTML;
  btn.dataset.loading = "1";
  btn.disabled = true;
  btn.innerHTML = "Cargando...";

  examenActual = id;

  try {
    const res = await fetch(
      `http://localhost:5050/api/examenes/${id}/partir_y_guardar?overwrite=1`,
      { method: "POST" }
    );

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    await cargarTemasDelExamen(id);

    const modalEl = getModalBuscarEl();
    if (modalEl && modalEl.parentElement !== document.body) {
      document.body.appendChild(modalEl);
    }

    mostrarVistaGenCursos("lista");

    bootstrap.Modal.getOrCreateInstance(modalEl, {
      backdrop: "static",
      focus: true,
      keyboard: false,
    }).show();
  } catch (e) {
    console.error(e);
    await uiAlert("No se pudo preparar el examen.");
  } finally {
    btn.dataset.loading = "0";
    btn.disabled = false;
    btn.innerHTML = oldHtml;
  }
});

async function cargarTemasDelExamen(id) {
  const url = `http://localhost:5050/api/examenes/${encodeURIComponent(
    id
  )}/temas`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Temas HTTP ${r.status}`);
  const temas = await r.json();

  if (!$.fn.DataTable.isDataTable("#tabla-buscar-temas")) {
    dtBuscarTemas = $("#tabla-buscar-temas").DataTable({
      data: temas,
      paging: false,
      searching: false,
      info: false,
      columns: [
        { data: "id" },
        { data: "nombre" },
        { data: "n_preguntas" },
        {
          data: null,
          orderable: false,
          render: (row) => {
            const nom = String(row.nombre ?? "")
              .replace(/&/g, "&amp;")
              .replace(/"/g, "&quot;")
              .replace(/</g, "&lt;");
            return `<button type="button" class="btn btn-primary btn-sm d-inline-flex align-items-center gap-1 btn-ver-tema"
                      data-tema="${row.id}"
                      data-nombre="${nom}"
                      aria-label="Ver detalles del curso">
                <i class="bi bi-list-ul" aria-hidden="true"></i>
                <span>Detalles</span>
              </button>`;
          },
        },
      ],
      language: DT_ES,
    });
  } else {
    dtBuscarTemas.clear().rows.add(temas).draw(false);
  }
}

if (typeof window.dtPregsTema === "undefined") window.dtPregsTema = null;

$(document).on("click", ".btn-ver-tema", async function () {
  const temaId = Number(this.dataset.tema);
  const temaNombre = this.dataset.nombre || "";

  const modalBuscar = getModalBuscarEl();
  const tituloEl = modalBuscar?.querySelector("#genCursosTituloTexto");
  if (tituloEl) tituloEl.textContent = `Preguntas — ${temaNombre}`;

  try {
    const r = await fetch(
      `http://localhost:5050/api/preguntas?examen=${examenActual}&tema=${temaId}`
    );
    if (!r.ok) throw new Error(`Preguntas HTTP ${r.status}`);
    const pregs = await r.json();

    if (!$.fn.DataTable.isDataTable("#tabla-preguntas-tema")) {
      dtPregsTema = $("#tabla-preguntas-tema").DataTable({
        data: pregs,
        paging: true,
        searching: false,
        lengthChange: false,
        pageLength: 10,
        columns: [
          { data: "numero_p", title: "#" },
          { data: "archivo_nombre", title: "Archivo" },
          {
            data: null,
            orderable: false,
            title: "Abrir",
            render: (row) => {
              const ruta = (row.archivo_ruta || "").replace(/\\/g, "/");
              const href = "file:///" + encodeURI(ruta);
              return `<a class="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1 gen-pregunta-abrir-btn" href="${href}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i><span>Abrir</span></a>`;
            },
          },
        ],
        language: DT_ES,
      });
    } else {
      dtPregsTema.clear().rows.add(pregs).draw(false);
    }

    mostrarVistaGenCursos("detalle");
    requestAnimationFrame(() => {
      try {
        if (window.dtPregsTema) dtPregsTema.columns.adjust();
      } catch (e) {}
    });
  } catch (e) {
    console.error(e);
    await uiAlert("No se pudieron cargar las preguntas.");
  }
});

if (typeof window.GRUPOS_API_BASE === "undefined")
  window.GRUPOS_API_BASE = "http://localhost:5050/api/grupos";

if (typeof window.TEMAS_API_BASE === "undefined")
  window.TEMAS_API_BASE = "http://localhost:5050/api/temas";

window.grupoSeleccionado = null;

$(document).on("click", "#btnAbrirModalGrupoCrearGenExamen", function (e) {
  e.preventDefault();
  e.stopPropagation();
  const el = document.getElementById("modalGrupoCrear");
  if (!el) return;
  if (el.parentElement !== document.body) {
    document.body.appendChild(el);
  }
  bootstrap.Modal.getInstance(el)?.dispose();
  const inst = new bootstrap.Modal(el, {
    backdrop: false,
    keyboard: false,
  });
  inst.show();
  requestAnimationFrame(() => repararEstadoModales());
});

$(document).on("shown.bs.modal", "#modalGrupoCrear, #modalGrupoEditar", () => {
  document.body.classList.add("gen-modal-grupo-nested-scrim");
});

$(document).on("hidden.bs.modal", "#modalGrupoCrear, #modalGrupoEditar", function () {
  document.body.classList.remove("gen-modal-grupo-nested-scrim");
  if (this.id === "modalGrupoCrear") {
    limpiarModalGrupoCrear();
  } else if (this.id === "modalGrupoEditar") {
    limpiarModalGrupoEditar();
  }
  requestAnimationFrame(() => repararEstadoModales());
});

if (typeof window.__temasCache === "undefined") window.__temasCache = null;
async function cargarTemasActivos() {
  if (__temasCache) return __temasCache;
  const r = await fetch(TEMAS_API_BASE);
  const arr = await r.json();
  __temasCache = (arr || []).filter((t) => t.activo);
  return __temasCache;
}

function leerCuotasDe(containerSel) {
  const filas = [...document.querySelectorAll(`${containerSel} .cuota-row`)];
  const cuotas = [];
  const seen = new Set();
  for (const row of filas) {
    const temaId = row.querySelector(".sel-tema")?.value;
    const cant = row.querySelector(".inp-cant")?.value;
    if (!temaId || !cant) continue;
    if (seen.has(temaId)) throw new Error("No repitas el mismo tema.");
    seen.add(temaId);
    cuotas.push({ tema_id: Number(temaId), cantidad: Number(cant) });
  }
  return cuotas;
}

function filaCuotaHTML(temas, temaSel = "", cant = "") {
  const opts = temas
    .map(
      (t) =>
        `<option value="${t.id}" ${
          String(t.id) === String(temaSel) ? "selected" : ""
        }>${t.nombre}</option>`
    )
    .join("");
  return `
    <div class="row g-2 align-items-end align-items-sm-center cuota-row gen-grupo-cuota-row mb-2">
      <div class="col-12 col-sm-7 col-md-8">
        <select class="form-select sel-tema" required>
          <option value="" disabled ${
            temaSel ? "" : "selected"
          }>Selecciona tema…</option>
          ${opts}
        </select>
      </div>
      <div class="col-8 col-sm-3 col-md-3">
        <input type="number" min="1" class="form-control inp-cant" placeholder="Cantidad" required value="${cant}">
      </div>
      <div class="col-4 col-sm-2 col-md-1 text-end text-sm-end">
        <button type="button" class="btn btn-sm btn-outline-danger gen-grupo-cuota-remove btnQuitarCuota" title="Quitar tema" aria-label="Quitar tema">
          <i class="bi bi-trash3" aria-hidden="true"></i>
        </button>
      </div>
    </div>`;
}
function totalFrom(containerSel, totalSel) {
  const n = [...document.querySelectorAll(`${containerSel} .inp-cant`)]
    .map((i) => parseInt(i.value, 10) || 0)
    .reduce((a, b) => a + b, 0);
  document.querySelector(totalSel).textContent = n;
}

function limpiarModalGrupoCrear() {
  document.getElementById("formGrupoCrear")?.reset();
  const cont = document.getElementById("cuotasContainer");
  if (cont) {
    cont.innerHTML = "";
    cont.onclick = null;
    cont.oninput = null;
    cont.onchange = null;
  }
  const inpClave = document.getElementById("grupoClaveCrear");
  if (inpClave) inpClave.oninput = null;
  const btnAdd = document.getElementById("btnAgregarCuota");
  if (btnAdd) btnAdd.onclick = null;
  const totalEl = document.getElementById("totalCuotas");
  if (totalEl) totalEl.textContent = "0";
}

function limpiarModalGrupoEditar() {
  document.getElementById("formGrupoEditar")?.reset();
  const cont = document.getElementById("cuotasContainerEdit");
  if (cont) cont.innerHTML = "";
  const btn = document.getElementById("btnAgregarCuotaEdit");
  if (btn) btn.onclick = null;
  const totalEl = document.getElementById("totalCuotasEdit");
  if (totalEl) totalEl.textContent = "0";
}

async function fetchGrupos(includeInactive) {
  const url = includeInactive
    ? `${window.GRUPOS_API_BASE}?all=1`
    : window.GRUPOS_API_BASE;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Grupos HTTP ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}
async function fetchCuotasGrupo(idgrupo) {
  const r = await fetch(`${window.GRUPOS_API_BASE}/${idgrupo}/cuotas`);
  if (!r.ok) return [];
  return r.json();
}

async function saveCuotasGrupoById(idgrupo, cuotas) {
  const r = await fetch(`${window.GRUPOS_API_BASE}/${idgrupo}/cuotas`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cuotas }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "No se pudieron guardar las cuotas");
  return j;
}

async function renderGruposLeftPanel() {
  const ul = document.getElementById("lista-grupos");
  if (!ul) return;

  try {
    const grupos = await fetchGrupos(false);
    ul.innerHTML = "";

    grupos.forEach((g) => {
      const li = document.createElement("li");
      li.className =
        "gen-examen-grupo-row d-flex align-items-center justify-content-between mb-2";

      const main = document.createElement("div");
      main.className =
        "gen-examen-grupo-main d-flex align-items-center gap-2 flex-grow-1 min-w-0";
      main.innerHTML = `
        <span class="gen-examen-grupo-pill gen-examen-grupo-pill--clave">${g.clave}</span>
        <span class="text-muted small gen-examen-grupo-name">${g.nombre || ""}</span>
        <span class="gen-examen-grupo-pill gen-examen-grupo-pill--count">${g.total_preguntas ?? 0}</span>
      `;

      const actions = document.createElement("div");
      actions.className =
        "gen-examen-grupo-actions d-flex align-items-center gap-1 flex-shrink-0";

      const btnCfg = document.createElement("button");
      btnCfg.type = "button";
      btnCfg.className =
        "btn gen-examen-grupo-act gen-examen-grupo-act--config";
      btnCfg.title = "Configurar cuotas por tema";
      btnCfg.innerHTML =
        '<i class="bi bi-gear-fill" aria-hidden="true"></i>';
      btnCfg.onclick = (ev) => {
        ev.stopPropagation();
        abrirModalEditarGrupo(g);
      };

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className =
        "btn gen-examen-grupo-act gen-examen-grupo-act--delete btnQuitarCuota";
      btnDel.title = "Eliminar";
      btnDel.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
      btnDel.onclick = async (ev) => {
        ev.stopPropagation();
        try {
          if (
            !(await uiConfirm("¿Eliminar este grupo?", { variant: "danger" }))
          ) {
            return;
          }

          let r = await fetch(`${window.GRUPOS_API_BASE}/${g.idgrupo}`, {
            method: "DELETE",
          });
          let d = await r.json();

          console.log("[GRUPO DELETE] status inicial =", r.status, d);

          if (!r.ok && r.status === 409) {
            const continuar = await uiConfirm(
              (d.error || "El grupo tiene cuotas asociadas.") +
                "\n\n¿Deseas eliminarlo de todas formas?",
              {
                variant: "warning",
                title: "Forzar eliminación",
                confirmLabel: "Sí, eliminar",
                dangerous: true,
              }
            );
            if (!continuar) return;

            r = await fetch(`${window.GRUPOS_API_BASE}/${g.idgrupo}?force=1`, {
              method: "DELETE",
            });
            d = await r.json();

            console.log("[GRUPO DELETE] status force =", r.status, d);
          }

          if (!r.ok) {
            await uiAlert(d.error || "No se pudo eliminar");
            return;
          }

          if (window.grupoSeleccionado?.id === g.idgrupo) {
            window.grupoSeleccionado = null;
          }

          await uiAlert("✅ Grupo eliminado correctamente");

          setTimeout(() => {
            limpiarBackdropsHuerfanosSoloSiNoHayBootstrapVisible();
          }, 50);

          await renderGruposLeftPanel();
        } catch (e) {
          console.error(e);
          await uiAlert("Error de red.");
        }
      };

      actions.appendChild(btnCfg);
      actions.appendChild(btnDel);

      li.appendChild(main);
      li.appendChild(actions);

      li.style.cursor = "pointer";

      li.onclick = (ev) => {
        if (ev.target.closest("button")) return;
        [...ul.children].forEach((n) => n.classList.remove("selected"));
        li.classList.add("selected");

        window.grupoSeleccionado = { id: g.idgrupo, clave: g.clave };
        console.log("Grupo seleccionado:", window.grupoSeleccionado);
        actualizarGenExamenHintSeleccionGrupo();
      };

      ul.appendChild(li);
    });
    actualizarGenExamenHintSeleccionGrupo();
  } catch (e) {
    console.error("[Grupos] No se pudo cargar la lista:", e);
  }
}

if (typeof window.__origGenerarNuevoExamen === "undefined") {
  window.__origGenerarNuevoExamen = window.generarNuevoExamen;
}
window.generarNuevoExamen = function () {
  const banco = document.getElementById("modalBancoPreguntas");
  if (banco && banco.classList.contains("show")) {
    const inst = bootstrap.Modal.getInstance(banco);
    if (inst) inst.hide();
  }

  renderGruposLeftPanel();
  if (typeof window.__origGenerarNuevoExamen === "function") {
    window.__origGenerarNuevoExamen();
  }
};

function limpiarBackdropsHuerfanosSoloSiNoHayBootstrapVisible() {
  const abiertos = document.querySelectorAll(".modal.show").length;
  if (abiertos === 0) {
    document.querySelectorAll(".modal-backdrop").forEach(el => el.remove());
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("padding-right");
  }
}

const PLANTILLAS_GRUPO = {
  A: [
      { tema_id: 7, cantidad: 10 },
    { tema_id: 18, cantidad: 10 },
   { tema_id: 17, cantidad: 5 },
    { tema_id: 2, cantidad: 5 },
   { tema_id: 4, cantidad: 5 },
   { tema_id: 6,cantidad: 5 },
   { tema_id: 5,cantidad: 5 },
   { tema_id: 8, cantidad: 5 },
     { tema_id: 9, cantidad: 5 },
      { tema_id: 12, cantidad: 5 },
  ],
  B: [
     { tema_id: 7, cantidad: 10 },
    { tema_id: 18, cantidad: 10 },
   { tema_id: 17, cantidad: 5 },
    { tema_id: 2, cantidad: 5 },
   { tema_id: 4, cantidad: 5 },
    { tema_id: 8, cantidad: 5 },
     { tema_id: 9, cantidad: 5 },
      { tema_id: 10, cantidad: 5 },
       { tema_id: 11, cantidad: 5 },
    { tema_id: 12, cantidad: 5 },
  ],
  C: [
      { tema_id: 7, cantidad: 10 },
    { tema_id: 18, cantidad: 10 },
   { tema_id: 17, cantidad: 5 },
    { tema_id: 2, cantidad: 5 },
   { tema_id: 4, cantidad: 5 },
   
    { tema_id: 12, cantidad: 5 },
    { tema_id: 16, cantidad: 5 },
      { tema_id: 15, cantidad: 5 },
    { tema_id: 13, cantidad: 5 },
    { tema_id: 14, cantidad: 5 },
  
  ],
};

$(document).on("show.bs.modal", "#modalGrupoCrear", async function () {
  if (this instanceof HTMLElement && this.parentElement !== document.body) {
    document.body.appendChild(this);
  }
  const temas = await cargarTemasActivos();
  const cont = document.getElementById("cuotasContainer");
  const inpClave = document.getElementById("grupoClaveCrear");

  cont.innerHTML = "";

  function renderPlantillaDesdeClave() {
    const clave = (inpClave?.value || "").trim().toUpperCase();
    const plantilla =
      PLANTILLAS_GRUPO[clave] || [{ tema_id: temas[0]?.id, cantidad: 5 }];

    cont.innerHTML = "";
    plantilla.forEach((c) => {
      cont.insertAdjacentHTML(
        "beforeend",
        filaCuotaHTML(temas, c.tema_id, c.cantidad)
      );
    });

    totalFrom("#cuotasContainer", "#totalCuotas");
  }

  renderPlantillaDesdeClave();

  if (inpClave) {
    inpClave.oninput = () => {
      const clave = (inpClave.value || "").trim().toUpperCase();
      if (PLANTILLAS_GRUPO[clave]) {
        renderPlantillaDesdeClave();
      }
    };
  }

  document.getElementById("btnAgregarCuota").onclick = () => {
    cont.insertAdjacentHTML("beforeend", filaCuotaHTML(temas));
    totalFrom("#cuotasContainer", "#totalCuotas");
  };

  cont.onclick = (e) => {
    const q = e.target.closest(".btnQuitarCuota");
    if (q) {
      q.closest(".cuota-row")?.remove();
      totalFrom("#cuotasContainer", "#totalCuotas");
    }
  };

  cont.oninput = (e) => {
    if (e.target.classList.contains("inp-cant")) {
      totalFrom("#cuotasContainer", "#totalCuotas");
    }
  };

  cont.onchange = (e) => {
    if (e.target.classList.contains("sel-tema")) {
      totalFrom("#cuotasContainer", "#totalCuotas");
    }
  };

  requestAnimationFrame(() => repararEstadoModales());
});

$(document).on("submit", "#formGrupoCrear", async function (e) {
  e.preventDefault();

  const clave = $("#grupoClaveCrear").val().trim();
  const nombre = $("#grupoNombreCrear").val().trim();

  const cuotas = [];
  const seen = new Set();
  for (const row of document.querySelectorAll("#cuotasContainer .cuota-row")) {
    const temaId = row.querySelector(".sel-tema").value;
    const cant = row.querySelector(".inp-cant").value;
    if (!temaId || !cant) continue;
    if (seen.has(temaId)) {
      await uiAlert("No repitas el mismo tema.");
      return;
    }
    seen.add(temaId);
    cuotas.push({ tema_id: Number(temaId), cantidad: Number(cant) });
  }
  if (!clave || cuotas.length === 0) {
    await uiAlert("Completa la clave y al menos una cuota.");
    return;
  }

  let idgrupo = null;
  try {
    const r = await fetch(window.GRUPOS_API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave, nombre }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) idgrupo = j.idgrupo ?? j.id;
    else if (r.status !== 409)
      return await uiAlert(j.error || "No se pudo crear el grupo.");
  } catch (e) {
    console.error(e);
    return await uiAlert("Error de red al crear el grupo.");
  }

  if (!idgrupo) {
    const todos = await fetchGrupos(true);
    idgrupo = (todos.find((g) => g.clave === clave) || {}).idgrupo;
    if (!idgrupo) return await uiAlert("No se pudo obtener el id del grupo.");
  }

  try {
    await saveCuotasGrupoById(idgrupo, cuotas);
    bootstrap.Modal.getInstance(
      document.getElementById("modalGrupoCrear")
    ).hide();
    await renderGruposLeftPanel();
  } catch (e2) {
    console.error(e2);
    await uiAlert(e2.message || "No se pudieron guardar las cuotas.");
  }
});

async function abrirModalEditarGrupo(g) {
  $("#grupoIdEditar").val(g.idgrupo);
  $("#grupoClaveEditar").val(g.clave);
  $("#grupoNombreEditar").val(g.nombre || "");

  const temas = await cargarTemasActivos();
  const cont = document.getElementById("cuotasContainerEdit");
  cont.innerHTML = "";

  const cuotas = await fetchCuotasGrupo(g.idgrupo);
  const claveGrupo = (g?.clave || "").trim().toUpperCase();
  const cuotasBase =
    Array.isArray(cuotas) && cuotas.length
      ? cuotas
      : (PLANTILLAS_GRUPO[claveGrupo] || [{ tema_id: temas[0]?.id, cantidad: 5 }]);

  cuotasBase.forEach((q) =>
    cont.insertAdjacentHTML(
      "beforeend",
      filaCuotaHTML(temas, q.tema_id, q.cantidad)
    )
  );

  totalFrom("#cuotasContainerEdit", "#totalCuotasEdit");

  document.getElementById("btnAgregarCuotaEdit").onclick = () => {
    cont.insertAdjacentHTML("beforeend", filaCuotaHTML(temas));
    totalFrom("#cuotasContainerEdit", "#totalCuotasEdit");
  };

  const modalEditarEl = document.getElementById("modalGrupoEditar");
  if (!modalEditarEl) return;

  if (modalEditarEl.parentElement !== document.body) {
    document.body.appendChild(modalEditarEl);
  }

  bootstrap.Modal.getInstance(modalEditarEl)?.dispose();
  const inst = new bootstrap.Modal(modalEditarEl, {
    backdrop: false,
    keyboard: false,
  });

  inst.show();
  requestAnimationFrame(() => repararEstadoModales());
}

$(document).off("click", "#cuotasContainerEdit .btnQuitarCuota");
$(document).on("click", "#cuotasContainerEdit .btnQuitarCuota", function () {
  $(this).closest(".cuota-row").remove();
  totalFrom("#cuotasContainerEdit", "#totalCuotasEdit");
});

$(document).off("input", "#cuotasContainerEdit .inp-cant");
$(document).on("input", "#cuotasContainerEdit .inp-cant", function () {
  totalFrom("#cuotasContainerEdit", "#totalCuotasEdit");
});

$(document).off("change", "#cuotasContainerEdit .sel-tema");
$(document).on("change", "#cuotasContainerEdit .sel-tema", function () {
  totalFrom("#cuotasContainerEdit", "#totalCuotasEdit");
});

$(document).off("submit", "#formGrupoEditar");
$(document).on("submit", "#formGrupoEditar", async function (e) {
  e.preventDefault();

  const idgrupo = $("#grupoIdEditar").val();
  const nuevaClave = $("#grupoClaveEditar").val().trim();
  const nombre = $("#grupoNombreEditar").val().trim();

  let cuotas;
  try {
    cuotas = leerCuotasDe("#cuotasContainerEdit");
  } catch (err) {
    await uiAlert(err.message);
    return;
  }

  if (!nuevaClave || cuotas.length === 0) {
    await uiAlert("Completa clave y al menos una cuota.");
    return;
  }

  try {
    const r1 = await fetch(`${window.GRUPOS_API_BASE}/${idgrupo}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave: nuevaClave, nombre }),
    });
    const j1 = await r1.json();
    if (!r1.ok) throw new Error(j1.error || "No se pudo actualizar el grupo.");

    await saveCuotasGrupoById(idgrupo, cuotas);

    bootstrap.Modal.getInstance(
      document.getElementById("modalGrupoEditar")
    ).hide();
    await renderGruposLeftPanel();
  } catch (e2) {
    console.error(e2);
    await uiAlert(e2.message || "Error al actualizar cuotas.");
  }
});

function getLastById(id) {
  const els = [...document.querySelectorAll(`#${id}`)];
  return els.length ? els[els.length - 1] : null;
}

function getVisibleById(id) {
  const els = [...document.querySelectorAll(`#${id}`)];
  return (
    els.find((el) => el.classList.contains("show") || el.style.display === "block") ||
    els[els.length - 1] ||
    null
  );
}

/** Modal hijo sobre padre: al cerrar el hijo se reabre el padre. */
function abrirModalSobre(parentId, childId, opts) {
  const parentEl = getVisibleById(parentId);
  const childEl = getLastById(childId);

  if (!parentEl || !childEl) {
    console.error("[MODAL] Falta parent o child", { parentId, childId });
    return;
  }

  if (childEl.parentElement !== document.body) {
    document.body.appendChild(childEl);
  }

  const child = bootstrap.Modal.getOrCreateInstance(childEl, {
    backdrop: "static",
    focus: true,
    keyboard: true,
  });

  const parent = bootstrap.Modal.getOrCreateInstance(parentEl);

  const onParentHidden = () => {
    child.show();
  };

  const onChildHidden = () => {
    bootstrap.Modal.getOrCreateInstance(parentEl).show();
  };

  parentEl.addEventListener("hidden.bs.modal", onParentHidden, { once: true });
  childEl.addEventListener("hidden.bs.modal", onChildHidden, { once: true });

  parent.hide();
}

(() => {
  const BASE = "http://localhost:5050";
  let blobUrlActual = null;

  async function generarExamenGrupo(formato = "word") {
    try {
      const sel = window.grupoSeleccionado;
      if (!sel?.id) {
        setGenExamenMensajeModal(
          "Selecciona un grupo en la lista de la izquierda.",
          "warning"
        );
        return;
      }

      const endpoint = `http://localhost:5050/api/grupos/${
        sel.id
      }/generar_doc?formato=${encodeURIComponent(formato)}&numerar=1`;
      setGenExamenMensajeModal(`Generando examen para el grupo <b>${sel.clave}</b>…`, "info");

      const res = await fetch(endpoint, { method: "POST" });
      const raw = await res.text();

      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        console.error("HTML devuelto por el backend:\n", raw);
        throw new Error(`Respuesta no JSON (HTTP ${res.status}).`);
      }

      if (!res.ok || !data?.ok) {
        const msg = data?.error || `Error ${res.status}`;

        console.group("[GENERAR_EXAMEN][ERROR_BACKEND]");
        console.log("status =", res.status);
        console.log("error =", msg);
        console.log("payload completo =", data);

        if (Array.isArray(data?.detalles)) {
          console.log("detalles:");
          data.detalles.forEach((d, i) => {
            console.log(`  [${i + 1}] path=${d.path || "-"} motivo=${d.motivo || d.tema || "-"}`);
          });
        }

        console.groupEnd();

        setGenExamenMensajeModal(msg, "danger");
        mostrarAccionesDescarga(false);
        return;
      }

      const toAbs = (p) =>
        p ? `http://127.0.0.1:5050${p.startsWith("/") ? "" : "/"}${p}` : null;

      const docxUrlApi = toAbs(data.ruta_rel || "");
      const pdfUrlApi = toAbs(data.ruta_rel_pdf || "");
      const docxName = data.archivo_docx || null;
      const pdfName =
        data.archivo_pdf ||
        (docxName ? docxName.replace(/\.docx$/i, ".pdf") : null);

      window.__ultimoGenerado.docxUrl = docxUrlApi;
      window.__ultimoGenerado.pdfUrl = pdfUrlApi;
      window.__ultimoGenerado.docxName = data.archivo_docx || "examen.docx";
      window.__ultimoGenerado.pdfName = data.archivo_pdf || "examen.pdf";

      // Visor PDF: rutas bajo /api/... se sirven mejor sin prefijo api; si no hay PDF, pdf_from_docx
      let previewAbs = toAbs(data.preview_url || "");
      if (!pdfUrlApi && docxName) {
        try {
          const force = await fetch("http://127.0.0.1:5050/api/pdf_from_docx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ docx: docxName }),
          });
          const j = await force.json();
          if (force.ok && j.ok && j.ruta_rel_pdf) {
            const abs = toAbs(j.ruta_rel_pdf);
            window.__ultimoGenerado.pdfUrl = abs;
            window.__ultimoGenerado.pdfName = j.archivo_pdf;

            previewAbs = abs.replace(
              "http://127.0.0.1:5050/api/",
              "http://127.0.0.1:5050/"
            );
          } else {
            console.warn("pdf_from_docx falló:", j);
          }
        } catch (e) {
          console.warn("pdf_from_docx error:", e);
        }
      }

      ensureViewer();

      if (data.preview_kind === "pdf" && previewAbs) {
        cargarIframe(previewAbs);
      } else if (window.__ultimoGenerado.pdfUrl) {
        cargarIframe(
          window.__ultimoGenerado.pdfUrl.replace(
            "http://127.0.0.1:5050/api/",
            "http://127.0.0.1:5050/"
          )
        );
      } else {
        setGenExamenMensajeModal("No se pudo generar la vista PDF del examen.", "danger");
        mostrarAccionesDescarga(false);
        return;
      }

      ponerLinksVista(docxUrlApi, pdfUrlApi);
      mostrarAccionesDescarga(true);
      setGenExamenMensajeModal("Tu examen está listo.", "success");
    } catch (e) {
      console.error(e);
      setGenExamenMensajeModal("Error de red al generar el examen.", "danger");
      mostrarAccionesDescarga(false);
    }
  }

  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("#btnGenerarDesdeGrupo");
    if (!btn) return;
    const formato = btn.dataset.formato || "word";
    generarExamenGrupo(formato);
  });

  window.addEventListener("beforeunload", () => {
    if (blobUrlActual) URL.revokeObjectURL(blobUrlActual);
  });
})();

function showBanner(msg, kind = "info") {
  const b =
    document.getElementById("banner-estado") ||
    (() => {
      const el = document.createElement("div");
      el.id = "banner-estado";
      (document.querySelector(".pdf-vista") || document.body).prepend(el);
      return el;
    })();
  applyGenExamenBanner(b, kind, msg);
}

async function guardarUltimoDeDescargasDocx() {
  const res = await window.api?.saveLastFromFolder?.({
    sourceDir:
      "D:\\tesis software\\software_ia\\descargas",
    pattern: "\\.(docx)$",
    suggestedName: window.__ultimoGenerado?.docxName || "examen.docx",
  });
  if (!res?.ok && !res?.canceled) await uiAlert(res?.message || "No se pudo guardar.");
}
async function guardarUltimoDeDescargasPdf() {
  const res = await window.api?.saveLastFromFolder?.({
    sourceDir:
      "D:\\tesis software\\software_ia\\descargas",
    pattern: "\\.(pdf)$",
    suggestedName: window.__ultimoGenerado?.pdfName || "examen.pdf",
  });
  if (!res?.ok && !res?.canceled) await uiAlert(res?.message || "No se pudo guardar.");
}

document.addEventListener("click", async (ev) => {
  if (ev.target.closest("#btnGuardarDocx")) {
    try {
      if (window.examenSeleccionadoParaExportar) {
        console.log("[GUARDAR DOCX] Plan A: exportarExamenSeleccionado(docx)");
        return exportarExamenSeleccionado("docx");
      }

      const u = window.__ultimoGenerado?.docxUrl;
      const n = window.__ultimoGenerado?.docxName || "examen.docx";
      if (u) {
        console.log("[GUARDAR DOCX] Plan B: guardarDesdeUrl", u, n);
        const r = await window.api?.guardarDesdeUrl?.(u, n);
        if (!r?.ok && !r?.canceled)
          await uiAlert(r?.message || "No se pudo guardar DOCX.");
        return;
      }

      console.log("[GUARDAR DOCX] Plan C: saveLastFromFolder");
      const res = await window.api?.saveLastFromFolder?.({
        sourceDir:
          "D:\\tesis software\\software_ia\\descargas",
        pattern: "\\.(docx)$",
        suggestedName: n,
      });
      if (!res?.ok && !res?.canceled)
        await uiAlert(res?.message || "No se pudo guardar DOCX.");
    } catch (e) {
      console.error(e);
      await uiAlert("Error guardando DOCX.");
    }
  }

  if (ev.target.closest("#btnGuardarPdf")) {
    try {
      if (window.examenSeleccionadoParaExportar) {
        console.log("[GUARDAR PDF] Plan A: exportarExamenSeleccionado(pdf)");
        return exportarExamenSeleccionado("pdf");
      }

      const u = window.__ultimoGenerado?.pdfUrl;
      const n = window.__ultimoGenerado?.pdfName || "examen.pdf";
      if (u) {
        console.log("[GUARDAR PDF] Plan B: guardarDesdeUrl", u, n);
        const r = await window.api?.guardarDesdeUrl?.(u, n);
        if (!r?.ok && !r?.canceled)
          await uiAlert(r?.message || "No se pudo guardar PDF.");
        return;
      }

      console.log("[GUARDAR PDF] Plan C: saveLastFromFolder");
      const res = await window.api?.saveLastFromFolder?.({
        sourceDir:
          "D:\\tesis software\\software_ia\\descargas",
        pattern: "\\.(pdf)$",
        suggestedName: n,
      });
      if (!res?.ok && !res?.canceled)
        await uiAlert(res?.message || "No se pudo guardar PDF.");
    } catch (e) {
      console.error(e);
      await uiAlert("Error guardando PDF.");
    }
  }
});

function toAbs(p) {
  if (!p) return null;
  const base = "http://127.0.0.1:5050";
  return p.startsWith("http")
    ? p
    : `${base}${p.startsWith("/") ? "" : "/"}${p}`;
}

function cargarIframe(urlAbsOrel) {
  const cont = document.getElementById("visor-examen");
  const host = document.getElementById("pdf-host");
  if (!host) return;

  cont?.classList.remove("cargado");

  const url = urlAbsOrel.startsWith("http")
    ? urlAbsOrel
    : `http://127.0.0.1:5050${urlAbsOrel.startsWith("/") ? "" : "/"}${urlAbsOrel}`;

  console.log("[pdf] src ->", url);

  host.innerHTML = `
    <embed
      src="${url}#toolbar=1&navpanes=0&scrollbar=1"
      type="application/pdf"
      style="width:100%;height:100%;border:0;"
    />
  `;

  cont?.classList.add("cargado");
}

function ensureViewer() {
  const visor = document.getElementById("visor-examen");
  const pdfHost = document.getElementById("pdf-host");

  if (!visor) {
    console.warn("[ensureViewer] no existe #visor-examen en el HTML");
    return false;
  }

  if (!pdfHost) {
    const host = document.createElement("div");
    host.id = "pdf-host";
    host.style.width = "100%";
    host.style.height = "100%";
    host.style.border = "0";
    host.style.background = "#fff";
    visor.appendChild(host);
  }

  return true;
}

async function mostrarVistaDocx(nombreDocx) {
  ensureViewer();

  const base = "http://127.0.0.1:5050";
  const cont = document.getElementById("visor-examen");
  const host = document.getElementById("pdf-host");
  const btnAbrir = document.getElementById("btnAbrirPreview");
  if (!host) return;

  let frame = host.querySelector("iframe.gen-docx-preview");
  if (!frame) {
    host.innerHTML = "";
    frame = document.createElement("iframe");
    frame.className = "gen-docx-preview";
    frame.setAttribute("title", "Vista previa DOCX");
    frame.style.cssText = "width:100%;height:100%;border:0;";
    host.appendChild(frame);
  }

  const banner = (msg, kind = "success") => {
    const el =
      document.getElementById("banner-estado") ||
      (() => {
        const d = document.createElement("div");
        d.id = "banner-estado";
        (document.querySelector(".pdf-vista") ||
          document.getElementById("visor-examen") ||
          document.body
        ).prepend(d);
        return d;
      })();
    applyGenExamenBanner(el, kind, msg);
  };

  try {
    cont?.classList.remove("cargado");

    const resp = await fetch(
      `${base}/api/render_docx_guardado/${encodeURIComponent(nombreDocx)}`
    );
    const data = await resp.json();
    console.log("[preview data]", data);

    if (!data.ok || !data.html_url) {
      frame.removeAttribute("src");
      frame.removeAttribute("srcdoc");
      banner("No se pudo generar la vista previa del DOCX.", "warning");
      return;
    }

    const absUrl = `${base}${data.html_url}?v=${Date.now()}`;
    console.log("[preview url]", absUrl);

    if (btnAbrir) {
      btnAbrir.classList.remove("d-none");
      btnAbrir.onclick = () => window.open(absUrl, "_blank", "noopener");
    }

    frame.onload = () => cont?.classList.add("cargado");
    frame.removeAttribute("srcdoc");
    frame.src = absUrl;

    setTimeout(async () => {
      let looksBlank = false;
      try {
        looksBlank =
          !frame.contentWindow ||
          frame.contentWindow.location.href === "about:blank";
      } catch {
        looksBlank = true;
      }

      if (!looksBlank) return;

      try {
        const raw = await fetch(absUrl).then((r) => r.text());
        const baseTag = `<base href="${base}/">`;
        const styleFix = `<style>html,body{background:#fff;color:#111}
          img,svg{max-width:100%}*{box-sizing:border-box}</style>`;
        const html = raw.includes("<head>")
          ? raw.replace("<head>", `<head>${baseTag}${styleFix}`)
          : `${baseTag}${styleFix}${raw}`;
        frame.removeAttribute("src");
        frame.srcdoc = html;

        cont?.classList.add("cargado");

        console.log("[preview] srcdoc fallback aplicado");
        banner("Vista previa lista.", "success");
      } catch (e) {
        console.error("fallback srcdoc error:", e);
        const probe = `
          <html><head><meta charset="utf-8">
          <style>body{margin:0;font:16px/1.4 system-ui;background:#fff;color:#111}
          .wrap{padding:16px}</style></head>
          <body><div class="wrap">
            <h3>Prueba de visor</h3>
            <p>Si ves esto, el iframe funciona. El problema está en el HTML del preview.</p>
            <p><a href="${absUrl}" target="_blank" rel="noopener">Abrir preview en pestaña</a></p>
          </div></body></html>`;
        frame.removeAttribute("src");
        frame.srcdoc = probe;
        cont?.classList.add("cargado");
        banner("Se cargó modo prueba del visor.", "warning");
      }
    }, 900);
  } catch (e) {
    console.error("mostrarVistaDocx error:", e);
    cont?.classList.remove("cargado");
    banner("Error al solicitar la vista previa.", "danger");
  }
}

function mostrarAccionesDescarga(show) {
  const box = document.getElementById("accionesDescarga");
  if (!box) return;
  box.classList.toggle("d-none", !show);
  if (!show) {
    const links = document.getElementById("linksVista");
    if (links) links.innerHTML = "";
  }
}

function ponerLinksVista(docxUrl, pdfUrl) {
  const box = document.getElementById("linksVista");
  if (!box) return;
  const parts = [];
  if (docxUrl) {
    parts.push(
      `<a href="${docxUrl}" target="_blank" rel="noopener" class="btn gen-examen-btn gen-examen-btn--outline-docx"><i class="bi bi-file-earmark-word" aria-hidden="true"></i>Ver DOCX</a>`
    );
  }
  if (pdfUrl) {
    parts.push(
      `<a href="${pdfUrl}" target="_blank" rel="noopener" class="btn gen-examen-btn gen-examen-btn--pdf"><i class="bi bi-file-earmark-pdf" aria-hidden="true"></i>Ver PDF</a>`
    );
  }
  box.innerHTML = parts.join("");
}

(function initGenExamenGruposToggle() {
  const layout = document.getElementById("genExamenLayout");
  const btn = document.getElementById("btnToggleGenExamenGrupos");
  if (!layout || !btn) return;

  const icon = btn.querySelector("i.bi");
  const vh = btn.querySelector(".visually-hidden");

  function applyCollapsed(collapsed) {
    layout.classList.toggle("gen-modal-examen-layout--grupos-collapsed", collapsed);
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    btn.title = collapsed ? "Mostrar panel de grupos" : "Plegar panel de grupos";
    if (vh) vh.textContent = collapsed ? "Mostrar grupos" : "Plegar grupos";
    if (icon) {
      icon.classList.remove("bi-chevron-left", "bi-chevron-right");
      icon.classList.add(collapsed ? "bi-chevron-right" : "bi-chevron-left");
    }
  }

  btn.addEventListener("click", () => {
    applyCollapsed(!layout.classList.contains("gen-modal-examen-layout--grupos-collapsed"));
  });

  const modalExamen = document.getElementById("modal-examen");
  if (modalExamen) {
    modalExamen.addEventListener("hidden.bs.modal", () => {
      resetFlujoAvisosModalExamen();
      if (layout.classList.contains("gen-modal-examen-layout--grupos-collapsed")) {
        applyCollapsed(false);
      }
    });
  }
})();

(function () {
  if (typeof window.BANCO_API_BASE === "undefined") {
    window.BANCO_API_BASE = "http://localhost:5050/api/banco_preguntas";
  }

  let dtBancoResumen = null;
  let dtBancoDetalle = null;
  let bancoDataCache = [];
  let temaSeleccionadoBanco = null;
  let temasCacheBanco = null;
  let temaPreseleccionadoImport = null;

  /** Toolbar DataTables fuera de la tabla (como en exámenes importados). */
  function wireMbancoDataTableToolbar(api, opts) {
    const {
      hostSelector,
      lengthId,
      searchId,
      searchPlaceholder,
    } = opts;
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

  window.wireMbancoDataTableToolbar = wireMbancoDataTableToolbar;

  async function cargarBancoDesdeApi() {
    const r = await fetch(window.BANCO_API_BASE);
    let data = await r.json();
    if (!Array.isArray(data)) data = [];
    bancoDataCache = data;
  }

  async function fetchTemasAllBanco() {
    if (temasCacheBanco) return temasCacheBanco;
    const url = window.TEMAS_API_BASE
      ? `${window.TEMAS_API_BASE}?all=1`
      : "http://localhost:5050/api/temas?all=1";
    const r = await fetch(url);
    let temas = await r.json();
    if (!Array.isArray(temas)) temas = [];
    temasCacheBanco = temas;
    return temas;
  }

  async function construirResumenPorTema() {
    const mapCont = new Map();
    for (const row of bancoDataCache) {
      const temaId = row.tema_id ?? row.temaId ?? row.id_tema ?? 0;
      const temaNom = row.tema_nombre ?? row.temaNombre ?? "Sin tema";

      if (!mapCont.has(temaId)) {
        mapCont.set(temaId, {
          id_tema: temaId,
          tema: temaNom,
          n_preguntas: 0,
          n_solucionarios: 0,
        });
      }
      const item = mapCont.get(temaId);
      if (row.doc_preguntas_nombre) item.n_preguntas++;
      if (row.doc_sol_nombre) item.n_solucionarios++;
    }

    const temas = await fetchTemasAllBanco();
    const resumen = temas.map((t) => {
      const base = mapCont.get(t.id) || {
        id_tema: t.id,
        tema: t.nombre,
        n_preguntas: 0,
        n_solucionarios: 0,
      };
      base.tema = t.nombre;
      return base;
    });

    return resumen;
  }

 async function cargarBancoResumen() {
  await cargarBancoDesdeApi();
  const resumen = await construirResumenPorTema();

  if (!$.fn.DataTable.isDataTable("#tabla-banco-resumen")) {
    dtBancoResumen = $("#tabla-banco-resumen").DataTable({
      data: resumen,
      autoWidth: false,
      responsive: true,
      pageLength: 8,
      lengthMenu: [
        [8, 12, 20, 50, -1],
        [8, 12, 20, 50, "Todos"],
      ],
      dom: "<'mbanco-dt-toolbar mbanco-dt-toolbar--row'lf>rt<'mbanco-dt-bottom d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2'ip>",
      columnDefs: [
        { targets: 1, width: "11%" },
        { targets: 2, width: "13%" },
        { targets: 3, width: "9rem", orderable: false },
      ],
      columns: [
        { data: "tema", title: "Tema" },
        {
          data: "n_preguntas",
          title: "Nº de preguntas",
          className: "text-center",
        },
        {
          data: "n_solucionarios",
          title: "Nº de solucionarios",
          className: "text-center",
        },
        {
          data: null,
          title: "Acciones",
          orderable: false,
          className: "text-center",
          render: (row) => {
            const nom = String(row.tema ?? "")
              .replace(/&/g, "&amp;")
              .replace(/"/g, "&quot;")
              .replace(/</g, "&lt;");
            return `<button type="button" class="btn btn-outline-primary btn-sm btn-banco-detalles d-inline-flex align-items-center gap-1"
                      data-tema="${row.id_tema}"
                      data-nombre="${nom}">
                <i class="bi bi-journal-text" aria-hidden="true"></i>
                <span>Detalles</span>
             </button>`;
          },
        },
      ],
      language: {
        ...(window.DT_ES || {}),
        search: "",
        searchPlaceholder: "Buscar por nombre de tema…",
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
      },
      initComplete: function () {
        wireMbancoDataTableToolbar(this.api(), {
          hostSelector: "#bancoModalResumenDtToolbarHost",
          lengthId: "mbancoResumenDtLength",
          searchId: "mbancoResumenDtSearch",
          searchPlaceholder: "Nombre del tema…",
        });
      },
    });
  } else {
    dtBancoResumen.clear().rows.add(resumen).draw(false);
  }

  $(document).off("click", "#tabla-banco-resumen .btn-banco-detalles");
  $(document).on("click", "#tabla-banco-resumen .btn-banco-detalles", function () {
    console.log("[BANCO][CLICK DETALLE] botón pulsado");
    console.log("[BANCO][CLICK DETALLE] dataset.tema =", this.dataset.tema);
    console.log("[BANCO][CLICK DETALLE] dataset.nombre =", this.dataset.nombre);
    console.log("[BANCO][CLICK DETALLE] examenActual =", window.examenActual);

    const idTema = this.dataset.tema;
    const nombre = this.dataset.nombre;
    verDetalleTemaBanco(idTema, nombre);
  });
}

  function renderAccionesBanco(row) {
    const id = row.id;
    const hasPreg = !!row.doc_preguntas_nombre;
    const hasSol = !!row.doc_sol_nombre;

    const disabledDesc = hasPreg ? "" : "disabled";
    const solClass = hasSol ? "btn-outline-primary" : "btn-outline-secondary";
    const solText = hasSol ? "Cambiar sol." : "Agregar sol.";

    return `
      <div class="btn-group btn-group-sm mbanco-detalle-actions" role="group">
        <button type="button" class="btn btn-outline-success btn-sm"
                onclick="window.bancoDescPaquete(${id})"
                ${disabledDesc}>
          <i class="bi bi-download" aria-hidden="true"></i>
          Descargar
        </button>
        <button type="button" class="btn ${solClass} btn-sm"
                onclick="window.bancoAbrirSolucionario(${id})"
                ${disabledDesc}>
          <i class="bi bi-file-earmark-text" aria-hidden="true"></i>
          ${solText}
        </button>
        <button type="button" class="btn btn-outline-primary btn-sm"
                onclick="window.bancoAbrirEditar(${id})">
          <i class="bi bi-pencil" aria-hidden="true"></i>
          Editar
        </button>
        <button type="button" class="btn btn-outline-danger btn-sm"
                onclick="window.bancoEliminar(${id})">
          <i class="bi bi-trash" aria-hidden="true"></i>
          Eliminar
        </button>
      </div>`;
  }

  function cargarBancoDetalle() {
  console.log("[BANCO][cargarBancoDetalle] INICIO");
  console.log("[BANCO][cargarBancoDetalle] temaSeleccionadoBanco =", temaSeleccionadoBanco);
  console.log("[BANCO][cargarBancoDetalle] bancoDataCache size =", bancoDataCache?.length);

  if (!temaSeleccionadoBanco) {
    console.warn("[BANCO][cargarBancoDetalle] no hay temaSeleccionadoBanco");
    return;
  }

  const modalVisible = [...document.querySelectorAll("#modalBancoPreguntas")]
    .find(el => el.classList.contains("show") || el.style.display === "block");

  if (!modalVisible) {
    console.warn("[BANCO][cargarBancoDetalle] no hay modal visible");
    return;
  }

  const tablaEl = modalVisible.querySelector("#tabla-banco-detalle");
  if (!tablaEl) {
    console.warn("[BANCO][cargarBancoDetalle] no se encontró #tabla-banco-detalle dentro del modal visible");
    return;
  }

  const datos = bancoDataCache.filter((r) => {
    const tid = r.tema_id ?? r.temaId ?? r.id_tema;
    return String(tid) === String(temaSeleccionadoBanco);
  });

  console.log("[BANCO][cargarBancoDetalle] datos filtrados =", datos);
  console.log("[BANCO][cargarBancoDetalle] tablaEl =", tablaEl);
  console.log("[BANCO][cargarBancoDetalle] duplicados #tabla-banco-detalle =", document.querySelectorAll("#tabla-banco-detalle").length);

  const $tabla = $(tablaEl);

  if ($.fn.DataTable.isDataTable(tablaEl)) {
    console.log("[BANCO][cargarBancoDetalle] reutilizando DataTable detalle visible");
    const dt = $tabla.DataTable();
    dt.clear();
    dt.rows.add(datos);
    dt.draw(false);
    dt.columns.adjust().draw(false);
  } else {
    console.log("[BANCO][cargarBancoDetalle] creando DataTable detalle visible");
    dtBancoDetalle = $tabla.DataTable({
      data: datos,
      autoWidth: false,
      responsive: true,
      pageLength: 8,
      destroy: true,
      lengthMenu: [
        [8, 12, 20, 50, -1],
        [8, 12, 20, 50, "Todos"],
      ],
      dom: "<'mbanco-dt-toolbar mbanco-dt-toolbar--row'lf>rt<'mbanco-dt-bottom d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2'ip>",
      columns: [
        {
          data: "doc_preguntas_nombre",
          title: "DOCX Preguntas",
          render: (d) =>
            d
              ? `<span class="badge rounded-2 bg-secondary">${d}</span>`
              : '<span class="text-muted">No asignado</span>',
        },
        {
          data: "doc_sol_nombre",
          title: "Solucionario",
          render: (d) =>
            d
              ? `<span class="badge rounded-2 bg-secondary">${d}</span>`
              : '<span class="text-muted">Sin solucionario</span>',
        },
        {
          data: null,
          title: "Acciones",
          orderable: false,
          className: "text-nowrap",
          render: (row) => renderAccionesBanco(row),
        },
      ],
      language: {
        ...(window.DT_ES || {}),
        search: "",
        searchPlaceholder: "Buscar por nombre de archivo…",
        lengthMenu: "_MENU_",
        zeroRecords: "No se encontraron resultados",
        info: "_START_–_END_ de _TOTAL_",
        infoEmpty: "0 registros",
        infoFiltered: "(de _MAX_)",
        paginate: {
          first: "«",
          last: "»",
          next: "›",
          previous: "‹",
        },
        processing: "Procesando…",
      },
      initComplete: function () {
        wireMbancoDataTableToolbar(this.api(), {
          hostSelector: "#bancoModalDetalleDtToolbarHost",
          lengthId: "mbancoDetalleDtLength",
          searchId: "mbancoDetalleDtSearch",
          searchPlaceholder: "DOCX o solucionario…",
        });
      },
    });
  }

  console.log("[BANCO][cargarBancoDetalle] FIN");
}

function verDetalleTemaBanco(idTema, nombreTema) {
  console.log("[BANCO][verDetalleTemaBanco] INICIO");
  temaSeleccionadoBanco = idTema;

  const modalVisible = [...document.querySelectorAll("#modalBancoPreguntas")]
    .find(el => el.classList.contains("show") || el.style.display === "block");

  console.log("[BANCO][verDetalleTemaBanco] modalVisible =", modalVisible);

  if (!modalVisible) {
    console.error("[BANCO] No hay modalBancoPreguntas visible");
    return;
  }

  const lbl =
    modalVisible.querySelector("#bancoTituloTemaDetalle") ||
    modalVisible.querySelector("#bancoDetalleTema");

  if (lbl) lbl.textContent = nombreTema || "";

  const vRes = modalVisible.querySelector("#vista-banco-resumen");
  const vDet = modalVisible.querySelector("#vista-banco-detalle");

  console.log("[BANCO][verDetalleTemaBanco] vRes =", vRes);
  console.log("[BANCO][verDetalleTemaBanco] vDet =", vDet);

  if (vRes) vRes.classList.add("d-none");
  if (vDet) vDet.classList.remove("d-none");

  console.log("[BANCO][verDetalleTemaBanco] después del toggle");
  console.log("[BANCO][verDetalleTemaBanco] vRes classes =", vRes?.className);
  console.log("[BANCO][verDetalleTemaBanco] vDet classes =", vDet?.className);

  try {
    cargarBancoDetalle();
    console.log("[BANCO][verDetalleTemaBanco] cargarBancoDetalle() OK");

    setTimeout(() => {
    try {
      const modalVisible = [...document.querySelectorAll("#modalBancoPreguntas")]
        .find(el => el.classList.contains("show") || el.style.display === "block");

      const tablaEl = modalVisible?.querySelector("#tabla-banco-detalle");
      if (tablaEl && $.fn.DataTable.isDataTable(tablaEl)) {
        $(tablaEl).DataTable().columns.adjust().draw(false);
      }
    } catch (e) {
      console.warn("[BANCO][verDetalleTemaBanco] adjust detalle error", e);
    }
  }, 0);

  } catch (e) {
    console.error("[BANCO][verDetalleTemaBanco] ERROR en cargarBancoDetalle()", e);
    return;
  }

  console.log("[BANCO][verDetalleTemaBanco] FIN");
}

async function volverABancoResumen() {
  temaSeleccionadoBanco = null;

  const modalVisible = [...document.querySelectorAll("#modalBancoPreguntas")]
    .find(el => el.classList.contains("show") || el.style.display === "block");

  if (!modalVisible) return;

  const vRes = modalVisible.querySelector("#vista-banco-resumen");
  const vDet = modalVisible.querySelector("#vista-banco-detalle");

  if (vDet) vDet.classList.add("d-none");
  if (vRes) vRes.classList.remove("d-none");

  await cargarBancoResumen();

  setTimeout(() => {
    try {
      if ($.fn.DataTable.isDataTable("#tabla-banco-resumen")) {
        $("#tabla-banco-resumen").DataTable().columns.adjust().draw(false);
      }
    } catch (e) {
      console.warn("[BANCO][volverABancoResumen] adjust resumen error", e);
    }
  }, 0);
}

  async function recargarBancoDespuesDeCambio() {
    await cargarBancoResumen();
    if (temaSeleccionadoBanco) {
      cargarBancoDetalle();
    }
  }

  async function cargarTemasParaBanco() {
    const temas = await fetchTemasAllBanco();

    const opts = temas
      .map((t) => `<option value="${t.id}">${t.nombre}</option>`)
      .join("");

    const selImp = document.getElementById("bancoTemaImportar");
    const selEdit = document.getElementById("bancoTemaEditar");

    if (selImp) {
      selImp.innerHTML = opts;
      if (temaPreseleccionadoImport) {
        selImp.value = String(temaPreseleccionadoImport);
        selImp.disabled = true;
      } else {
        selImp.disabled = false;
      }
    }
    if (selEdit && !selEdit.dataset.fixed) {
      selEdit.innerHTML = opts;
    }
  }

  async function abrirModalBancoPreguntas() {
    try {
      const mainEx = document.getElementById("modal-examen");
      if (mainEx && mainEx.classList.contains("show")) {
        cerrarModalExamen();
      }

      temaSeleccionadoBanco = null;
      const vRes = document.getElementById("vista-banco-resumen");
      const vDet = document.getElementById("vista-banco-detalle");
      console.log("[BANCO][abrirModalBancoPreguntas] INICIO");
      console.log("[BANCO][abrirModalBancoPreguntas] examenActual =", window.examenActual);
      if (vRes && vDet) {
        vRes.classList.remove("d-none");
        vDet.classList.add("d-none");
      }

      await cargarBancoResumen();
      await cargarTemasParaBanco();

      const modalBancoEl = document.getElementById("modalBancoPreguntas");
      if (modalBancoEl && modalBancoEl.parentElement !== document.body) {
        document.body.appendChild(modalBancoEl);
      }

      bootstrap.Modal.getOrCreateInstance(modalBancoEl, {
        backdrop: "static",
        focus: true,
        keyboard: true,
      }).show();
    } catch (e) {
      console.error(e);
      await uiAlert("No se pudo cargar el banco de preguntas.");
    }
    console.log("[BANCO][abrirModalBancoPreguntas] modal mostrado");
  }

  document.addEventListener("click", async (ev) => {
    if (ev.target.closest("#btnBancoPreguntas")) {
      ev.preventDefault();
      temaPreseleccionadoImport = null;
      await abrirModalBancoPreguntas();
      return;
    }

    if (ev.target.closest("#btnBancoVolverResumen")) {
      ev.preventDefault();
      await volverABancoResumen();
      return;
    }

    if (ev.target.closest("#btnBancoImportar")) {
      ev.preventDefault();
      temaPreseleccionadoImport = null;
      await cargarTemasParaBanco();
      const modalImportarEl = document.getElementById("modalBancoImportar");
      if (modalImportarEl && modalImportarEl.parentElement !== document.body) {
        document.body.appendChild(modalImportarEl);
      }

      abrirModalSobre("modalBancoPreguntas", "modalBancoImportar");
      return;
    }

    if (ev.target.closest("#btnBancoImportarDetalle")) {
      ev.preventDefault();
      temaPreseleccionadoImport = temaSeleccionadoBanco;
      await cargarTemasParaBanco();
     const modalImportarEl = document.getElementById("modalBancoImportar");
    if (modalImportarEl && modalImportarEl.parentElement !== document.body) {
      document.body.appendChild(modalImportarEl);
    }

   abrirModalSobre("modalBancoPreguntas", "modalBancoImportar");
      return;
    }

    if (ev.target.closest("#btnBancoImportarGuardar")) {
      ev.preventDefault();
      await importarTemaBanco();
      return;
    }

    if (ev.target.closest("#btnBancoEditarGuardar")) {
      ev.preventDefault();
      await guardarEdicionBanco();
      return;
    }
  });

  async function importarTemaBanco() {
    const temaId = document.getElementById("bancoTemaImportar").value;
    const file = document.getElementById("bancoFilePreguntas").files[0];
    if (!temaId || !file) {
      await uiAlert("Selecciona un tema y un archivo DOCX.");
      return;
    }

    const fd = new FormData();
    fd.append("tema_id", temaId);
    fd.append("doc_preguntas", file);

    const r = await fetch(window.BANCO_API_BASE, {
      method: "POST",
      body: fd,
    });
    const j = await r.json();
    if (!r.ok) {
      await uiAlert(j.error || "Error al importar tema.");
      return;
    }

    bootstrap.Modal.getInstance(
      document.getElementById("modalBancoImportar")
    ).hide();
    document.getElementById("bancoFilePreguntas").value = "";
    await recargarBancoDespuesDeCambio();
  }

  window.bancoDescPaquete = function (id) {
    const url = `${window.BANCO_API_BASE}/${id}/download`;
    window.open(url, "_blank");
  };

  window.bancoEliminar = async function (id) {
    if (
      !(await uiConfirm("¿Eliminar este registro del banco?", {
        variant: "danger",
        title: "Eliminar del banco",
        confirmLabel: "Eliminar",
        dangerous: true,
      }))
    ) {
      return;
    }
    const r = await fetch(`${window.BANCO_API_BASE}/${id}`, {
      method: "DELETE",
    });
    const j = await r.json();
    if (!r.ok) {
      await uiAlert(j.error || "No se pudo eliminar.");
      return;
    }
    await recargarBancoDespuesDeCambio();
  };


  window.bancoAbrirEditar = async function (id) {
  await cargarTemasParaBanco();
  document.getElementById("bancoEditId").value = id;

  const fila =
    bancoDataCache.find((r) => String(r.id) === String(id)) || null;

  const selTema = document.getElementById("bancoTemaEditar");
  if (fila && selTema) {
    selTema.value = fila.tema_id || fila.temaId || selTema.value;
  }

  document.getElementById("bancoEditFilePreg").value = "";
  document.getElementById("bancoEditFileSol").value = "";

  const modalEditarEl = getLastById("modalBancoEditar");
  if (modalEditarEl && modalEditarEl.parentElement !== document.body) {
    document.body.appendChild(modalEditarEl);
  }

  abrirModalSobre("modalBancoPreguntas", "modalBancoEditar");
};

  /** Solucionario vía input file oculto (sin modal propio). */
  window.bancoAbrirSolucionario = function (id) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const fd = new FormData();
      fd.append("doc_solucionario", file);

      try {
        const r = await fetch(
          `${window.BANCO_API_BASE}/${id}/reemplazar/solucionario`,
          { method: "POST", body: fd }
        );
        const j = await r.json();
        if (!r.ok) {
          await uiAlert(j.error || "No se pudo guardar el solucionario.");
          return;
        }

        await uiAlert("✅ Solucionario guardado correctamente.");
        await recargarBancoDespuesDeCambio();
      } catch (err) {
        console.error(err);
        await uiAlert("❌ Error de red al guardar el solucionario.");
      }
    };

    input.click();
  };

  async function guardarEdicionBanco() {
    const id = document.getElementById("bancoEditId").value;
    const temaId = document.getElementById("bancoTemaEditar").value;
    const filePreg = document.getElementById("bancoEditFilePreg").files[0];
    const fileSol = document.getElementById("bancoEditFileSol").files[0];

    if (temaId) {
      const r = await fetch(`${window.BANCO_API_BASE}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema_id: Number(temaId) }),
      });
      const j = await r.json();
      if (!r.ok) {
        await uiAlert(j.error || "No se pudo actualizar el tema.");
        return;
      }
    }

    if (filePreg) {
      const fd = new FormData();
      fd.append("doc_preguntas", filePreg);
      const r = await fetch(
        `${window.BANCO_API_BASE}/${id}/reemplazar/preguntas`,
        { method: "POST", body: fd }
      );
      const j = await r.json();
      if (!r.ok) {
        await uiAlert(j.error || "No se pudo reemplazar DOCX de preguntas.");
        return;
      }
    }

    if (fileSol) {
      const fd = new FormData();
      fd.append("doc_solucionario", fileSol);
      const r = await fetch(
        `${window.BANCO_API_BASE}/${id}/reemplazar/solucionario`,
        { method: "POST", body: fd }
      );
      const j = await r.json();
      if (!r.ok) {
        await uiAlert(j.error || "No se pudo reemplazar solucionario.");
        return;
      }
    }

    bootstrap.Modal.getInstance(
      document.getElementById("modalBancoEditar")
    ).hide();
    await recargarBancoDespuesDeCambio();
  }
})();


if (window.__CUADERNILLOS_LOADED__) {
  console.warn("cuadernillos.js ya estaba cargado; omito segunda ejecución");
} else {
  window.__CUADERNILLOS_LOADED__ = true;
  window.__CUAD__ = window.__CUAD__ || {};
// --- BASE API robusta ---
const API = (
  window.API ?? `http://${location.hostname || "127.0.0.1"}:5050`
).replace(/\/+$/, "");

window.descargarDocBanco = async function (id) {
  try {
    if (!id) {
      await uiAlert("ID inválido.");
      return;
    }

    const url = apiURL(`/api/banco_preguntas/${id}/download/preguntas`);
    window.open(url, "_blank", "noopener");
  } catch (e) {
    console.error(e);
    await uiAlert("No se pudo abrir el documento.");
  }
};

function repararEstadoModales() {
  const visibles = [...document.querySelectorAll(".modal.show")];
  const backdrops = [...document.querySelectorAll(".modal-backdrop")];

  if (!visibles.length) {
    backdrops.forEach((b) => b.remove());
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("padding-right");
    return;
  }

  document.body.classList.add("modal-open");
  document.body.style.removeProperty("padding-right");

  visibles.forEach((m, i) => {
    m.style.display = "block";
    m.removeAttribute("aria-hidden");
    m.setAttribute("aria-modal", "true");
    m.style.zIndex = String(1055 + i * 20);
  });

  // dejar solo los backdrops necesarios
  while (backdrops.length > visibles.length) {
    const b = backdrops.shift();
    b?.remove();
  }

  const backdropsFinal = [...document.querySelectorAll(".modal-backdrop")];
  backdropsFinal.forEach((b, i) => {
    b.style.zIndex = String(1050 + i * 20);
    b.style.pointerEvents = i === backdropsFinal.length - 1 ? "auto" : "none";
  });

  const top = visibles[visibles.length - 1];
  setTimeout(() => {
    top
      ?.querySelector(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
      )
      ?.focus();
  }, 0);
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

window.addEventListener("focus", () => {
  setTimeout(repararEstadoModales, 0);
});

(function forceStaticModalsCuadOnce() {
  if (window.__CUAD_STATIC_MODALS__) return;
  window.__CUAD_STATIC_MODALS__ = true;

  const CUAD_MODAL_IDS = [
    "modalMatriz",
    "modalBancoPreguntasCuad",
    "modalGrupos",
    "modalGrupoForm",
    "modalImportarMatriz",
    "modalAleatorizacion",
    "modalTipoPrueba",
    "modalTemas",
    "modalTiposTema"
  ];

  function aplicarStatic(el) {
    if (!el) return;

    /* Los estilos de modales Cuadernillos usan .modal-cuad-root; al mover el nodo a
       body deja de existir el ancestro .cuadernillos-page, así que el marcador va en el propio .modal */
    el.classList.add("modal-cuad-root");

    el.setAttribute("data-bs-backdrop", "static");
    el.setAttribute("data-bs-keyboard", "false");

    if (el.parentElement !== document.body) {
      document.body.appendChild(el);
    }

    bootstrap.Modal.getOrCreateInstance(el, {
      backdrop: "static",
      keyboard: false,
      focus: true,
    });
  }

  function aplicarATodos() {
    CUAD_MODAL_IDS.forEach((id) => aplicarStatic(document.getElementById(id)));
  }

  document.addEventListener("DOMContentLoaded", aplicarATodos);

  document.addEventListener("shown.bs.modal", (ev) => {
    if (CUAD_MODAL_IDS.includes(ev.target.id)) {
      aplicarStatic(ev.target);
    }
  });

  const oldInitCuadernillos = window.initCuadernillos;
  window.initCuadernillos = async function (...args) {
    if (typeof oldInitCuadernillos === "function") {
      await oldInitCuadernillos.apply(this, args);
    }
    aplicarATodos();
  };
})();

function esModalTemasCuad(modalEl = null) {
  const modal = modalEl || document.getElementById("modalTemas");
  return modal?.dataset?.ctx === "cuad";
}

function esModalTemasBanco(modalEl = null) {
  const modal = modalEl || document.getElementById("modalTemas");
  return modal?.dataset?.ctx === "banco";
}
// Endpoint de Temas independiente de otros scripts
if (typeof window.TEMAS_API_BASE === "undefined") {
  window.TEMAS_API_BASE = `${API}/api/temas`;
}

// Endpoint específico para TEMAS en CUADERNILLOS
if (typeof window.TEMAS_API_BASE_CUAD === "undefined") {
  window.TEMAS_API_BASE_CUAD = `${API}/api/temas`; // usa CRUD completo existente

}

$(document).off("shown.bs.modal.dtFixCuad");
$(document).on(
  "shown.bs.modal.dtFixCuad",
  "#modalGrupos, #modalBancoPreguntasCuad, #modalGrupoForm, #modalTemas",
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
// ===================== INICIALIZACIÓN DEL MÓDULO =====================
window.initCuadernillos = async function () {
  console.log("🔁 initCuadernillos() → recargar exámenes importados");

  try {
    if (typeof window.__listarExamenesImportados === "function") {
      await window.__listarExamenesImportados();
    } else if (typeof listarExamenesImportados === "function") {
      await listarExamenesImportados();
    }
  } catch (e) {
    console.error("Error recargando exámenes importados desde initCuadernillos:", e);
  }

  const tbodyBanco = document.querySelector("#modalBancoPreguntasCuad #tbody-banco-temas-cuad");
if (tbodyBanco) {
  console.log("[INIT CUAD] banco detectado, no se limpia tbody");
}

const tbodyDetalle = document.querySelector(
  "#modalBancoPreguntasCuad #tbody-banco-detalle-cuad"
);
if (tbodyDetalle) {
  console.log("[INIT CUAD] banco detalle tbody detectado, no se limpia");
}

document.querySelectorAll("body > #modalBancoPreguntasCuad").forEach((el, i, arr) => {
  if (arr.length > 1 || !document.getElementById("contenido")?.contains(el)) {
    el.remove();
  }
});

};


// --- Helper para formar URLs seguras (acepta '/ruta', 'ruta', 'http://...') ---
function apiURL(p) {
  if (!p) return API;
  try {
    return new URL(p, API).href;
  } catch {
    return `${API}${p.startsWith("/") ? "" : "/"}${p}`;
  }
}

window.openTipoPrueba = async function () {
  const el = document.getElementById("modalTipoPrueba");
  if (!el) return console.error("No existe #modalTipoPrueba");

  // 🔁 Siempre que se abra el modal, recargamos la lista desde BD
  const fnListar =
    window.__listarExamenesImportados || window.listarExamenesImportados;
  if (typeof fnListar === "function") {
    try {
      await fnListar();
    } catch (e) {
      console.error("Error al refrescar exámenes importados:", e);
    }
  }

  if (el.parentElement !== document.body) document.body.appendChild(el);
  bootstrap.Modal.getOrCreateInstance(el, { backdrop: "static" }).show();
};

// Ejemplo: openTipoPrueba();
// Log de 404 útil (deja esto activo mientras depuras)
(function patchFetch404LogOnce() {
  if (window.__FETCH_404_PATCHED__) return;
  window.__FETCH_404_PATCHED__ = true;
  const _fetch = window.fetch;
  window.fetch = async function (input, init) {
    const res = await _fetch(input, init);
    try {
      const url = typeof input === "string" ? input : input?.url || "";
      if (res.status === 404)
        console.warn(
          "⚠️ 404",
          res.status,
          res.statusText,
          "->",
          url,
          init?.method || "GET"
        );
    } catch {}
    return res;
  };
})();

// ===========================
// MATRIZ (cuadernillos.js)
// ===========================
(function () {
  const DRAFT_KEY = "matriz_draft_v1"; // <- aquí persistimos nombre + (tema_id, cantidad)

  const DEFAULT_TEMPLATE = {
  nombre: "Matriz",
  filas: [
    { tema_id: 7,  cantidad: 10 }, // RAZONAMIENTO MATEMÁTICA
    { tema_id: 18, cantidad: 10 }, // RAZONAMIENTO VERBAL
    { tema_id: 17, cantidad: 5 },  // COMUNICACIÓN
    { tema_id: 2,  cantidad: 5 },  // ARITMÉTICA
    { tema_id: 4,  cantidad: 5 },  // ÁLGEBRA
    { tema_id: 6,  cantidad: 5 },  // GEOMETRÍA
    { tema_id: 5,  cantidad: 5 },  // TRIGONOMETRÍA
    { tema_id: 8,  cantidad: 5 },  // FÍSICA
    { tema_id: 9,  cantidad: 5 },  // QUÍMICA
    { tema_id: 10, cantidad: 5 },  // BIOLOGÍA
    { tema_id: 11, cantidad: 5 },  // ZOOLOGÍA
    { tema_id: 12, cantidad: 5 },  // ECOLOGÍA Y MEDIO AMBIENTE
    { tema_id: 16, cantidad: 5 },  // ECONOMÍA
    { tema_id: 13, cantidad: 5 },  // EDUCACIÓN CÍVICA
    { tema_id: 14, cantidad: 5 },  // GEOGRAFÍA DEL PERÚ Y EL MUNDO
    { tema_id: 15, cantidad: 5 }   // HISTORIA DEL PERÚ EN EL CONTEXTO MUNDIAL
  ]
};

function actualizarEstadoBtnGenerarMatriz() {
  const btn = document.getElementById("btn-generar-matriz");
  if (!btn) return;

  const filasValidas = FILAS.filter((r) => r && r.tema_id);
  const hayFilas = filasValidas.length > 0;

  const todosConArchivo = hayFilas && filasValidas.every((r) => !!r.file);
  btn.disabled = !todosConArchivo;
}

function hayTemaRepetidoEnMatriz() {
  const usados = new Set();

  for (const r of FILAS) {
    const temaId = Number(r?.tema_id || 0);
    if (!temaId) continue;

    if (usados.has(temaId)) return true;
    usados.add(temaId);
  }

  return false;
}

function validarTemasUnicosMatriz() {
  const usados = new Set();

  for (const r of FILAS) {
    const temaId = Number(r?.tema_id || 0);
    if (!temaId) continue;

    if (usados.has(temaId)) {
      throw new Error("No repitas el mismo tema.");
    }
    usados.add(temaId);
  }
}

  let TEMAS = []; // [{id, nombre, activo?}]
  let FILAS = []; // { key, tema_id, tema_nombre, cantidad, file }

  // ---- helpers API ----
  async function getTemasActivos() {
    const r = await fetch(apiURL("/api/temas_cuad"));
    const j = await r.json().catch(() => []);
    return Array.isArray(j) ? j.filter((t) => t.activo !== false) : [];
  }
  async function postJSON(p, body) {
    const r = await fetch(`${API}${p}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || "Error");
    return j;
  }
  async function postForm(p, fd) {
    const r = await fetch(`${API}${p}`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || "Error");
    return j;
  }

  // ---- persistencia (solo tema_id y cantidad, y nombre) ----
  function saveDraft() {
    try {
      const payload = {
        nombre: (
          document.getElementById("matriz-nombre")?.value || "Matriz"
        ).trim(),
        filas: FILAS.map((r) => ({
          tema_id: r.tema_id,
          cantidad: r.cantidad || 0,
        })),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }
  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.filas)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  // ---- helpers UI ----
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        }[c])
    );
  const optTemas = (sel) =>
  TEMAS.length
    ? [
        `<option value="" ${
          sel === null || sel === undefined || sel === "" ? "selected" : ""
        } disabled>Seleccione el tema</option>`,
        ...TEMAS.map(
          (t) =>
            `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${esc(
              t.nombre
            )}</option>`
        ),
      ].join("")
    : `<option value="">— No hay temas —</option>`;

  function addFila($tbody, preset) {
    if (!TEMAS.length) return;
   const temaElegidoId =
  preset?.tema_id !== undefined && preset?.tema_id !== null
    ? Number(preset.tema_id)
    : null;

  const temaElegido =
    temaElegidoId !== null
      ? TEMAS.find((t) => t.id == temaElegidoId) || null
      : null;

  const key = crypto.randomUUID();
  const cantidad = Math.max(0, parseInt(preset?.cantidad ?? 0, 10));

  FILAS.push({
    key,
    tema_id: temaElegido?.id || null,
    tema_nombre: temaElegido?.nombre || "",
    cantidad,
    file: null,
  });

    $tbody.insertAdjacentHTML(
      "beforeend",
      `
      <tr data-key="${key}">
        <td>
          <select class="form-select sel-tema">${optTemas(
          temaElegido?.id ?? null
        )}</select>
        </td>
        <td style="max-width:120px">
          <input type="number" class="form-control inp-cant" min="0" value="${cantidad}">
        </td>
        <td>
          <input type="file" class="inp-file" accept=".docx" hidden>
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <button type="button" class="btn btn-primary btn-importar">
              <i class="bi bi-upload" aria-hidden="true"></i> Importar
            </button>
            <span class="small text-muted file-name">Sin archivo</span>
          </div>
        </td>
        <td class="text-end">
          <button type="button" class="btn btn-outline-danger btn-quitar">
            <i class="bi bi-trash3" aria-hidden="true"></i> Eliminar
          </button>
        </td>
      </tr>
    `
    );
    actualizarResumenMatriz();
    actualizarEstadoBtnGenerarMatriz();
  }

  function restaurarDesdeDraft($tbody, draft) {
    // Nombre
    const $nombre = document.getElementById("matriz-nombre");
    if ($nombre && draft?.nombre) $nombre.value = draft.nombre;

    // Filas
    if (!draft?.filas?.length) return;
    for (const f of draft.filas) {
      // si el tema ya no existe (fue desactivado), lo saltamos
      if (!TEMAS.find((t) => t.id == f.tema_id)) continue;
      addFila($tbody, f);
    }
  }


  function actualizarResumenMatriz() {
  const $totalCursos = document.getElementById("totalCursosMatriz");
  const $totalPreguntas = document.getElementById("totalPreguntasMatriz");

  if (!$totalCursos || !$totalPreguntas) return;

  const filasValidas = FILAS.filter((r) => r && r.tema_id);

  const totalCursos = filasValidas.length;
  const totalPreguntas = filasValidas.reduce(
    (s, r) => s + Math.max(0, parseInt(r.cantidad || 0, 10)),
    0
  );

  $totalCursos.textContent = totalCursos;
  $totalPreguntas.textContent = totalPreguntas;
}
  // ================= Cableado al abrir el modal =================
  $(document).on("show.bs.modal", "#modalMatriz", async function () {
    // DOM refs
    const $tbody = document.getElementById("tbody-matriz");
    const $btnAdd = document.getElementById("btn-add-fila");
    const $btnClr = document.getElementById("btn-limpiar-filas");
    const $btnGen = document.getElementById("btn-generar-matriz");
    const $nombre = document.getElementById("matriz-nombre");

    // Estado inicial
    TEMAS = await getTemasActivos().catch(() => []);
    FILAS = [];
    $tbody.innerHTML = "";
    if ($nombre && !$nombre.value) $nombre.value = "Matriz";

    // Restaurar borrador (si existe)
    const draft = loadDraft();

    if (draft?.filas?.length) {
      restaurarDesdeDraft($tbody, draft);
    } else {
      restaurarDesdeDraft($tbody, DEFAULT_TEMPLATE);
      saveDraft();
      actualizarResumenMatriz();
      
    }
    actualizarEstadoBtnGenerarMatriz();

    // Botón: agregar fila
    $btnAdd.onclick = async () => {
      if (!TEMAS.length) {
        await uiAlert("No hay temas creados todavía.");
        return;
      }
      addFila($tbody);
      saveDraft();
    };

    // Botón: limpiar filas (también limpia borrador)
    $btnClr.onclick = () => {
      FILAS = [];
      $tbody.innerHTML = "";
      clearDraft();
      if ($nombre) $nombre.value = "Matriz";
      actualizarResumenMatriz();
      actualizarEstadoBtnGenerarMatriz();
    };

    // Guardar borrador al cambiar nombre
    if ($nombre) {
      $nombre.oninput = () => saveDraft();
    }

    // Delegación dentro de la tabla (cambios / clicks)
    $tbody.onchange = (ev) => {
      const el = ev.target;
      const tr = el.closest("tr");
      const key = tr?.dataset.key;
      const row = FILAS.find((r) => r.key === key);
      if (!row) return;

      if (el.classList.contains("sel-tema")) {
        const nuevoTemaId = Number(el.value || 0);

        const repetido = FILAS.some(
          (r) => r.key !== key && Number(r.tema_id || 0) === nuevoTemaId
        );

        if (nuevoTemaId && repetido) {
          uiAlert("No repitas el mismo tema.");
          el.value = "";
          row.tema_id = null;
          row.tema_nombre = "";
          saveDraft();
          actualizarResumenMatriz();
          actualizarEstadoBtnGenerarMatriz();
          return;
        }

        row.tema_id = nuevoTemaId || null;
        row.tema_nombre = TEMAS.find((t) => t.id == row.tema_id)?.nombre || "";
      } else if (el.classList.contains("inp-cant")) {
        row.cantidad = Math.max(0, parseInt(el.value || "0", 10));
      } else if (el.classList.contains("inp-file")) {
        row.file = el.files?.[0] || null;
        tr.querySelector(".file-name").textContent = row.file
          ? row.file.name
          : "Sin archivo";
      }

      saveDraft();
      actualizarResumenMatriz();
      actualizarEstadoBtnGenerarMatriz();
    };

    $tbody.onclick = (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      const tr = btn.closest("tr");
      const key = tr?.dataset.key;

      if (btn.classList.contains("btn-importar")) {
        tr.querySelector(".inp-file").click();
      } else if (btn.classList.contains("btn-quitar")) {
        const i = FILAS.findIndex((r) => r.key === key);
        if (i >= 0) FILAS.splice(i, 1);
        tr.remove();
        saveDraft();
        actualizarResumenMatriz();
        actualizarEstadoBtnGenerarMatriz();

      }
    };

    // Botón: generar matriz
    $btnGen.onclick = async () => {
  if (!FILAS.length) {
    await uiAlert("Agrega al menos un tema.");
    return;
  }
    try {
      validarTemasUnicosMatriz();
    } catch (e) {
      await uiAlert(e.message || "Hay temas repetidos.");
      return;
    }
  for (const r of FILAS) {
    if (!r.tema_id) {
      await uiAlert("Selecciona el tema en todas las filas.");
      return;
    }
    if (!r.file) {
      await uiAlert(`Falta importar el .docx para "${r.tema_nombre || "tema"}".`);
      return;
    }
  }

  const oldText = $btnGen.textContent;
  $btnGen.disabled = true;
  $btnGen.textContent = "Generando...";

  try {
    // 1) crear matriz
    const js = await postJSON("/api/matriz", {
      nombre: (
        document.getElementById("matriz-nombre")?.value || "Matriz"
      ).trim(),
      items: FILAS.map((r) => ({
        tema_id: r.tema_id,
        tema_nombre: r.tema_nombre,
        cantidad: r.cantidad || 0,
      })),
    });

    const matriz_id = js.matriz_id;

    // 2) subir archivos
    for (const r of FILAS) {
      const fd = new FormData();
      fd.append("file", r.file);
      fd.append("tema_id", String(r.tema_id));
      fd.append("cantidad", String(r.cantidad || 0));
      await postForm(`/api/matriz/${matriz_id}/upload`, fd);
    }

    // 3) generar y descargar
    const res = await fetch(apiURL(`/api/matriz/${matriz_id}/generar`), {
      method: "POST",
    });

    if (!res.ok) {
      let msg = "Error generando.";
      try {
        const j = await res.json();
        if (j?.faltantes?.length) {
          msg =
            "No hay suficientes preguntas:\n" +
            j.faltantes
              .map(
                (f) =>
                  `• ${f.tema}: pedidas ${f.pedidas}, detectadas ${f.detectadas}`
              )
              .join("\n");
        } else if (j?.error) {
          msg = j.error;
        }
      } catch {}
      throw new Error(msg);
    }

    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `matriz_${matriz_id}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    (bootstrap.Modal.getInstance(this) || new bootstrap.Modal(this)).hide();
  } catch (e) {
    await uiAlert(e.message || "No se pudo generar.");
  } finally {
    $btnGen.textContent = oldText;
    actualizarEstadoBtnGenerarMatriz();
  }
};
  });
})();

// ====== Utilidades (SEGUNDO BLOQUE) ======

// helpers globales (deben ir ANTES de usarse)

window.$$ =
  window.$$ ||
  function (sel, root = document) {
    return root.querySelector(sel);
  };
window.$qs =
  window.$qs ||
  function (sel, root = document) {
    return root.querySelector(sel);
  };
window.showModal =
  window.showModal ||
  function (id) {
    return new bootstrap.Modal($$(id)).show();
  };
window.hideModal =
  window.hideModal ||
  function (id) {
    const m = bootstrap.Modal.getInstance($$(id));
    if (m) m.hide();
  };

window.showModal =
  window.showModal ||
  function (sel) {
    const el = $$(sel);
    if (!el) return;
    const modal =
      bootstrap.Modal.getInstance(el) || bootstrap.Modal.getOrCreateInstance
        ? bootstrap.Modal.getOrCreateInstance(el)
        : new bootstrap.Modal(el);
    modal.show();
  };
const esc2 = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[
        c
      ])
  );

async function fetchTemas() {
  const r = await fetch(apiURL("/api/temas"));
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j : [];
}

window.__matrizSeleccionada = null;

// ===========================
// Importar Matriz (VERSIÓN SIMPLE Y ROBUSTA, FIJA)
// ===========================
(() => {
  // Usamos una bandera NUEVA para evitar conflictos con otros archivos
 
  if (window.__IMP_MATRIZ_SIMPLE_BOUND2__) return;
  window.__IMP_MATRIZ_SIMPLE_BOUND2__ = true;

  const sel = {
    modal: "#modalImportarMatriz",
    origenBD: "#origenBD",
    origenArchivo: "#origenArchivo",
    boxBD: "#boxBD",
    boxFile: "#boxFile",
    selMatriz: "#selMatriz",
    file: "#matrizFile",
    btnImportar: "#btnImportarOK",
  };

  function setOrigen() {
    const rbBD = document.querySelector(sel.origenBD);
    const bd = !!rbBD?.checked;

    const boxBD = document.querySelector(sel.boxBD);
    const boxFile = document.querySelector(sel.boxFile);

    if (boxBD) {
      const cb = boxBD.querySelector("select");
      if (cb) cb.disabled = !bd;
    }
    if (boxFile) {
      const inp = boxFile.querySelector("input[type='file']");
      if (inp) inp.disabled = bd;
    }
  }

  // ---------- Click en "Importar matriz" (abre modal y carga matrices) ----------
  document.addEventListener("click", async (ev) => {
    const trigger = ev.target.closest("#btnImportarMatriz");
    if (!trigger) return;

    console.log("[MATRIZ] Click en btnImportarMatriz");

    // cargar matrices de BD
    try {
      const selMat = document.querySelector(sel.selMatriz);
      if (selMat) selMat.innerHTML = `<option value="">Cargando…</option>`;
      const r = await fetch(apiURL("/api/matrices"));
      const matrices = await r.json().catch(() => []);
      if (selMat) {
        selMat.innerHTML =
          Array.isArray(matrices) && matrices.length
            ? matrices
                .map(
                  (m) =>
                    `<option value="${m.id}">${m.id} — ${esc2(
                      m.nombre || ""
                    )}</option>`
                )
                .join("")
            : `<option value="">(No hay matrices)</option>`;
      }
    } catch (e) {
      console.error(e);
      const selMat = document.querySelector(sel.selMatriz);
      if (selMat)
        selMat.innerHTML = `<option value="">(Error listando)</option>`;
    }

    // estado inicial: BD
    const rbBD = document.querySelector(sel.origenBD);
    const rbArchivo = document.querySelector(sel.origenArchivo);
    if (rbBD) rbBD.checked = true;
    if (rbArchivo) rbArchivo.checked = false;
    setOrigen();

    // mostrar modal
    const modalEl = document.querySelector(sel.modal);
    if (!modalEl) {
      console.error("[MATRIZ] No existe modalImportarMatriz");
      return;
    }
    const modal =
      bootstrap.Modal.getInstance(modalEl) ||
      bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: "static" });
    modal.show();
  });

  // ---------- Cambiar origen BD / Archivo (delegado) ----------
  document.addEventListener("change", (ev) => {
    if (
      ev.target.matches(sel.origenBD) ||
      ev.target.matches(sel.origenArchivo)
    ) {
      setOrigen();
    }
  });

  // Clic en la tarjeta marca el radio; no interferir con select ni file
  document.addEventListener("click", (ev) => {
    const block = ev.target.closest(
      "#modalImportarMatriz .cuad-import-matriz-block"
    );
    if (!block) return;
    if (ev.target.closest("#selMatriz, #matrizFile")) return;
    if (ev.target.closest("select")) return;
    if (ev.target.closest("input[type='file']")) return;
    if (ev.target.closest('label[for="selMatriz"]')) return;

    const radio = block.querySelector('input[type="radio"][name="origen"]');
    if (!radio || radio.checked) return;
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // ---------- Al mostrar el modal, enganchar el click de "#btnImportarOK" ----------
  document.addEventListener("shown.bs.modal", (ev) => {
     if (ev.target.id !== "modalImportarMatriz") return;

  console.log("[MATRIZ] modalImportarMatriz shown → bind btnImportarOK");

  const btn = document.querySelector("#btnImportarOK");
  if (!btn) {
    console.warn("[MATRIZ] No se encontró #btnImportarOK");
    return;
  }

    btn.onclick = async (e) => {
      e.preventDefault();
      console.log("[MATRIZ] Click en btnImportarOK");

      try {
        const rbBD = document.querySelector(sel.origenBD);
        const usandoBD = !!rbBD?.checked;

        if (usandoBD) {
          // ---- MODO BD ----
          const selMat = document.querySelector(sel.selMatriz);
          const id = selMat?.value;
          if (!id) {
            await uiAlert("Selecciona una matriz de la base de datos.");
            return;
          }
          window.__matrizSeleccionada = {
            tipo: "db",
            id: Number(id),
            nombre:
              selMat.selectedOptions[0]?.textContent.trim() || "Matriz BD",
          };
          console.log(
            "[MATRIZ] Seleccionada matriz BD:",
            window.__matrizSeleccionada
          );
          await uiAlert("✅ Matriz importada desde BD.");
        } else {
          // ---- MODO ARCHIVO DOCX ----
          const inp = document.querySelector(sel.file);
          const f = inp?.files?.[0];
          if (!f) {
            await uiAlert("Elige un archivo .docx.");
            return;
          }
          window.__matrizSeleccionada = {
            tipo: "docx",
            nombre: f.name,
            file: f,
          };
          console.log(
            "[MATRIZ] Seleccionada matriz DOCX:",
            window.__matrizSeleccionada
          );
          await uiAlert("✅ Matriz DOCX seleccionada.");
        }

        // Cerrar modal
        const modalEl = document.querySelector(sel.modal);
        if (modalEl) {
          const m =
            bootstrap.Modal.getInstance(modalEl) ||
            bootstrap.Modal.getOrCreateInstance(modalEl);
          m.hide();
        }
      } catch (e2) {
        console.error(e2);
        await uiAlert(e2.message || "No se pudo importar la matriz.");
      }
    };
  });
})();

// ===========================
// BANCO DE PREGUNTAS → MATRIZ
// ===========================


// ===========================
// BANCO DE PREGUNTAS → MATRIZ
// ===========================
function cerrarModalById(id) {
  const el = document.getElementById(id);
  if (!el) return;

  const inst =
    bootstrap.Modal.getInstance(el) ||
    bootstrap.Modal.getOrCreateInstance(el);

  inst.hide();
}

(() => {
  // mapa: tema_id -> Set(doc_ids)
  const SELECCION = {};
  const getSet = (temaId) => {
    const key = String(temaId);
    if (!SELECCION[key]) SELECCION[key] = new Set();
    return SELECCION[key];
  };

  const CUAD_BANCO_TITULO_LISTA = "Banco de preguntas por temario";

function getModalBancoEl() {
  const els = [...document.querySelectorAll("#modalBancoPreguntasCuad")];
  const enContenido = els.find((el) =>
    document.getElementById("contenido")?.contains(el)
  );
  return enContenido || els[els.length - 1] || null;
}

function getBancoTbody() {
  const modalBancoEl = getModalBancoEl();
  const tb = modalBancoEl?.querySelector("#tbody-banco-temas-cuad") || null;
  console.log("[BANCO] getBancoTbody ->", tb, " dentro de modal:", modalBancoEl);
  return tb;
}

function getDetalleTbody() {
  const modalBancoEl = getModalBancoEl();
  const tb = modalBancoEl?.querySelector("#tbody-banco-detalle-cuad") || null;
  console.log("[BANCO] getDetalleTbody ->", tb, " dentro de modal:", modalBancoEl);
  return tb;
}

function mostrarVistaBancoCuad(vista) {
  const modal = getModalBancoEl();
  if (!modal) return;

  modal.dataset.cuadBancoVista = vista;

  const vRes = modal.querySelector("#cuad-banco-vista-resumen");
  const vDet = modal.querySelector("#cuad-banco-vista-detalle");
  const footRes = modal.querySelector("#cuad-banco-footer-resumen");
  const footDet = modal.querySelector("#cuad-banco-footer-detalle");
  const icon = modal.querySelector("#cuadBancoHeaderIcon");
  const titulo = modal.querySelector("#cuadBancoTituloTexto");
  const closeBtn = modal.querySelector(".cuad-banco-header-close");

  if (closeBtn) {
    closeBtn.setAttribute(
      "aria-label",
      vista === "detalle" ? "Volver al listado de temas" : "Cerrar"
    );
  }

  if (vista === "resumen") {
    vRes?.classList.add("cuad-banco-view--active");
    vDet?.classList.remove("cuad-banco-view--active");
    footRes?.classList.remove("d-none");
    footDet?.classList.add("d-none");
    footDet?.classList.remove("d-flex");
    if (icon) {
      icon.className = "bi bi-collection cuad-banco-header-icon";
      icon.setAttribute("aria-hidden", "true");
    }
    if (titulo) titulo.textContent = CUAD_BANCO_TITULO_LISTA;
  } else {
    vRes?.classList.remove("cuad-banco-view--active");
    vDet?.classList.add("cuad-banco-view--active");
    footRes?.classList.add("d-none");
    footDet?.classList.remove("d-none");
    footDet?.classList.add("d-flex");
    if (icon) {
      icon.className = "bi bi-list-ul cuad-banco-header-icon";
      icon.setAttribute("aria-hidden", "true");
    }
  }
}

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[c])
  );

async function abrirModalBanco() {
  const modalBancoEl = getModalBancoEl();
  if (!modalBancoEl) {
    console.error("[BANCO] No existe #modalBancoPreguntasCuad");
    return;
  }

  try {
    // siempre volver al resumen al abrir
    const tbodyDetalle = getDetalleTbody();
    if (tbodyDetalle) tbodyDetalle.innerHTML = "";
    TEMA_ACTUAL_DETALLE = null;
    mostrarVistaBancoCuad("resumen");

    if (modalBancoEl.parentElement !== document.body) {
      document.body.appendChild(modalBancoEl);
    }

    const tbody = getBancoTbody();
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="3" class="cuad-table-empty">Cargando…</td></tr>';
    }

    const mBanco =
      bootstrap.Modal.getInstance(modalBancoEl) ||
      bootstrap.Modal.getOrCreateInstance(modalBancoEl, {
        backdrop: "static",
        focus: true,
        keyboard: true,
      });

    mBanco.show();
    console.log("[BANCO] modalBancoPreguntasCuad mostrado");

    // Mostrar el modal al instante; los datos llegan después (antes await bloqueaba show)
    requestAnimationFrame(() => {
      void cargarResumenTemas();
    });
  } catch (e) {
    console.error("[BANCO] Error abriendo modal banco:", e);
    await uiAlert("No se pudo abrir el banco de preguntas.");
  }
}



// ---------- MODAL BANCO (lista de temas) ----------
async function cargarResumenTemas() {
  console.log("[BANCO] ===== cargarResumenTemas() START =====");

  const modalBancoEl = getModalBancoEl();
  const tbody = getBancoTbody();

  console.log("[BANCO] modalBanco visible?", modalBancoEl?.classList.contains("show"));
  console.log("[BANCO] modalBanco parent:", modalBancoEl?.parentElement);
  console.log("[BANCO] tbody encontrado?", !!tbody);

  if (!tbody) {
    console.warn("[BANCO] No se encontró #tbody-banco-temas-cuad dentro de modalBancoPreguntas");
    return;
  }

  tbody.innerHTML =
    '<tr><td colspan="3" class="cuad-table-empty">Cargando…</td></tr>';
  console.log("[BANCO] tbody puesto en Cargando...");

  try {
    const url = `${API}/api/banco_preguntas/resumen_temas`;
    console.log("[BANCO] fetch ->", url);

    const res = await fetch(url);

    console.log("[BANCO] fetch status =", res.status, res.statusText);

    const data = await res.json();
    console.log("[BANCO] data recibida =", data);

    if (!Array.isArray(data)) {
      console.warn("[BANCO] data NO es array");
      tbody.innerHTML =
        '<tr><td colspan="3" class="cuad-table-empty">Error de formato.</td></tr>';
      return;
    }

    if (!data.length) {
      console.warn("[BANCO] data viene vacía");
      tbody.innerHTML =
        '<tr><td colspan="3" class="cuad-table-empty">No hay temas con banco de preguntas.</td></tr>';
      return;
    }

    const html = data
      .map((t) => {
        const setSel = getSet(t.tema_id);
        const nSel = setSel.size;

        return `
          <tr data-tema-id="${t.tema_id}">
            <td>${esc(t.tema_nombre)}</td>
            <td class="text-center">
              <span class="badge bg-secondary rounded-pill cuad-banco-count" id="banco-count-${t.tema_id}">
                ${nSel}
              </span>
            </td>
            <td class="text-end">
              <button type="button" class="btn btn-primary btn-banco-detalle">
                <i class="bi bi-list-ul" aria-hidden="true"></i> Detalle
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    console.log("[BANCO] html generado length =", html.length);

    tbody.innerHTML = html;

    console.log("[BANCO] tbody.innerHTML asignado");
    console.log("[BANCO] filas renderizadas =", tbody.querySelectorAll("tr").length);
    console.log("[BANCO] ===== cargarResumenTemas() END OK =====");
  } catch (e) {
    console.error("[BANCO] ERROR en cargarResumenTemas()", e);
    tbody.innerHTML =
      '<tr><td colspan="3" class="cuad-table-empty">Error cargando banco de preguntas.</td></tr>';
  }
}

function waitModalHidden(el) {
  return new Promise((resolve) => {
    if (!el) {
      resolve();
      return;
    }

    const done = () => resolve();

    el.addEventListener("hidden.bs.modal", done, { once: true });

    // fallback por si ya estaba completamente oculto
    setTimeout(() => {
      const visible =
        el.classList.contains("show") ||
        el.style.display === "block" ||
        el.getAttribute("aria-hidden") === "false";
      if (!visible) resolve();
    }, 350);
  });
}

function waitModalShown(el) {
  return new Promise((resolve) => {
    if (!el) {
      resolve();
      return;
    }

    el.addEventListener(
      "shown.bs.modal",
      () => resolve(),
      { once: true }
    );
  });
}







// Botón dentro de Matriz
document.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("#btnBancoPreguntasCuad");
  if (!btn) return;

  ev.preventDefault();
  ev.stopPropagation();

  console.log("[BANCO] click delegado en btnBancoPreguntas");
  abrirModalBanco();
});

function debugDuplicadosBanco() {
  const modalesBanco = document.querySelectorAll("#modalBancoPreguntasCuad");
  const tbTemas = document.querySelectorAll("#tbody-banco-temas-cuad");
  const tbDetalle = document.querySelectorAll("#tbody-banco-detalle-cuad");

  console.log("[BANCO][DUP] #modalBancoPreguntasCuad =", modalesBanco.length, modalesBanco);
  console.log("[BANCO][DUP] #tbody-banco-temas-cuad =", tbTemas.length, tbTemas);
  console.log("[BANCO][DUP] #tbody-banco-detalle-cuad =", tbDetalle.length, tbDetalle);
}



// ---------- MODAL DETALLE ----------
let TEMA_ACTUAL_DETALLE = null;

function renderDetalleBancoTbody(tema_id, docs) {
  const tbody = getDetalleTbody();
  if (!tbody) return;

  const selPrev = getSet(tema_id);

  if (!docs.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="text-center text-muted">No hay preguntas para este tema.</td></tr>';
    return;
  }

  tbody.innerHTML = docs
    .map((d) => {
      const checked = selPrev.has(d.id) ? "checked" : "";
      const nombreDoc =
        d.nombre || d.doc_name || d.doc_preguntas_nombre || "(Sin nombre)";

      return `
          <tr data-doc-id="${d.id}">
            <td class="text-center">
              <input type="checkbox" value="${d.id}" class="banco-chk" ${checked}>
            </td>
            <td>${d.id}</td>
            <td>${nombreDoc}</td>
            <td class="text-end">
              <button type="button" class="btn btn-sm btn-outline-secondary btn-banco-ver-doc" onclick="descargarDocBanco(${d.id})">
                <i class="bi bi-file-earmark-arrow-down" aria-hidden="true"></i>
                Ver
              </button>
            </td>
          </tr>
        `;
    })
    .join("");
}

async function fetchDocsBancoTema(tema_id) {
  try {
    const res = await fetch(
      `${API}/api/banco_preguntas?tema_id=${encodeURIComponent(tema_id)}`
    );
    let docs = await res.json();
    if (!Array.isArray(docs)) docs = [];
    return docs.filter((d) => String(d.tema_id) === String(tema_id));
  } catch (e) {
    console.error(e);
    return [];
  }
}

function abrirDetalleBancoTema(tema_id, tema_nombre) {
  const modalBancoEl = getModalBancoEl();
  if (!modalBancoEl) return;

  TEMA_ACTUAL_DETALLE = Number(tema_id);

  const titulo = modalBancoEl.querySelector("#cuadBancoTituloTexto");
  const nombre = tema_nombre || `Tema ${tema_id}`;
  if (titulo) titulo.textContent = `Preguntas del banco — ${nombre}`;

  const tbody = getDetalleTbody();
  if (!tbody) return;

  tbody.innerHTML =
    '<tr><td colspan="4" class="text-center text-muted">Cargando…</td></tr>';

  mostrarVistaBancoCuad("detalle");

  void fetchDocsBancoTema(tema_id).then((docs) => {
    renderDetalleBancoTbody(tema_id, docs);
  });
}

async function guardarSeleccionBancoTemaActual() {
  const modalBancoEl = getModalBancoEl();
  if (!modalBancoEl) return;
  if (!TEMA_ACTUAL_DETALLE) return;

  const tbody = getDetalleTbody();
  if (!tbody) return;

  const setSel = getSet(TEMA_ACTUAL_DETALLE);
  setSel.clear();

  tbody.querySelectorAll("tr").forEach((tr) => {
    const chk = tr.querySelector(".banco-chk");
    if (!chk) return;
    const docId = Number(tr.getAttribute("data-doc-id"));
    if (chk.checked && docId) setSel.add(docId);
  });

  const span = modalBancoEl.querySelector(`#banco-count-${TEMA_ACTUAL_DETALLE}`);
  if (span) span.textContent = String(setSel.size);

  mostrarVistaBancoCuad("resumen");

  const tb = getBancoTbody();
  if (tb) {
    tb.innerHTML = '<tr><td colspan="3" class="cuad-table-empty">Cargando…</td></tr>';
  }
  requestAnimationFrame(() => {
    void cargarResumenTemas();
  });
}

document.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("#btnBancoGuardarSeleccion");
  if (!btn) return;

  ev.preventDefault();
  btn.disabled = true;
  try {
    await guardarSeleccionBancoTemaActual();
  } finally {
    btn.disabled = false;
  }
});

document.addEventListener("click", (ev) => {
  if (ev.target.closest("#btnCuadBancoVolver")) {
    ev.preventDefault();
    mostrarVistaBancoCuad("resumen");
    return;
  }

  const btnDetalle = ev.target.closest(".btn-banco-detalle");
  if (!btnDetalle) return;

  const tr = btnDetalle.closest("tr");
  const temaId = tr?.dataset.temaId || tr?.getAttribute("data-tema-id");
  if (!temaId) return;

  const nombre = tr.children[0]?.textContent?.trim() || "";
  abrirDetalleBancoTema(temaId, nombre);
});



  // ---------- GENERAR MATRIZ DESDE BANCO (preguntas) ----------

  async function generarMatrizDesdeBanco(solucionario = false) {
    const items = Object.entries(SELECCION)
      .map(([temaId, setSel]) => ({
        tema_id: Number(temaId),
        doc_ids: Array.from(setSel || []),
      }))
      .filter((it) => it.tema_id && it.doc_ids.length);

    if (!items.length) {
      await uiAlert("Selecciona al menos una pregunta en el banco.");
      return;
    }

    const nombre =
      (document.getElementById("matriz-nombre")?.value ||
        "Matriz desde banco").trim() || "Matriz desde banco";

    const url = solucionario
      ? apiURL("/api/matriz/generar_desde_banco/solucionario")
      : apiURL("/api/matriz/generar_desde_banco");

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, items }),
      });

      if (res.status === 409) {
        // caso especial: faltan solucionarios
        let data = {};
        try {
          data = await res.json();
        } catch {}
        if (data?.faltantes?.length) {
          const temas = data.faltantes
            .map((f) => f.tema_nombre || f.tema || "")
            .filter(Boolean);
          await uiAlert(
            "No se puede generar el solucionario.\nFaltan solucionarios de:\n- " +
              [...new Set(temas)].join("\n- ")
          );
          return;
        }
      }

      if (!res.ok) {
        let data = {};
        try {
          data = await res.json();
        } catch {}
        throw new Error(data.error || `Error HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const urlBlob = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlBlob;
      a.download = solucionario
        ? "matriz_solucionario.docx"
        : "matriz_desde_banco.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(urlBlob);

      // cerrar modal Banco
     const modalBancoEl = document.getElementById("modalBancoPreguntasCuad");
      if (modalBancoEl) {
        const mBanco =
          bootstrap.Modal.getInstance(modalBancoEl) ||
          bootstrap.Modal.getOrCreateInstance(modalBancoEl);
        mBanco.hide();
      }
    } catch (e) {
      console.error(e);
      await uiAlert(e.message || "No se pudo generar la matriz desde el banco.");
    }
  }

  // Botón verde "Generar matriz desde banco de preguntas"
 document.addEventListener("click", (ev) => {
  const btnNormal = ev.target.closest("#btnBancoGenerarMatriz");
  if (btnNormal) {
    ev.preventDefault();
    generarMatrizDesdeBanco(false);
    return;
  }

  const btnSol = ev.target.closest("#btn-generar-matriz-banco-sol");
  if (btnSol) {
    ev.preventDefault();
    generarMatrizDesdeBanco(true);
  }
});

  const modalBancoRoot = document.getElementById("modalBancoPreguntasCuad");
  if (modalBancoRoot && !modalBancoRoot.dataset.cuadBancoCloseBound) {
    modalBancoRoot.dataset.cuadBancoCloseBound = "1";
    modalBancoRoot.addEventListener(
      "click",
      (e) => {
        const btn = e.target.closest(".cuad-banco-header-close");
        if (!btn || !modalBancoRoot.contains(btn)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (modalBancoRoot.dataset.cuadBancoVista === "detalle") {
          mostrarVistaBancoCuad("resumen");
        } else {
          const inst =
            bootstrap.Modal.getInstance(modalBancoRoot) ||
            bootstrap.Modal.getOrCreateInstance(modalBancoRoot);
          inst.hide();
        }
      },
      true
    );
  }
})();


document.addEventListener("hidden.bs.modal", (ev) => {
  if (ev.target.id !== "modalBancoPreguntasCuad") return;

  console.log("[BANCO] hidden modalBancoPreguntas");
  console.log("[BANCO] returnTo =", ev.target.dataset.returnTo);
  console.log("[BANCO] goingDetail =", ev.target.dataset.goingDetail);

  if (ev.target.dataset.goingDetail === "1") {
    delete ev.target.dataset.goingDetail;
  }
});




// ====== Generar/Descargar grupos ======
(function bindGenerarGruposOnce() {
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("#btnGenerarGrupos");
    if (!btn) return;

    // si ya está corriendo, ignorar
    if (window.__GEN_GRUPOS_RUNNING__) return;

    window.__GEN_GRUPOS_RUNNING__ = true;
    const oldTxt = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Generando...";

    // helper para dejar el botón SIEMPRE bien
    const resetBtn = () => {
      btn.disabled = false;
      btn.innerText = oldTxt;
      window.__GEN_GRUPOS_RUNNING__ = false;
    };

    try {
      const sel = window.__matrizSeleccionada;
      if (!sel) {
        await uiAlert("Primero importa/selecciona una matriz.");
        resetBtn();
        return;
      }

      let res, j;

      if (sel.tipo === "db") {
        // 👉 MODO 1: matriz desde BD
        const body = { matriz_id: sel.id };
        res = await fetch(apiURL("/api/grupos/generar"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        j = await res.json().catch(() => ({}));
      } else if (sel.tipo === "docx") {
        // 👉 MODO 2: matriz desde archivo DOCX
        const fd = new FormData();
        fd.append("file", sel.file);
        res = await fetch(apiURL("/api/grupos/generar_from_docx"), {
          method: "POST",
          body: fd,
        });
        j = await res.json().catch(() => ({}));
      } else {
        throw new Error("Tipo de matriz no soportado.");
      }

      if (!res.ok || j.ok === false) {
        if (j?.faltantes?.length) {
          const detalle = j.faltantes.map((f) => `• ${f}`).join("\n");
          throw new Error("No se pudo generar:\n" + detalle);
        }
        throw new Error(j.error || "Error generando.");
      }

      // descarga ZIP si viene url
      if (j.zip_url) {
  const resZip = await fetch(apiURL(j.zip_url));
  if (!resZip.ok) throw new Error("No se pudo descargar el ZIP.");

  const blob = await resZip.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `grupos_${j.lote_id}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

      await uiAlert("Exámenes por grupo generados correctamente.");
      resetBtn();
    } catch (e) {
      console.error(e);
      await uiAlert(e.message || "No se pudieron generar los exámenes.");
      resetBtn();
    }
  });
})();

// ===== Grupos (versión simple, SIN DataTables) =====
const __API_BASE = typeof API !== "undefined" ? API : "http://localhost:5050";
const GRUPOS_API = `${__API_BASE}/api/grupos`;

// Helpers mínimos
async function __getJSON(url, opts) {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j };
}
async function fetchGruposAll() {
  const { data } = await __getJSON(`${GRUPOS_API}?all=1`);
  return Array.isArray(data) ? data : [];
}
async function fetchTemasActivos2() {
  const { data } = await __getJSON(`${__API_BASE}/api/temas`);
  return Array.isArray(data) ? data.filter((t) => t.activo !== false) : [];
}
async function fetchCuotasGrupo2(id) {
  const { ok, data } = await __getJSON(`${GRUPOS_API}/${id}/cuotas`);
  return ok && Array.isArray(data) ? data : [];
}
async function saveCuotasGrupo2(id, cuotas) {
  const { ok, data } = await __getJSON(`${GRUPOS_API}/${id}/cuotas`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cuotas }),
  });
  if (!ok) throw new Error(data?.error || "No se pudieron guardar las cuotas.");
}

// Fila HTML
function rowGrupoHTML(g) {
  return `
    <tr data-id="${g.idgrupo}">
      <td>${g.idgrupo}</td>
      <td>${g.clave || ""}</td>
      <td class="text-start">${g.nombre || ""}</td>
      <td>${Number(g.total_preguntas || 0)}</td>
      <td class="text-nowrap">
        <div class="d-flex flex-wrap gap-1 justify-content-center">
        <button type="button" class="btn btn-sm btn-outline-primary btn-edit d-inline-flex align-items-center gap-1">
          <i class="bi bi-pencil-square" aria-hidden="true"></i>
          Editar
        </button>
        <button type="button" class="btn btn-sm btn-outline-danger btn-del d-inline-flex align-items-center gap-1">
          <i class="bi bi-trash3" aria-hidden="true"></i>
          Eliminar
        </button>
        </div>
      </td>
    </tr>`;
}

// Render tabla simple
async function renderGruposCuadSimple() {
  const tb =
    document.querySelector("#tablaGrupos tbody") ||
    document.getElementById("tbodyGrupos");
  if (!tb) return;
  tb.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">
    <span class="d-inline-flex align-items-center gap-2 justify-content-center"><i class="bi bi-hourglass-split" aria-hidden="true"></i> Cargando…</span>
  </td></tr>`;
  try {
    const data = await fetchGruposAll();
    tb.innerHTML = data.length
      ? data.map(rowGrupoHTML).join("")
      : `<tr><td colspan="5" class="text-center text-muted py-4">
    <span class="d-inline-flex flex-column align-items-center gap-2"><i class="bi bi-inbox fs-3 opacity-50" aria-hidden="true"></i> Sin grupos aún</span>
  </td></tr>`;
  } catch (e) {
    console.error(e);
    tb.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">
    <span class="d-inline-flex align-items-center gap-2 justify-content-center"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i> Error cargando grupos</span>
  </td></tr>`;
  }
}

// ===== Editor (mismo de antes, sin habilitar) =====
function filaCuotaHTML2(temas, preset = {}) {
  const temaSel =
    preset?.tema_id !== undefined && preset?.tema_id !== null
      ? Number(preset.tema_id)
      : "";

  const cant = Number(preset.cantidad ?? 5);

  const opts = temas
    .map(
      (t) =>
        `<option value="${t.id}" ${String(t.id) === String(temaSel) ? "selected" : ""}>
          ${esc2(t.nombre)}
        </option>`
    )
    .join("");

  return `
    <div class="row g-2 align-items-center cuota-row mb-2">
      <div class="col-8">
        <select class="form-select sel-tema" required>
          <option value="" disabled ${temaSel === "" ? "selected" : ""}>
            Selecciona tema…
          </option>
          ${opts}
        </select>
      </div>
      <div class="col-3">
        <input type="number" min="0" class="form-control inp-cant" value="${cant}" aria-label="Cantidad de preguntas">
      </div>
      <div class="col-1 text-end">
        <button type="button" class="btn btn-outline-danger btn-sm btnQuitarCuota d-inline-flex align-items-center justify-content-center p-2" title="Quitar tema" aria-label="Quitar tema">
          <i class="bi bi-trash3" aria-hidden="true"></i>
        </button>
      </div>
    </div>`;
}


function totalFrom2(containerSel, totalSel) {
  const wrap = document.querySelector(containerSel);
  const total = [...wrap.querySelectorAll(".inp-cant")].reduce(
    (s, i) => s + Math.max(0, parseInt(i.value || "0", 10)),
    0
  );
  document.querySelector(totalSel).textContent = total;
}


function leerCuotasGrupoCuad(containerSel) {
  const filas = [...document.querySelectorAll(`${containerSel} .cuota-row`)];
  const cuotas = [];
  const seen = new Set();

  for (const row of filas) {
    const temaId = Number(row.querySelector(".sel-tema")?.value || 0);
    const cant = Math.max(
      0,
      parseInt(row.querySelector(".inp-cant")?.value || "0", 10)
    );

    if (!temaId || cant <= 0) continue;

    if (seen.has(temaId)) {
      throw new Error("No repitas el mismo tema.");
    }

    seen.add(temaId);
    cuotas.push({ tema_id: temaId, cantidad: cant });
  }

  return cuotas;
}
async function abrirEditorGrupoCuadSimple(datos) {
  // Setear campos
  document.getElementById("grupo-id").value = datos?.idgrupo || "";
  document.getElementById("grupo-clave").value = (
    datos?.clave || ""
  ).toUpperCase();
  document.getElementById("grupo-nombre").value = datos?.nombre || "";
  const tituloEl = document.getElementById("tituloGrupo");
  const tituloIcon = document.getElementById("tituloGrupoIcon");
  const editar = Boolean(datos?.idgrupo);
  if (tituloEl) {
    tituloEl.textContent = editar ? "Editar grupo" : "Nuevo grupo";
  }
  if (tituloIcon) {
    tituloIcon.className = editar
      ? "bi bi-pencil-square cuad-grupo-form-header-icon"
      : "bi bi-person-plus-fill cuad-grupo-form-header-icon";
  }

  const temas = await fetchTemasActivos2();
  const cont = document.getElementById("cuotasWrap");
  cont.innerHTML = "Cargando…";

  let cuotas = [];
  if (datos?.idgrupo) {
    try {
      cuotas = await fetchCuotasGrupo2(datos.idgrupo);
    } catch {}
  }
  cont.innerHTML = "";
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

const claveGrupo = (datos?.clave || "").toUpperCase().trim();
const cuotasBase =
  cuotas.length
    ? cuotas
    : (PLANTILLAS_GRUPO[claveGrupo] || [{ tema_id: temas[0]?.id, cantidad: 5 }]);

cuotasBase.forEach((c) =>
  cont.insertAdjacentHTML("beforeend", filaCuotaHTML2(temas, c))
);
  totalFrom2("#cuotasWrap", "#totalCuotas");

  // wire internos (una sola vez por apertura)
  document.getElementById("btnAddCuota").onclick = () => {
    cont.insertAdjacentHTML("beforeend", filaCuotaHTML2(temas));
    totalFrom2("#cuotasWrap", "#totalCuotas");
  };
  cont.onclick = (e) => {
    const quitar = e.target.closest(".btnQuitarCuota");
    if (quitar) {
      quitar.closest(".cuota-row")?.remove();
      totalFrom2("#cuotasWrap", "#totalCuotas");
    }
  };
 
  cont.onchange = (e) => {
  if (!e.target.classList.contains("sel-tema")) return;

  const selects = [...cont.querySelectorAll(".sel-tema")];
  const actual = e.target.value;
  const repetidos = selects.filter((s) => s.value === actual);

  if (actual && repetidos.length > 1) {
    uiAlert("No repitas el mismo tema.");
    e.target.value = "";
  }

  totalFrom2("#cuotasWrap", "#totalCuotas");
};

  const modalGrupoFormEl = document.getElementById("modalGrupoForm");
if (modalGrupoFormEl && modalGrupoFormEl.parentElement !== document.body) {
  document.body.appendChild(modalGrupoFormEl);
}

bootstrap.Modal.getOrCreateInstance(modalGrupoFormEl, {
  backdrop: "static",
  focus: true,
  keyboard: true,
}).show();

}

// Submit guardar (crear/editar)
document.getElementById("formGrupo")?.addEventListener("submit", async (ev) => {
  ev.preventDefault();

  const id = document.getElementById("grupo-id").value.trim();
  const clave = document
    .getElementById("grupo-clave")
    .value.trim()
    .toUpperCase();
  const nombre = document.getElementById("grupo-nombre").value.trim();

  if (!clave) return await uiAlert("La clave es requerida");

  let cuotas = [];
  try {
    cuotas = leerCuotasGrupoCuad("#cuotasWrap").map((c, idx) => ({
      ...c,
      orden: idx + 1,
    }));
  } catch (e) {
    await uiAlert(e.message || "No se pudieron leer las cuotas.");
    return;
  }

  try {
    const { ok, data } = await __getJSON(
      id ? `${GRUPOS_API}/${id}` : GRUPOS_API,
      {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave, nombre }),
      }
    );

    if (!ok) return await uiAlert(data?.error || "No se pudo guardar el grupo.");

    const idgrupo = id || data.idgrupo || data.id;
    if (!idgrupo) throw new Error("No se obtuvo el id del grupo.");

    await saveCuotasGrupo2(idgrupo, cuotas);

    bootstrap.Modal.getInstance(
      document.getElementById("modalGrupoForm")
    )?.hide();

    await renderGruposCuadSimple();
  } catch (e) {
    console.error(e);
    await uiAlert(e.message || "No se pudo guardar.");
  }
});

// ———————————— Tabla simple: delegación robusta ————————————
(function bindGruposTableHandlers() {
 

  document.addEventListener("click", async (ev) => {
    // ¿Click en Editar/Eliminar dentro de #tablaGrupos?
    const btn = ev.target.closest(
      "#tablaGrupos .btn-edit, #tablaGrupos .btn-del, #btnNuevoGrupo"
    );
    if (!btn) return;

    // Agregar grupo (fuera de la tabla)
    if (btn.id === "btnNuevoGrupo") {
      abrirEditorGrupoCuadSimple(null);
      return;
    }

    const tr = btn.closest("tr");
    if (!tr) return;
    const id = tr.dataset.id;

    // EDITAR
    if (btn.classList.contains("btn-edit")) {
      const clave = (tr.children[1]?.textContent || "").trim();
      const nombre = (tr.children[2]?.textContent || "").trim();
      abrirEditorGrupoCuadSimple({ idgrupo: Number(id), clave, nombre });
      return;
    }

    // ELIMINAR
    if (btn.classList.contains("btn-del")) {
      if (!(await uiConfirm("¿Eliminar este grupo?", { variant: "danger" })))
        return;

      // intento normal
      let res = await __getJSON(`${GRUPOS_API}/${id}`, { method: "DELETE" });

      // si el backend devuelve mensaje tipo “usa force=1”
      const msg = (res.data?.error || "").toLowerCase();
      if (!res.ok && (msg.includes("force=1") || msg.includes("forzar"))) {
        const okForce = await uiConfirm(
          "El grupo tiene cuotas/relaciones. ¿Eliminar de todos modos (force)?",
          {
            variant: "warning",
            title: "Eliminar grupo",
            confirmLabel: "Sí, eliminar",
            dangerous: true,
          }
        );
        if (okForce) {
          // prueba con querystring
          res = await __getJSON(`${GRUPOS_API}/${id}?force=1`, {
            method: "DELETE",
          });
          // fallback con body si el backend no toma querystring
          if (!res.ok) {
            res = await __getJSON(`${GRUPOS_API}/${id}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ force: 1 }),
            });
          }
        }
      }

      if (!res.ok) {
        await uiAlert(res.data?.error || "No se pudo eliminar.");
        return;

      }
      await renderGruposCuadSimple();
      repararEstadoModales();
    }
  });

})();

// Botón "Agregar grupo"
document.getElementById("btnNuevoGrupo")?.addEventListener("click", () => {
  abrirEditorGrupoCuadSimple(null);
});

// Al abrir tu modal #modalGrupos recarga la tabla simple
document.addEventListener("shown.bs.modal", (ev) => {
  if (ev.target.id === "modalGrupos") {
    renderGruposCuadSimple();
  }
});
// ===========================
// ALEATORIZACIÓN (modales)
// ===========================

// ===========================
// HELPERS CLAVES (SERVER)
// ===========================
async function postJSON_claves(path, body) {
  const r = await fetch(apiURL(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

async function ensureClaves(examenId, grupoId) {
  return postJSON_claves("/api/claves/ensure", {
    examen_id: examenId,
    grupo_id: grupoId,
  });
}

async function aleatorizarClavesServer(examenId, grupoId, tipos = []) {
  return postJSON_claves("/api/claves/aleatorizar", {
    examen_id: examenId,
    grupo_id: grupoId,
    tipos,
  });
}

async function guardarClavesServer(examenId, grupoId, filas) {
  return postJSON_claves("/api/claves/guardar", {
    examen_id: examenId,
    grupo_id: grupoId,
    filas,
  });
}


async function getClavesOrigen(examenId, grupoId) {
  const r = await fetch(
    apiURL(`/api/claves/origen?examen_id=${examenId}&grupo_id=${grupoId}`)
  );
  const j = await r.json().catch(() => ({}));
  return j && typeof j === "object" ? j : { ok: false, tipos: [], filas: [] };
}

(() => {
  const API_BASE = typeof API !== "undefined" ? API : "http://localhost:5050";

  // Nodos
  const btnAlea = document.getElementById("btn-aleatorizacion");
  const modalAleaEl = document.getElementById("modalAleatorizacion");
  const modalTipoEl = document.getElementById("modalTipoPrueba");

  const btnImportar = document.getElementById("btnImportarExamenes");
  const inpImport = document.getElementById("inpImportExams");
  const tblImportadosBody = document.querySelector("#tblImportados tbody");
  const btnTipoPrueba = document.getElementById("btnGenerarTipoPrueba");

  const tblClavesBody = document.querySelector("#tblClaves tbody");
  const btnAleatorizarPQ = document.getElementById("btnAleatorizarPQ");

  const ALEA_COUNTER_KEY = "evalunia_alea_counter_v1";

function getAleaCounterStore() {
  try {
    return JSON.parse(localStorage.getItem(ALEA_COUNTER_KEY) || "{}");
  } catch {
    return {};
  }
}

function setAleaCounterStore(data) {
  localStorage.setItem(ALEA_COUNTER_KEY, JSON.stringify(data || {}));
}

function aleaCounterKey(examenId, grupoId) {
  return `${Number(examenId || 0)}_${Number(grupoId || 0)}`;
}

function getAleaCounter(examenId, grupoId) {
  const store = getAleaCounterStore();
  const key = aleaCounterKey(examenId, grupoId);
  return Number(store[key] || 0);
}

function setAleaCounter(examenId, grupoId, value) {
  const store = getAleaCounterStore();
  const key = aleaCounterKey(examenId, grupoId);
  store[key] = Math.max(0, Number(value || 0));
  setAleaCounterStore(store);
}

function incrementAleaCounter(examenId, grupoId) {
  const next = getAleaCounter(examenId, grupoId) + 1;
  setAleaCounter(examenId, grupoId, next);
  return next;
}

function renderAleaCounter(examenId, grupoId) {
  const box = document.getElementById("aleaCounterBox");
  const icon = document.getElementById("aleaCounterIcon");
  if (!box || !icon) return;

  const value = getAleaCounter(examenId, grupoId);
  box.title = `Aleatorizado ${value} ${value === 1 ? "vez" : "veces"}`;

  if (value >= 0 && value <= 9) {
    icon.className = `bi bi-${value}-circle`;
    icon.textContent = "";
  } else {
    icon.className = "alea-counter-fallback";
    icon.textContent = String(value);
  }
}

  const btnDescargar = document.getElementById("btnDescargarPruebas");
  const btnImprimirClaves = document.getElementById("btnImprimirClaves");


  function inferirClaveGrupoDesdeNombreImportado(nombre = "") {
  const s = String(nombre || "").trim().toUpperCase();

  // grupo_B.docx / grupo B / GRUPO-C
  let m = s.match(/\bGRUPO[\s_\-]*([A-Z0-9]+)\b/);
  if (m) return m[1];

  // examen_grupo_B.docx
  m = s.match(/[_\-\s]([A-Z0-9]+)\.(DOCX|DOC|PDF)$/);
  if (m) return m[1];

  return "";
}

function getClavesImportadas() {
  const set = new Set();

  for (const ex of Array.isArray(EXAMENES) ? EXAMENES : []) {
    const clave = inferirClaveGrupoDesdeNombreImportado(ex.nombre);
    if (clave) set.add(clave);
  }

  return set;
}

function getGruposFiltradosPorImportados(grupos = []) {
  const clavesImportadas = getClavesImportadas();

  if (!clavesImportadas.size) return [];

  return (Array.isArray(grupos) ? grupos : []).filter((g) => {
    const claveGrupo = String(g.clave || "").trim().toUpperCase();
    return claveGrupo && clavesImportadas.has(claveGrupo);
  });
}

  // Estado
  let EXAMENES = []; // {id, nombre, total_preguntas}
  let GRUPOS = []; // [{id, clave, nombre}]
  let CLAVES = [];      // filas dinámicas: [{numero_pregunta, origen, P:"A", Q:"B", R:"C"...}]
  let TIPOS = ["P","Q"]; // tipos activos que vienen del backend

  let EXAMEN_ID_ACTUAL = null; // examen elegido (por ahora tomamos el primero)

  // Helpers
  const LTRS = ["A", "B", "C", "D", "E"];

  // elige una letra cualquiera excepto las que le digas
  const pickExcept = (except = []) => {
    const pool = LTRS.filter((x) => !except.includes(x));
    return pool[Math.floor(Math.random() * pool.length)] || "A";
  };

    //importar varios examenes 
  function getExamenIdsImportados() {
    return (Array.isArray(EXAMENES) ? EXAMENES : [])
      .map((e) => Number(e.id))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  // ✅ SOLO garantiza: P != Q y que estén dentro de A–E
  const enforceRules = () => {
  if (!Array.isArray(CLAVES)) CLAVES = [];
  const tipos = (TIPOS || []).slice();
  CLAVES = CLAVES.map((r) => {
    r.origen = (r.origen || "A").toUpperCase();
    if (!LTRS.includes(r.origen)) r.origen = "A";

    const usados = new Set([r.origen]);

    for (const t of tipos) {
      let v = (r[t] || "").toUpperCase();
      if (!LTRS.includes(v) || usados.has(v)) {
        // asigna una letra que no esté usada
        const pool = LTRS.filter(x => !usados.has(x));
        v = pool.length ? pool[Math.floor(Math.random()*pool.length)] : pickExcept([]);
      }
      r[t] = v;
      usados.add(v);
    }
    return r;
  });
};

// ===============================
// TIPOS DE TEMA (P/Q/R/...) FIX
// (delegación + try/catch + refresco)
// ===============================
(() => {
  if (window.__TIPOS_TEMA_WIRED__) return;
  window.__TIPOS_TEMA_WIRED__ = true;

  const $selGrupo = () => document.getElementById("selGrupo");
  const $modal = () => document.getElementById("modalTiposTema");
  const $tbody = () => document.getElementById("tbodyTiposTema");
  const $txt = () => document.getElementById("txtNuevoTipo");

  const norm = (s) => (s || "").trim().toUpperCase();

  async function fetchJSON(url, opts) {
    const r = await fetch(url, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  async function listarTipos(examenId, grupoId) {
    const j = await fetchJSON(
      apiURL(`/api/temas/tipos?examen_id=${examenId}&grupo_id=${grupoId}`)
    );
    return Array.isArray(j.tipos) ? j.tipos : [];
  }

  async function crearTipo(examenId, grupoId, codigo) {
    return fetchJSON(apiURL(`/api/temas/tipos`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ examen_id: examenId, grupo_id: grupoId, codigo }),
    });
  }

  async function toggleTipo(id, activo) {
    // compat: prueba POST con body; si tu backend usa PATCH, cae al fallback
    try {
      return await fetchJSON(apiURL(`/api/temas/tipos/${id}/toggle`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: activo ? 1 : 0 }),
      });
    } catch (e) {
      const r = await fetch(apiURL(`/api/temas/tipos/${id}/toggle`), {
        method: "PATCH",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      return j;
    }
  }

  async function renderTipos(examenId, grupoId) {
    const tb = $tbody();
    if (!tb) return;

    const tipos = await listarTipos(examenId, grupoId);
    tb.innerHTML = tipos
      .map(
        (t) => `
        <tr>
          <td><b>${t.codigo}</b></td>
          <td>${
            t.activo
              ? '<span class="badge bg-success">Activo</span>'
              : '<span class="badge bg-secondary">Inactivo</span>'
          }</td>
          <td>
            <button type="button"
              class="btn btn-sm ${t.activo ? "btn-danger" : "btn-success"} btn-toggle-tipo"
              data-id="${t.id}"
              data-act="${t.activo ? 0 : 1}">
              ${t.activo ? "Desactivar" : "Activar"}
            </button>
          </td>
        </tr>
      `
      )
      .join("");
  }

  // Abrir modal Tipos
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("#btnNuevoTema");
    if (!btn) return;

    const grupoId = Number($selGrupo()?.value || 0);
    if (!EXAMEN_ID_ACTUAL || !grupoId) return await uiAlert("Selecciona examen y grupo.");

    const el = $modal();
    if (!el) return await uiAlert("Falta #modalTiposTema en tu HTML.");
    if (el.parentElement !== document.body) document.body.appendChild(el);

    try {
      await renderTipos(EXAMEN_ID_ACTUAL, grupoId);
      bootstrap.Modal.getOrCreateInstance(el, { backdrop: "static" }).show();
    } catch (e) {
      console.error(e);
      await uiAlert(e.message || "No se pudo listar tipos.");
    }
  });

  // Agregar tipo (delegado)
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("#btnAgregarTipo");
    if (!btn) return;

    const grupoId = Number($selGrupo()?.value || 0);
    if (!EXAMEN_ID_ACTUAL || !grupoId) return await uiAlert("Selecciona examen y grupo.");

    const codigo = norm($txt()?.value);
    if (!/^[A-Z]{1,2}$/.test(codigo)) {
      await uiAlert("Código inválido (usa 1–2 letras, ej: R).");
      return;
    }

    btn.disabled = true;
    try {
      const existentes = await listarTipos(EXAMEN_ID_ACTUAL, grupoId);
      if (existentes.some((t) => norm(t.codigo) === codigo)) {
        await uiAlert(`El tipo "${codigo}" ya existe.`);
        return;
      }

      await crearTipo(EXAMEN_ID_ACTUAL, grupoId, codigo);

      // asegura filas/columnas en claves para ese tipo
      await postJSON_claves("/api/claves/ensure", {
        examen_id: EXAMEN_ID_ACTUAL,
        grupo_id: grupoId,
        tipos: [codigo],
      });

      if ($txt()) $txt().value = "";

      await renderTipos(EXAMEN_ID_ACTUAL, grupoId);
      await cargarClaves(EXAMEN_ID_ACTUAL, grupoId); // refresca tabla claves
    } catch (e) {
      console.error(e);
      await uiAlert(e.message || "No se pudo agregar el tipo.");
    } finally {
      btn.disabled = false;
    }
  });

  // Activar/Desactivar (delegado)
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("#tbodyTiposTema .btn-toggle-tipo");
    if (!btn) return;

    const grupoId = Number($selGrupo()?.value || 0);
    if (!EXAMEN_ID_ACTUAL || !grupoId) return await uiAlert("Selecciona examen y grupo.");

    const id = Number(btn.dataset.id);
    const nuevoActivo = Number(btn.dataset.act) === 1;

    btn.disabled = true;
    try {
      await toggleTipo(id, nuevoActivo);
      await renderTipos(EXAMEN_ID_ACTUAL, grupoId);
      await cargarClaves(EXAMEN_ID_ACTUAL, grupoId); // para ocultar/mostrar columnas
    } catch (e) {
      console.error(e);
      await uiAlert(e.message || "No se pudo cambiar el estado.");
    } finally {
      btn.disabled = false;
    }
  });
})();




  const renderExamenes = () => {
    // Puede haber MÁS de una tabla con id="tblImportados"
    const tbodies = document.querySelectorAll("#tblImportados tbody");
    if (!tbodies.length) return;

    let html;
    if (!EXAMENES.length) {
      html = `
        <tr>
          <td colspan="4" class="cuad-table-empty">
            No hay exámenes importados.
          </td>
        </tr>`;
    } else {
      html = EXAMENES.map(
        (e) => `
          <tr data-id="${e.id}">
            <td>${e.id ?? ""}</td>
            <td>${e.nombre ?? ""}</td>
            <td class="text-end">${e.total_preguntas ?? ""}</td>
            <td class="text-center">
              <button class="btn btn-sm btn-danger btn-del-exam" title="Eliminar">
                ✕
              </button>
            </td>
          </tr>
        `
      ).join("");
    }

    // Rellenamos todas las tablas que tengan ese id
    tbodies.forEach((tb) => {
      tb.innerHTML = html;
    });
  };

  const renderClaves = () => {
  const tbody = document.querySelector("#tblClaves tbody");
  const thead = document.getElementById("theadClaves") || document.querySelector("#tblClaves thead");
  if (!tbody || !thead) return;

  // 1) THEAD dinámico
  let th = `<tr>
    <th style="width:90px">Pregunta</th>
    <th style="width:120px">Origen</th>
    ${TIPOS.map(t => `<th style="width:120px">${t}</th>`).join("")}
  </tr>`;
  thead.innerHTML = th;

  // 2) TBODY dinámico
  tbody.innerHTML = CLAVES.map((r) => {
    const cellsTipos = TIPOS.map((t) => `
      <td>
        <select class="form-select form-select-sm sel-tipo" data-t="${t}" data-i="${r.numero_pregunta}">
          ${LTRS.map(l => `<option ${l === (r[t]||"") ? "selected":""}>${l}</option>`).join("")}
        </select>
      </td>
    `).join("");

    return `
      <tr>
        <td>${r.numero_pregunta}</td>
        <td>
          <select class="form-select form-select-sm sel-origen" data-i="${r.numero_pregunta}">
            ${LTRS.map(l => `<option ${l === r.origen ? "selected":""}>${l}</option>`).join("")}
          </select>
        </td>
        ${cellsTipos}
      </tr>
    `;
  }).join("");
};


  const btnGuardarClaves = document.getElementById("btnGuardarClaves");

  btnGuardarClaves?.addEventListener("click", async () => {
    try {
      const selGrupo = document.getElementById("selGrupo");
      const grupoId = Number(selGrupo?.value || 0);
      if (!EXAMEN_ID_ACTUAL || !grupoId) {
        await uiAlert("Selecciona examen y grupo.");
        return;
      }
      await guardarClavesServer(EXAMEN_ID_ACTUAL, grupoId, CLAVES);
      await uiAlert("✅ Claves guardadas en BD.");
    } catch (e) {
      console.error(e);
      await uiAlert(e.message || "No se pudo guardar.");
    }
  });

  async function cargarGrupos() {
  const selGrupo = document.getElementById("selGrupo");
  if (selGrupo) {
    selGrupo.innerHTML = `<option value="">Cargando…</option>`;
  }

  try {
    const r = await fetch(apiURL("/api/grupos?all=1"));
    const data = await r.json().catch(() => []);

    const gruposTodos = (Array.isArray(data) ? data : [])
      .map((g) => ({
        id: Number(g.id ?? g.idgrupo ?? g.id_grupo ?? g.grupo_id),
        clave: (g.clave || "").trim(),
        nombre: (g.nombre || "").trim(),
      }))
      .filter((g) => g.id);

    // ✅ filtrar solo grupos que sí tengan examen importado
    GRUPOS = getGruposFiltradosPorImportados(gruposTodos);

    if (!selGrupo) return;

    if (!GRUPOS.length) {
      selGrupo.innerHTML = `<option value="">(No hay grupos con examen importado)</option>`;
      return;
    }

    selGrupo.innerHTML = GRUPOS.map((g) => {
      const label =
        g.clave && g.nombre
          ? `${g.clave} — ${g.nombre}`
          : g.clave || g.nombre || `Grupo ${g.id}`;
      return `<option value="${g.id}">${label}</option>`;
    }).join("");
  } catch (e) {
    console.error("Error cargando grupos:", e);
    GRUPOS = [];
    if (selGrupo) {
      selGrupo.innerHTML = `<option value="">(Error cargando grupos)</option>`;
    }
  }
}

 async function cargarClaves(examenId, grupoId) {
  await ensureClaves(examenId, grupoId);

  const resp = await getClavesOrigen(examenId, grupoId);
  if (!resp.ok) {
    CLAVES = [];
    TIPOS = ["P", "Q"];
    renderClaves();
    return;
  }

  // 1) filas
  CLAVES = Array.isArray(resp.filas) ? resp.filas : [];

  // 2) tipos ACTIVOS (si existe el endpoint de tipos)
  let activos = null;
  try {
    const r = await fetch(
      apiURL(`/api/temas/tipos?examen_id=${examenId}&grupo_id=${grupoId}`)
    );
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok !== false && Array.isArray(j.tipos)) {
      activos = j.tipos
        .filter((t) => t.activo)
        .map((t) => String(t.codigo).toUpperCase());
    }
  } catch {}

  // fallback: lo que venga de /api/claves/origen
  TIPOS =
    Array.isArray(activos) && activos.length
      ? activos
      : Array.isArray(resp.tipos) && resp.tipos.length
      ? resp.tipos
      : ["P", "Q"];

  //enforceRules();
  renderClaves();
}



  // Abrir modal Aleatorización
  btnAlea?.addEventListener("click", async () => {
    await listarExamenesImportados();

    if (modalAleaEl) {
      const modal =
        bootstrap.Modal.getInstance(modalAleaEl) ||
        bootstrap.Modal.getOrCreateInstance(modalAleaEl, {
          backdrop: "static",
        });
      modal.show();
    }
  });

  // --- listar exámenes importados (SIEMPRE desde BD) ---
  async function listarExamenesImportados() {
    try {
      const r = await fetch(apiURL("/api/examenes/importados"));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json().catch(() => []);

      // ✅ dedupe por id (por si el backend repite algo)
      const map = new Map();
      for (const it of Array.isArray(data) ? data : []) {
        map.set(Number(it.id), it);
      }
      EXAMENES = [...map.values()];
    } catch (e) {
      console.error("Error listando importados:", e);
      EXAMENES = [];
    }
    renderExamenes();
  }

  // 👉 la hacemos accesible desde fuera (openTipoPrueba)
  window.__listarExamenesImportados = listarExamenesImportados;
  let __IMPORTADOS_CLEAN_SENT__ = false;

  function limpiarImportadosAlSalir() {
    if (__IMPORTADOS_CLEAN_SENT__) return;
    __IMPORTADOS_CLEAN_SENT__ = true;

    try {
      fetch(apiURL("/api/examenes/importados/limpiar"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        keepalive: true,
      }).catch(() => {});
    } catch (e) {
      console.warn("No se pudo avisar limpieza al cerrar:", e);
    }
  }

  window.addEventListener("beforeunload", limpiarImportadosAlSalir);
  window.addEventListener("unload", limpiarImportadosAlSalir);


  // 🚀 CARGA INICIAL: al cargar la página, traer exámenes importados desde BD
  document.addEventListener("DOMContentLoaded", () => {
    // Solo si existe la tabla en este HTML
    if (document.querySelector("#tblImportados tbody")) {
      listarExamenesImportados().catch((e) =>
        console.error("Error en carga inicial de exámenes importados:", e)
      );
    }
  });

  // ===========================
  // Importar Exámenes (ÚNICO, robusto)  ✅ SIN duplicar
  // ===========================
  (() => {
    const BTN = "#btnImportarExamenes";
    const INPUT = "#inpImportExams";

    // --- abrir diálogo de archivos ---
    document.addEventListener("click", (ev) => {
      const btn = ev.target.closest(BTN);
      if (!btn) return;

      const inp = document.querySelector(INPUT);
      if (!inp) {
        console.error("[EXAM] No existe #inpImportExams en el DOM");
        return;
      }
      inp.click();
    });

    // --- cuando selecciona archivos ---
    document.addEventListener("change", async (ev) => {
      if (!ev.target.matches(INPUT)) return;

      const inp = ev.target;
      if (!inp.files?.length) return;

      const fd = new FormData();
      for (const f of inp.files) {
        fd.append("files", f); // ✅ SOLO UNA VEZ
      }

      try {
        const r = await fetch(apiURL("/api/examenes/importar"), {
          method: "POST",
          body: fd,
        });

        let j = {};
        try {
          j = await r.json();
        } catch {}

        if (!r.ok || j.ok === false) {
          throw new Error(j?.error || j?.message || `HTTP ${r.status}`);
        }

        // ✅ YA NO usamos "nuevos" para pintar la tabla
        // porque la tabla debe venir completa desde BD.

        await listarExamenesImportados(); // ✅ recarga TODO desde BD

        // opcional: auto seleccionar el primero si no había seleccionado
        if (!EXAMEN_ID_ACTUAL && EXAMENES.length) {
          EXAMEN_ID_ACTUAL = EXAMENES[0].id;
        }

        inp.value = "";
        console.log("[EXAM] Importación correcta y lista recargada desde BD.");
      } catch (e) {
        console.error(e);
        await uiAlert("No se pudo importar exámenes: " + (e.message || ""));
      }
    });
  })();

  // Elegir un examen de la tabla
  document.addEventListener("click", (e) => {
    const tr = e.target.closest("#tblImportados tbody tr");
    if (!tr) return;

    EXAMEN_ID_ACTUAL = Number(tr.dataset.id) || EXAMEN_ID_ACTUAL;

    const tbody = document.querySelector("#tblImportados tbody");
    if (!tbody) return;

    [...tbody.querySelectorAll("tr")].forEach((x) =>
      x.classList.remove("table-primary")
    );
    tr.classList.add("table-primary");
  });

  // Eliminar examen (delegado) — ÚNICO y sin doble click
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-del-exam");
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation(); // evita otros handlers del tr

    // anti doble-ejecución
    if (btn.dataset.running === "1") return;
    btn.dataset.running = "1";

    const tr = btn.closest("tr");
    const id = Number(tr?.dataset.id);
    if (!id) {
      btn.dataset.running = "0";
      return;
    }

    if (
      !(await uiConfirm("¿Eliminar este examen importado?", {
        variant: "danger",
        title: "Eliminar examen",
        confirmLabel: "Eliminar",
        dangerous: true,
      }))
    ) {
      btn.dataset.running = "0";
      return;
    }

    try {
      const r = await fetch(apiURL(`/api/examenes/importados/${id}`), {
        method: "DELETE",
      });
      let j = {};
      try {
        j = await r.json();
      } catch {}

      if (!r.ok || j.ok === false) {
        throw new Error(j.error || `HTTP ${r.status}`);
      }

      EXAMENES = EXAMENES.filter((x) => Number(x.id) !== id);
      renderExamenes();
      if (EXAMEN_ID_ACTUAL === id) EXAMEN_ID_ACTUAL = null;
    } catch (err) {
      console.error(err);
      await uiAlert("No se pudo eliminar: " + (err.message || ""));
    } finally {
      btn.dataset.running = "0";
    }
  });

  // Abrir modal Tipo de Prueba
  // Abrir modal Tipo de Prueba  ✅ (carga grupos + claves antes de mostrar)
  // Abrir modal Tipo de Prueba (delegado y robusto)
  // Abrir modal Tipo de Prueba (delegado y robusto)
  (function bindBtnTipoPruebaOnce() {
    document.addEventListener("click", async (e) => {
      const trigger = e.target.closest("#btnGenerarTipoPrueba");
      if (!trigger) return;

      e.preventDefault();
      console.log("[TipoPrueba] click (delegado)");

      // 1) asegurar examen seleccionado
      if (!EXAMEN_ID_ACTUAL) {
        if (EXAMENES.length) {
          EXAMEN_ID_ACTUAL = Number(EXAMENES[0].id);

          // marcar visualmente el primero
          const firstRow = document.querySelector(
            "#tblImportados tbody tr[data-id]"
          );
          if (firstRow) {
            [...document.querySelectorAll("#tblImportados tbody tr")].forEach(
              (tr) => tr.classList.remove("table-primary")
            );
            firstRow.classList.add("table-primary");
          }
        } else {
          await uiAlert("Primero importa o selecciona un examen.");
          return;
        }
      }

      // 2) cargar grupos desde BD
      await cargarGrupos();
      if (!Array.isArray(GRUPOS) || !GRUPOS.length) {
  await uiAlert("No existe examen importado para ninguno de los grupos registrados o esta mal exscrito debe ser este formato Grupo_X");
  return;
}

      // re-buscamos el select de grupo AHORA (cuando el modal ya existe)
      const selGrupo = document.getElementById("selGrupo");
      const gid = Number(selGrupo?.value || (GRUPOS.length ? GRUPOS[0].id : 0) || 0);

      if (!gid) {
        // fallback ultra seguro
        if (selGrupo)
          selGrupo.innerHTML = `<option value="">(Sin grupos)</option>`;
        CLAVES = [];
        
          renderClaves();
  renderAleaCounter(0, 0);
      } else {
        // si el select existe pero está vacío, lo sincronizamos con el gid elegido
        if (selGrupo && !selGrupo.value) {
          selGrupo.value = String(gid);
        }
       await cargarClaves(EXAMEN_ID_ACTUAL, gid);
        setAleaCounter(EXAMEN_ID_ACTUAL, gid, 0);
        renderAleaCounter(EXAMEN_ID_ACTUAL, gid);
      }

      // 4) abrir modal TipoPrueba cerrando Aleatorización si está abierto
      const elTipo = document.getElementById("modalTipoPrueba");
      if (!elTipo) return console.error("Falta #modalTipoPrueba");
      if (elTipo.parentElement !== document.body)
        document.body.appendChild(elTipo);

      const elAlea = document.getElementById("modalAleatorizacion");
      const mAlea = elAlea
        ? bootstrap.Modal.getInstance(elAlea) ||
          bootstrap.Modal.getOrCreateInstance(elAlea)
        : null;

      const mTipo = bootstrap.Modal.getOrCreateInstance(elTipo, {
        backdrop: "static",
      });

      if (mAlea && elAlea.classList.contains("show")) {
        elAlea.addEventListener("hidden.bs.modal", () => mTipo.show(), {
          once: true,
        });
        mAlea.hide();
      } else {
        mTipo.show();
      }
    });
  })();

  // Cambiar grupo → recarga claves
  // Cambiar grupo → recarga claves (delegado)
document.addEventListener("change", async (e) => {
  const sel = e.target.closest("#selGrupo");
  if (!sel) return;

  const gid = Number(sel.value || 0);
  const permitido = GRUPOS.some((g) => Number(g.id) === gid);

  if (!EXAMEN_ID_ACTUAL || !gid || !permitido) {
    CLAVES = [];
    renderClaves();
    renderAleaCounter(0, 0);
    return;
  }

  await cargarClaves(EXAMEN_ID_ACTUAL, gid);
  setAleaCounter(EXAMEN_ID_ACTUAL, gid, 0);
  renderAleaCounter(EXAMEN_ID_ACTUAL, gid);
});

  // Edición manual en tabla (enforce rules)
  tblClavesBody?.addEventListener("change", (e) => {
    const el = e.target;
    const idx = Number(el.getAttribute("data-i"));
    const row = CLAVES.find((x) => x.numero_pregunta === idx);
    if (!row) return;
    if (el.classList.contains("sel-origen"))
      row.origen = el.value.toUpperCase();
    if (el.classList.contains("sel-tipo")) {
        const t = el.getAttribute("data-t");
        row[t] = el.value.toUpperCase();
      }
    enforceRules();
    renderClaves();
  });

  // Aleatorizar P/Q (cliente) – si prefieres en servidor, llama /api/claves/aleatorizar
btnAleatorizarPQ?.addEventListener("click", async () => {
  try {
    const selGrupo = document.getElementById("selGrupo");
    const grupoId = Number(selGrupo?.value || 0);
    if (!EXAMEN_ID_ACTUAL || !grupoId) {
      await uiAlert("Selecciona examen y grupo.");
      return;
    }

    const tiposActivos = Array.isArray(TIPOS) && TIPOS.length ? [...TIPOS] : ["P", "Q"];

    await aleatorizarClavesServer(EXAMEN_ID_ACTUAL, grupoId, tiposActivos);

    const resp = await getClavesOrigen(EXAMEN_ID_ACTUAL, grupoId);
    if (!resp.ok) throw new Error(resp.error || "No se pudieron cargar claves.");

    TIPOS = Array.isArray(resp.tipos) && resp.tipos.length ? resp.tipos : tiposActivos;
    CLAVES = Array.isArray(resp.filas) ? resp.filas : [];

    renderClaves();

    const total = incrementAleaCounter(EXAMEN_ID_ACTUAL, grupoId);
    renderAleaCounter(EXAMEN_ID_ACTUAL, grupoId);

    await uiAlert(`✅ Aleatorización aplicada. Total: ${total}`);
  } catch (e) {
    console.error(e);
    await uiAlert(e.message || "No se pudo aleatorizar.");
  }
});


  // Descargar solo temas
btnDescargar?.addEventListener("click", async () => {
  const btn = btnDescargar;
  const oldHtml = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.innerHTML = "Descargando...";

    const selGrupo = document.getElementById("selGrupo");
    const grupoIdSel = Number(selGrupo?.value || 0);

    if (!EXAMEN_ID_ACTUAL || !grupoIdSel) {
      await uiAlert("Selecciona examen y grupo.");
      return;
    }

    if (Array.isArray(CLAVES) && CLAVES.length) {
      await guardarClavesServer(EXAMEN_ID_ACTUAL, grupoIdSel, CLAVES);
    }

    const examenIds = getExamenIdsImportados();

    if (!examenIds.length) {
      await uiAlert("Primero importa exámenes.");
      return;
    }

    const grupoTexto = selGrupo?.selectedOptions?.[0]?.textContent?.trim() || "";
    const grupoClave = (grupoTexto.split("—")[0] || "").trim() || `GRUPO_${grupoIdSel}`;

    const r = await fetch(apiURL("/api/pruebas/descargar_all"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        examen_ids: examenIds,
        solo_temas: true,
        todos_los_grupos: false,
        grupo_id: grupoIdSel
      }),
    });

    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `HTTP ${r.status}`);
    }

    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TEMAS_${grupoClave}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error(e);
    await uiAlert(e.message || "Fallo la descarga de temas.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldHtml;
  }
});


// Imprimir claves de respuesta
btnImprimirClaves?.addEventListener("click", async () => {
  const btn = btnImprimirClaves;
  const oldHtml = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-printer"></i> Imprimiendo...';

    const selGrupo = document.getElementById("selGrupo");
    const grupoIdSel = Number(selGrupo?.value || 0);

    if (!EXAMEN_ID_ACTUAL || !grupoIdSel) {
      await uiAlert("Selecciona examen y grupo.");
      return;
    }

    // guardar primero el grupo que estás viendo
    if (Array.isArray(CLAVES) && CLAVES.length) {
      await guardarClavesServer(EXAMEN_ID_ACTUAL, grupoIdSel, CLAVES);
    }

    const examenIds = getExamenIdsImportados();
    if (!examenIds.length) {
      await uiAlert("Primero importa exámenes.");
      return;
    }

    const r = await fetch(apiURL("/api/claves/imprimir"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      examen_ids: [EXAMEN_ID_ACTUAL],
      grupo_id: grupoIdSel
    }),
  });

    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) {
      throw new Error(j.error || `HTTP ${r.status}`);
    }

    if (!j.ruta_rel_pdf) {
      throw new Error("No se generó el PDF de claves.");
    }

    if (window.api?.openPdfFromUrl) {
      const rr = await window.api.openPdfFromUrl(apiURL(j.ruta_rel_pdf));
      if (!rr?.ok) throw new Error(rr?.message || "No se pudo abrir el PDF.");
    } else {
      window.open(apiURL(j.ruta_rel_pdf), "_blank", "noopener");
    }
  } catch (e) {
    console.error(e);
    await uiAlert(e.message || "No se pudo imprimir claves.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldHtml;
  }
});

  // ===========================
  // Recargar exámenes al abrir "Gestionar tipo de pruebas"
  // ===========================
  document.addEventListener("shown.bs.modal", (ev) => {
    if (!esModalTemasCuad()) return;

    if (ev.target.id === "modalTipoPrueba") {
      // Siempre que se abre el modal, traemos la lista desde BD
      if (typeof listarExamenesImportados === "function") {
        listarExamenesImportados().catch((e) =>
          console.error("Error listando exámenes importados:", e)
        );
      }
    }
  });
})();






// --- HOTFIX: forzar que el modal esté en <body> y mostrarlo correctamente
(function () {
  const btn = document.getElementById("btn-aleatorizacion");
  const el = document.getElementById("modalAleatorizacion");

  if (!btn || !el) return;

  // Por si quedó dentro de un contenedor con transform/overflow:
  // lo reubicamos directamente bajo <body> una sola vez.
  if (el.parentElement !== document.body) {
    document.body.appendChild(el);
  }

  // Normaliza cualquier estilo residual
  el.style.removeProperty("display");
  el.classList.remove("show");
  el.removeAttribute("aria-hidden");

  // Click manual (independiente de data-bs-*)
  btn.addEventListener(
    "click",
    (ev) => {
      ev.preventDefault();
      const inst = bootstrap.Modal.getOrCreateInstance(el, { backdrop: true });
      inst.show();
    },
    { once: false }
  );

  // Log útil para verificar que realmente se abre
  el.addEventListener("shown.bs.modal", () =>
    console.log("Modal Aleatorización: shown")
  );
  el.addEventListener("hidden.bs.modal", () =>
    console.log("Modal Aleatorización: hidden")
  );
})();

// Abrir Aleatorización (delegado, robusto)
(function bindAleaOpenOnce() {
  document.addEventListener("click", async (ev) => {
    const trigger = ev.target.closest("#btn-aleatorizacion");
    if (!trigger) return;

    try {
      // precarga lista (si falla, igual mostramos el modal)
      if (typeof listarExamenesImportados === "function") {
        await listarExamenesImportados().catch(() => {});
      }
    } finally {
      const el = document.getElementById("modalAleatorizacion");
      if (!el) return;
      const modal = bootstrap.Modal.getOrCreateInstance(el, {
        backdrop: "static",
      });
      modal.show();
      console.log("Modal Aleatorización: shown");
    }
  });




})();

/* =======================
   TEMAS (CRUD en modal) — versión ÚNICA y dinámica
   ======================= */
/* =======================
   TEMAS (CUADERNILLOS) — FIX anti-colisión con Banco
   ======================= */
// =======================
// TEMAS CUADERNILLOS - BLOQUE ÚNICO
// =======================
(() => {
  if (window.__TEMAS_CUAD_MODULE__) return;
  window.__TEMAS_CUAD_MODULE__ = true;

  const escAttrTemaCuad = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        }[c])
    );

  const MODAL_SEL = "#modalTemas";
  const TABLA_SEL = "#tabla-temas";
  const BTN_OPEN_SEL = "#btnTemasMatriz";
  const BTN_ADD_SEL = "#btnAgregarTema";
  const MODAL_PADRE_ID = "modalMatriz";
  const PANEL_TEMA_OPEN_CLASS = "cuad-tema-form-panel--open";

  let dtTemasCuad = null;
  let renderingCuad = false;

  function destroyDtWrappersCuad() {
    const host = document.getElementById("cuadTemasDtToolbarHost");
    if (host) host.replaceChildren();

    const t = document.querySelector(TABLA_SEL);
    if (!t) return;
    const $t = $(t);

    if ($.fn.DataTable.isDataTable(t)) {
      try {
        $t.DataTable().clear().destroy();
      } catch {}
    }

    for (;;) {
      const $w = $t.closest(".dt-container, .dataTables_wrapper");
      if (!$w.length) break;
      $w.before($t);
      $w.remove();
    }

    t.querySelector("thead")?.remove();

    const thead = document.createElement("thead");
    thead.className = "table-dark";
    thead.innerHTML = `
      <tr>
        <th class="cuad-temas-th-id text-end">ID</th>
        <th>Nombre</th>
        <th class="text-center cuad-temas-th-estado">Estado</th>
        <th class="text-end cuad-temas-th-actions" style="width:1%">Acciones</th>
      </tr>
    `;
    t.prepend(thead);

    const tb = t.querySelector("tbody") || document.createElement("tbody");
    tb.innerHTML = "";
    if (!tb.parentElement) t.appendChild(tb);
  }

  async function fetchTemasCuad(includeInactive) {
    const url = `${window.TEMAS_API_BASE_CUAD}${includeInactive ? "?all=1" : ""}`;
    console.log("[CUAD:Temas] GET", url);
    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Temas HTTP ${r.status}: ${txt}`);
    }
    const json = await r.json();
    return Array.isArray(json) ? json : [];
  }

  function panelTemaCuadEls() {
    return {
      panel: document.getElementById("panelTemaCuad"),
      titulo: document.getElementById("panelTemaCuadTitulo"),
      icon: document.getElementById("panelTemaCuadIcon"),
      idInput: document.getElementById("temaIdCuad"),
      nombreInput: document.getElementById("temaNombreCuad"),
      btnG: document.getElementById("btnTemaCuadGuardar"),
      btnC: document.getElementById("btnTemaCuadCancelar"),
    };
  }

  function hidePanelTemaCuad() {
    const { panel, idInput, nombreInput, btnG, icon } = panelTemaCuadEls();
    if (!panel) return;
    panel.classList.remove(
      "cuad-tema-form-panel--crear",
      "cuad-tema-form-panel--editar",
      PANEL_TEMA_OPEN_CLASS
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

  function showPanelTemaCuad(modo, payload = {}) {
    const { panel, titulo, icon, idInput, nombreInput, btnG } = panelTemaCuadEls();
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
    panel.classList.remove(PANEL_TEMA_OPEN_CLASS);
    void panel.offsetWidth;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.classList.add(PANEL_TEMA_OPEN_CLASS);
        requestAnimationFrame(() => {
          try {
            nombreInput.focus();
          } catch (_) {}
        });
      });
    });
  }

  async function guardarPanelTemaCuad() {
    const modal = document.querySelector(MODAL_SEL);
    if (!modal || modal.dataset.ctx !== "cuad") return;

    const { panel, idInput, nombreInput, btnG } = panelTemaCuadEls();
    const modo = panel?.dataset?.modo;
    if (!modo || !panel.classList.contains(PANEL_TEMA_OPEN_CLASS)) return;

    const nombre = nombreInput?.value.trim() || "";
    if (!nombre) return;

    if (btnG) btnG.disabled = true;
    if (nombreInput) nombreInput.disabled = true;

    try {
      if (modo === "crear") {
        const r = await fetch(window.TEMAS_API_BASE_CUAD, {
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
        const r = await fetch(`${window.TEMAS_API_BASE_CUAD}/${id}`, {
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
      hidePanelTemaCuad();
      await renderTemasCuad();
    } catch (e2) {
      console.error(e2);
      await uiAlert("Error de red.");
    } finally {
      const els = panelTemaCuadEls();
      if (els.btnG) els.btnG.disabled = false;
      if (els.nombreInput) els.nombreInput.disabled = false;
    }
  }

  async function renderTemasCuad() {
    const modal = document.querySelector(MODAL_SEL);
    if (!modal || modal.dataset.ctx !== "cuad") return;
    if (renderingCuad) return;

    renderingCuad = true;
    try {
      const showInactivos =
        document.getElementById("chkVerInactivosTemas")?.checked || false;

      const data = await fetchTemasCuad(showInactivos);
      const $tabla = $(TABLA_SEL);

      destroyDtWrappersCuad();

      console.log("[CUAD:Temas] init DT");

      dtTemasCuad = $tabla.DataTable({
        data,
        destroy: true,
        autoWidth: false,
        responsive: false,
        pageLength: 12,
        lengthMenu: [
          [8, 12, 20, 50, -1],
          [8, 12, 20, 50, "Todos"],
        ],
        dom: "<'cuad-temas-dt-toolbar cuad-temas-dt-toolbar--row'lf>rt<'cuad-temas-dt-bottom d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2'ip>",
        columnDefs: [
          { targets: 0, width: "2.75rem" },
          { targets: 2, width: "8rem" },
          { targets: 3, width: "16.25rem" },
        ],
        columns: [
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
            render: (v) =>
              v
                ? '<span class="badge rounded-2 bg-success cuad-temas-badge">Activo</span>'
                : '<span class="badge rounded-2 bg-secondary cuad-temas-badge">Inactivo</span>',
          },
          {
            data: null,
            title: "Acciones",
            orderable: false,
            className: "text-end cuad-temas-col-actions cuad-temas-th-actions",
            render: (row) => {
              const toggleTxt = row.activo ? "Deshabilitar" : "Habilitar";
              const toggleIcon = row.activo ? "bi-pause-circle" : "bi-play-circle";
              const toggleBtnClass = row.activo
                ? "btn-outline-warning"
                : "btn-outline-success";
              return `
                <div class="cuad-temas-actions d-inline-flex align-items-center justify-content-end flex-nowrap" role="group">
                  <button type="button" class="btn btn-sm cuad-temas-act-btn btn-outline-primary btn-editar-tema"
                          data-id="${row.id}"
                          data-nombre="${escAttrTemaCuad(row.nombre)}"
                          title="Editar nombre del tema">
                    <i class="bi bi-pencil" aria-hidden="true"></i>
                    <span>Editar</span>
                  </button>
                  <button type="button" class="btn btn-sm cuad-temas-act-btn ${toggleBtnClass} btn-toggle-tema"
                          data-id="${row.id}"
                          title="${toggleTxt}">
                    <i class="bi ${toggleIcon}" aria-hidden="true"></i>
                    <span>${toggleTxt}</span>
                  </button>
                </div>
              `;
            },
          },
        ],
        language: {
          search: "",
          searchPlaceholder: "Buscar por nombre o ID…",
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
          const api = this.api();
          const $wrap = $(api.table().container());
          $wrap.addClass("cuad-temas-dt-wrap");
          const $toolbar = $wrap.find(".cuad-temas-dt-toolbar").first();
          const modalTemas = document.getElementById("modalTemas");
          const $host = modalTemas
            ? $(modalTemas).find("#cuadTemasDtToolbarHost")
            : $("#cuadTemasDtToolbarHost");
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
            $length.addClass("cuad-temas-toolbar-field cuad-temas-toolbar-field--length");
            $length.find("label").remove();
            $lenSelect.addClass("form-select cuad-temas-length-select");
            const lenId = $lenSelect.attr("id") || "cuadTemasDtLengthSelect";
            $lenSelect.attr("id", lenId);
            $length.find(".cuad-temas-toolbar-block-label--length").remove();
            $length.prepend(
              `<label class="form-label cuad-temas-toolbar-block-label cuad-temas-toolbar-block-label--length" for="${lenId}">Filas por página</label>`
            );
            $("<div>")
              .addClass("cuad-temas-length-wrap")
              .append($lenSelect)
              .appendTo($length);
          }

          const $fil = findCtl(".dt-search, .dataTables_filter");
          const $inp = $fil.find("input[type=search], input").first().detach();
          if ($inp.length && $fil.length) {
            $fil.empty();
            $fil.addClass("cuad-temas-filter-wrap cuad-temas-toolbar-field cuad-temas-toolbar-field--search");
            const searchId = "cuadTemasDtSearchInput";
            $fil.prepend(
              `<label class="form-label cuad-temas-toolbar-block-label cuad-temas-toolbar-block-label--search" for="${searchId}">Buscar en la tabla</label>`
            );
            $inp.attr({
              id: searchId,
              type: "search",
              placeholder: "Nombre o ID del tema…",
              autocomplete: "off",
            });
            $inp.addClass("form-control cuad-temas-search-input flex-grow-1");
            const $ig = $('<div class="input-group cuad-temas-search-ig align-items-stretch"></div>');
            $ig.append(
              '<span class="input-group-text cuad-temas-search-prefix" aria-hidden="true"><i class="bi bi-search"></i></span>',
              $inp
            );
            $("<div>").addClass("cuad-temas-filter-label").append($ig).appendTo($fil);
          }
        },
      });

      $tabla.off("click.temasCuadTabla", ".btn-editar-tema");
      $tabla.off("click.temasCuadTabla", ".btn-toggle-tema");

      $tabla.on("click.temasCuadTabla", ".btn-editar-tema", function () {
        showPanelTemaCuad("editar", {
          id: this.dataset.id,
          nombre: this.dataset.nombre || "",
        });
      });

      $tabla.on("click.temasCuadTabla", ".btn-toggle-tema", async function () {
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
          const r = await fetch(`${window.TEMAS_API_BASE_CUAD}/${id}/toggle`, {
            method: "PATCH",
          });
          const d = await r.json();
          if (!r.ok) {
            await uiAlert(d.error || "No se pudo cambiar el estado.");
            return;
          }
          await renderTemasCuad();
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
        } catch {}
      }, 0);
    } finally {
      renderingCuad = false;
    }
  }
  

  
  // limpiar TODOS los handlers previos de este módulo
  $(document).off(".temasCuad");

  // abrir Temas desde Matriz
  $(document).on("click.temasCuad", BTN_OPEN_SEL, function (ev) {
    ev.preventDefault();

    const modalTemas = document.getElementById("modalTemas");

    if (!modalTemas) return;

    modalTemas.dataset.ctx = "cuad";
    modalTemas.dataset.returnTo = MODAL_PADRE_ID;

    const mTemas = bootstrap.Modal.getOrCreateInstance(modalTemas, {
      backdrop: "static",
    });

    console.log("[CUAD:Temas] open -> modalTemas (matriz permanece abierta)");

    mTemas.show();
  });

  // al mostrarse, renderizar UNA sola vez
  $(document).on("shown.bs.modal.temasCuad", MODAL_SEL, async function () {
    if (this.dataset.ctx !== "cuad") return;

    console.log("[CUAD:Temas] shown -> renderTemasCuad()");
    await renderTemasCuad();
  });

  // al cerrar, volver a Matriz
  $(document).on("hidden.bs.modal.temasCuad", MODAL_SEL, function () {
  if (this.dataset.ctx !== "cuad") return;

  hidePanelTemaCuad();

  const returnTo = this.dataset.returnTo;
  if (!returnTo) return;

  const parentEl = document.getElementById(returnTo);
  if (parentEl) {
    console.log("[CUAD:Temas] return ->", returnTo);
    bootstrap.Modal.getOrCreateInstance(parentEl, {
      backdrop: "static",
      keyboard: false,
      focus: true,
    }).show();
  }
});

  // mostrar inactivos
  $(document).on("change.temasCuad", "#chkVerInactivosTemas", async function () {
    const modal = document.querySelector(MODAL_SEL);
    if (modal?.dataset?.ctx !== "cuad") return;
    await renderTemasCuad();
  });

  // agregar tema (panel inline)
  $(document).on("click.temasCuad", BTN_ADD_SEL, function (ev) {
    ev.preventDefault();
    const modal = document.querySelector(MODAL_SEL);
    if (modal?.dataset?.ctx !== "cuad") return;
    showPanelTemaCuad("crear");
  });

  $(document).on("click.temasCuad", "#btnTemaCuadGuardar", function (ev) {
    ev.preventDefault();
    void guardarPanelTemaCuad();
  });

  $(document).on("click.temasCuad", "#btnTemaCuadCancelar", function (ev) {
    ev.preventDefault();
    hidePanelTemaCuad();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    const modal = document.querySelector(MODAL_SEL);
    if (!modal?.classList.contains("show") || modal.dataset.ctx !== "cuad") return;
    const panel = document.getElementById("panelTemaCuad");
    if (!panel || !panel.classList.contains(PANEL_TEMA_OPEN_CLASS)) return;
    ev.stopPropagation();
    hidePanelTemaCuad();
  });
})();





}

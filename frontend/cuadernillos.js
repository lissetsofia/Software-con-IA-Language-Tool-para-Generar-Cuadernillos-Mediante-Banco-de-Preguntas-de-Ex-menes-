// --- BASE API robusta ---
const API = (
  window.API ?? `http://${location.hostname || "127.0.0.1"}:5050`
).replace(/\/+$/, "");

// Endpoint de Temas independiente de otros scripts
if (typeof window.TEMAS_API_BASE === "undefined") {
  window.TEMAS_API_BASE = `${API}/api/temas`;
}

// Endpoint específico para TEMAS en CUADERNILLOS
if (typeof window.TEMAS_API_BASE_CUAD === "undefined") {
  window.TEMAS_API_BASE_CUAD = `${API}/api/temas_cuad`;
}

// ===================== INICIALIZACIÓN DEL MÓDULO =====================
window.initCuadernillos = async function () {
  console.log("🔁 initCuadernillos() → recargar exámenes importados");

  try {
    // Usar la función global que ya exportaste
    if (typeof window.__listarExamenesImportados === "function") {
      await window.__listarExamenesImportados();
    } else if (typeof listarExamenesImportados === "function") {
      await listarExamenesImportados();
    }
  } catch (e) {
    console.error(
      "Error recargando exámenes importados desde initCuadernillos:",
      e
    );
  }
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
      ? TEMAS.map(
          (t) =>
            `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${esc(
              t.nombre
            )}</option>`
        ).join("")
      : `<option value="">— No hay temas —</option>`;

  function addFila($tbody, preset) {
    if (!TEMAS.length) return alert("No hay temas creados todavía.");
    const temaElegidoId = preset?.tema_id ?? TEMAS[0].id;
    const temaElegido = TEMAS.find((t) => t.id == temaElegidoId) || TEMAS[0];

    const key = crypto.randomUUID();
    const cantidad = Math.max(0, parseInt(preset?.cantidad ?? 0, 10));

    FILAS.push({
      key,
      tema_id: temaElegido.id,
      tema_nombre: temaElegido.nombre,
      cantidad,
      file: null,
    });

    $tbody.insertAdjacentHTML(
      "beforeend",
      `
      <tr data-key="${key}">
        <td>
          <select class="form-select sel-tema">${optTemas(
            temaElegido.id
          )}</select>
        </td>
        <td style="max-width:120px">
          <input type="number" class="form-control inp-cant" min="0" value="${cantidad}">
        </td>
        <td>
          <input type="file" class="inp-file" accept=".docx" hidden>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm btn-primary btn-importar">Importar</button>
            <span class="small text-muted file-name">Sin archivo</span>
          </div>
        </td>
        <td class="text-end">
          <button type="button" class="btn btn-sm btn-danger btn-quitar">Eliminar</button>
        </td>
      </tr>
    `
    );
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
    if (draft) {
      restaurarDesdeDraft($tbody, draft);
    }

    // Botón: agregar fila
    $btnAdd.onclick = () => {
      addFila($tbody);
      saveDraft();
    };

    // Botón: limpiar filas (también limpia borrador)
    $btnClr.onclick = () => {
      FILAS = [];
      $tbody.innerHTML = "";
      clearDraft();
      if ($nombre) $nombre.value = "Matriz";
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
        row.tema_id = Number(el.value);
        row.tema_nombre = TEMAS.find((t) => t.id == row.tema_id)?.nombre || "";
      } else if (el.classList.contains("inp-cant")) {
        row.cantidad = Math.max(0, parseInt(el.value || "0", 10));
      } else if (el.classList.contains("inp-file")) {
        row.file = el.files?.[0] || null;
        tr.querySelector(".file-name").textContent = row.file
          ? row.file.name
          : "Sin archivo";
      }
      saveDraft(); // ← guarda cada cambio
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
      }
    };

    // Botón: generar matriz
    $btnGen.onclick = async () => {
      if (!FILAS.length) return alert("Agrega al menos un tema.");
      for (const r of FILAS) {
        if (!r.tema_id) return alert("Selecciona el tema en todas las filas.");
        if (!r.file)
          return alert(
            `Falta importar el .docx para "${r.tema_nombre || "tema"}".`
          );
      }

      // 1) crear matriz
      let matriz_id;
      try {
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
        matriz_id = js.matriz_id;
      } catch (e) {
        return alert(e.message || "No se pudo crear la matriz.");
      }

      // 2) subir archivos
      try {
        for (const r of FILAS) {
          const fd = new FormData();
          fd.append("file", r.file);
          fd.append("tema_id", String(r.tema_id));
          fd.append("cantidad", String(r.cantidad || 0));
          await postForm(`/api/matriz/${matriz_id}/upload`, fd);
        }
      } catch (e) {
        return alert("Falló la subida de algún archivo: " + (e.message || ""));
      }

      // 3) generar y descargar (DOCX)
      try {
        const res = await fetch(apiURL(`/api/matriz/${matriz_id}/generar`), {
          method: "POST",
        });
        // Si el backend devuelve 409 (faltantes), mostramos el detalle
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

        // ✅ Cierra el modal PERO NO borra el borrador (se conserva para la próxima apertura)
        (bootstrap.Modal.getInstance(this) || new bootstrap.Modal(this)).hide();
      } catch (e) {
        alert(e.message || "No se pudo generar.");
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

  // ---------- Al mostrar el modal, enganchar el click de "#btnImportarOK" ----------
  document.addEventListener("shown.bs.modal", (ev) => {
    if (ev.target.id !== "modalImportarMatriz") return;

    console.log("[MATRIZ] modalImportarMatriz shown → bind btnImportarOK");

    const btn = document.querySelector(sel.btnImportar);
    if (!btn) {
      console.warn("[MATRIZ] No se encontró #btnImportarOK");
      return;
    }

    btn.onclick = (e) => {
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
            alert("Selecciona una matriz de la base de datos.");
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
          alert("✅ Matriz importada desde BD.");
        } else {
          // ---- MODO ARCHIVO DOCX ----
          const inp = document.querySelector(sel.file);
          const f = inp?.files?.[0];
          if (!f) {
            alert("Elige un archivo .docx.");
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
          alert("✅ Matriz DOCX seleccionada.");
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
        alert(e2.message || "No se pudo importar la matriz.");
      }
    };
  });
})();

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
        alert("Primero importa/selecciona una matriz.");
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
        const a = document.createElement("a");
        a.href = apiURL(j.zip_url);
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      alert("Exámenes por grupo generados correctamente.");
      resetBtn();
    } catch (e) {
      console.error(e);
      alert(e.message || "No se pudieron generar los exámenes.");
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
      <td>${g.nombre || ""}</td>
      <td>${Number(g.total_preguntas || 0)}</td>
      <td class="text-nowrap">
        <button type="button" class="btn btn-sm btn-primary btn-edit">Editar</button>
        <button type="button" class="btn btn-sm btn-danger  btn-del">Eliminar</button>
      </td>
    </tr>`;
}

// Render tabla simple
async function renderGruposCuadSimple() {
  const tb =
    document.querySelector("#tablaGrupos tbody") ||
    document.getElementById("tbodyGrupos");
  if (!tb) return;
  tb.innerHTML = `<tr><td colspan="5">Cargando…</td></tr>`;
  try {
    const data = await fetchGruposAll();
    tb.innerHTML = data.length
      ? data.map(rowGrupoHTML).join("")
      : `<tr><td colspan="5">Sin grupos aún</td></tr>`;
  } catch (e) {
    console.error(e);
    tb.innerHTML = `<tr><td colspan="5">Error cargando grupos</td></tr>`;
  }
}

// ===== Editor (mismo de antes, sin habilitar) =====
function filaCuotaHTML2(temas, preset = {}) {
  const temaSel = preset.tema_id ?? temas[0]?.id ?? "";
  const cant = Number(preset.cantidad ?? 5);
  const opts = temas
    .map(
      (t) =>
        `<option value="${t.id}" ${t.id == temaSel ? "selected" : ""}>${esc2(
          t.nombre
        )}</option>`
    )
    .join("");
  return `
    <div class="row g-2 align-items-center cuota-row mb-2">
      <div class="col-8"><select class="form-select sel-tema">${opts}</select></div>
      <div class="col-3"><input type="number" min="0" class="form-control inp-cant" value="${cant}"></div>
      <div class="col-1 text-end"><button type="button" class="btn btn-outline-danger btn-sm btnQuitarCuota">&times;</button></div>
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

async function abrirEditorGrupoCuadSimple(datos) {
  // Setear campos
  document.getElementById("grupo-id").value = datos?.idgrupo || "";
  document.getElementById("grupo-clave").value = (
    datos?.clave || ""
  ).toUpperCase();
  document.getElementById("grupo-nombre").value = datos?.nombre || "";
  document.getElementById("tituloGrupo").textContent = datos?.idgrupo
    ? "Editar grupo"
    : "Nuevo grupo";

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
  (cuotas.length ? cuotas : [{ tema_id: temas[0]?.id, cantidad: 5 }]).forEach(
    (c) => cont.insertAdjacentHTML("beforeend", filaCuotaHTML2(temas, c))
  );
  totalFrom2("#cuotasWrap", "#totalCuotas");

  // wire internos (una sola vez por apertura)
  document.getElementById("btnAddCuota").onclick = () => {
    cont.insertAdjacentHTML("beforeend", filaCuotaHTML2(temas));
    totalFrom2("#cuotasWrap", "#totalCuotas");
  };
  cont.onclick = (e) => {
    if (e.target.classList.contains("btnQuitarCuota")) {
      e.target.closest(".cuota-row")?.remove();
      totalFrom2("#cuotasWrap", "#totalCuotas");
    }
  };
  cont.oninput = (e) => {
    if (e.target.classList.contains("inp-cant"))
      totalFrom2("#cuotasWrap", "#totalCuotas");
  };

  new bootstrap.Modal(document.getElementById("modalGrupoForm")).show();
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
  if (!clave) return alert("La clave es requerida");

  const cuotas = [...document.querySelectorAll("#cuotasWrap .cuota-row")]
    .map((row) => ({
      tema_id: Number(row.querySelector(".sel-tema").value),
      cantidad: Math.max(
        0,
        parseInt(row.querySelector(".inp-cant").value || "0", 10)
      ),
    }))
    .filter((c) => c.tema_id && c.cantidad > 0);

  try {
    // 1) crear/actualizar grupo
    const { ok, data } = await __getJSON(
      id ? `${GRUPOS_API}/${id}` : GRUPOS_API,
      {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave, nombre }),
      }
    );
    if (!ok) return alert(data?.error || "No se pudo guardar el grupo.");
    const idgrupo = id || data.idgrupo || data.id;
    if (!idgrupo) throw new Error("No se obtuvo el id del grupo.");

    // 2) cuotas
    await saveCuotasGrupo2(idgrupo, cuotas);

    // cerrar + refrescar
    bootstrap.Modal.getInstance(
      document.getElementById("modalGrupoForm")
    )?.hide();
    await renderGruposCuadSimple();
  } catch (e) {
    console.error(e);
    alert(e.message || "No se pudo guardar.");
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
      if (!confirm("¿Eliminar este grupo?")) return;

      // intento normal
      let res = await __getJSON(`${GRUPOS_API}/${id}`, { method: "DELETE" });

      // si el backend devuelve mensaje tipo “usa force=1”
      const msg = (res.data?.error || "").toLowerCase();
      if (!res.ok && (msg.includes("force=1") || msg.includes("forzar"))) {
        const okForce = confirm(
          "El grupo tiene cuotas/relaciones. ¿Eliminar de todos modos (force)?"
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
        alert(res.data?.error || "No se pudo eliminar.");
        return;
      }
      await renderGruposCuadSimple();
    }
  });

  // Al abrir el modal, solo renderiza (los handlers ya están delegados)
  document.addEventListener("shown.bs.modal", (ev) => {
    if (ev.target.id === "modalGrupos") {
      renderGruposCuadSimple();
    }
  });
})();

// Botón "Agregar grupo"
document.getElementById("btnNuevoGrupo")?.addEventListener("click", () => {
  abrirEditorGrupoCuadSimple(null);
});

// Al abrir tu modal #modalGrupos recarga la tabla simple
document.addEventListener("shown.bs.modal", (ev) => {
  if (ev.target.id === "modalGrupos") renderGruposCuadSimple();
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

async function aleatorizarClavesServer(examenId, grupoId) {
  return postJSON_claves("/api/claves/aleatorizar", {
    examen_id: examenId,
    grupo_id: grupoId,
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
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j : [];
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
  const btnDescargar = document.getElementById("btnDescargarPruebas");

  // Estado
  let EXAMENES = []; // {id, nombre, total_preguntas}
  let GRUPOS = []; // [{id, clave, nombre}]
  let CLAVES = []; // [{numero_pregunta, origen, p, q}]
  let EXAMEN_ID_ACTUAL = null; // examen elegido (por ahora tomamos el primero)

  // Helpers
  const LTRS = ["A", "B", "C", "D", "E"];

  // elige una letra cualquiera excepto las que le digas
  const pickExcept = (except = []) => {
    const pool = LTRS.filter((x) => !except.includes(x));
    return pool[Math.floor(Math.random() * pool.length)] || "A";
  };

  // ✅ SOLO garantiza: P != Q y que estén dentro de A–E
  const enforceRules = () => {
    CLAVES = CLAVES.map((r) => {
      r.origen = (r.origen || "A").toUpperCase();
      r.p = (r.p || "A").toUpperCase();
      r.q = (r.q || "B").toUpperCase();

      // si p no es válida, dale cualquiera
      if (!LTRS.includes(r.p)) r.p = pickExcept([]);

      // si q no es válida o q==p, dale otra distinta de p
      if (!LTRS.includes(r.q) || r.q === r.p) {
        r.q = pickExcept([r.p]);
      }

      return r;
    });
  };

  const renderExamenes = () => {
    // Puede haber MÁS de una tabla con id="tblImportados"
    const tbodies = document.querySelectorAll("#tblImportados tbody");
    if (!tbodies.length) return;

    let html;
    if (!EXAMENES.length) {
      html = `
        <tr>
          <td colspan="4" class="text-center text-muted">
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
    const tbody = tblClavesBody || document.querySelector("#tblClaves tbody");
    if (!tbody) {
      console.warn("Tabla de claves aún no existe en el DOM");
      return;
    }

    tbody.innerHTML = CLAVES.map(
      (r) => `
      <tr>
        <td>${r.numero_pregunta}</td>
        <td>
          <select class="form-select form-select-sm sel-origen" data-i="${
            r.numero_pregunta
          }">
            ${LTRS.map(
              (l) => `<option ${l === r.origen ? "selected" : ""}>${l}</option>`
            ).join("")}
          </select>
        </td>
        <td>
          <select class="form-select form-select-sm sel-p" data-i="${
            r.numero_pregunta
          }">
            ${LTRS.map(
              (l) => `<option ${l === r.p ? "selected" : ""}>${l}</option>`
            ).join("")}
          </select>
        </td>
        <td>
          <select class="form-select form-select-sm sel-q" data-i="${
            r.numero_pregunta
          }">
            ${LTRS.map(
              (l) => `<option ${l === r.q ? "selected" : ""}>${l}</option>`
            ).join("")}
          </select>
        </td>
      </tr>
    `
    ).join("");
  };

  const btnGuardarClaves = document.getElementById("btnGuardarClaves");

  btnGuardarClaves?.addEventListener("click", async () => {
    try {
      const selGrupo = document.getElementById("selGrupo");
      const grupoId = Number(selGrupo?.value || 0);
      if (!EXAMEN_ID_ACTUAL || !grupoId) {
        alert("Selecciona examen y grupo.");
        return;
      }
      await guardarClavesServer(EXAMEN_ID_ACTUAL, grupoId, CLAVES);
      alert("✅ Claves guardadas en BD.");
    } catch (e) {
      console.error(e);
      alert(e.message || "No se pudo guardar.");
    }
  });

  async function cargarGrupos() {
    // siempre re-buscamos el select cuando haga falta
    const selGrupo = document.getElementById("selGrupo");
    if (selGrupo) {
      selGrupo.innerHTML = `<option value="">Cargando…</option>`;
    }

    try {
      const r = await fetch(apiURL("/api/grupos?all=1")); // robusto
      const data = await r.json().catch(() => []);

      // normaliza campos del backend
      GRUPOS = (Array.isArray(data) ? data : [])
        .map((g) => ({
          id: Number(g.id ?? g.idgrupo ?? g.id_grupo ?? g.grupo_id),
          clave: (g.clave || "").trim(),
          nombre: (g.nombre || "").trim(),
        }))
        .filter((g) => g.id); // solo válidos

      // si todavía no hay select, ya tenemos GRUPOS en memoria
      if (!selGrupo) return;

      if (!GRUPOS.length) {
        selGrupo.innerHTML = `<option value="">(No hay grupos)</option>`;
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
    CLAVES = await getClavesOrigen(examenId, grupoId);
    enforceRules();

    const tbody = document.querySelector("#tblClaves tbody");
    if (tbody) renderClaves();
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
        alert("No se pudo importar exámenes: " + (e.message || ""));
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

    if (!confirm("¿Eliminar este examen importado?")) {
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
      alert("No se pudo eliminar: " + (err.message || ""));
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
          alert("Primero importa o selecciona un examen.");
          return;
        }
      }

      // 2) cargar grupos desde BD
      await cargarGrupos();

      // re-buscamos el select de grupo AHORA (cuando el modal ya existe)
      const selGrupo = document.getElementById("selGrupo");
      const gid = Number(selGrupo?.value || GRUPOS[0]?.id || 0);

      if (!gid) {
        // fallback ultra seguro
        if (selGrupo)
          selGrupo.innerHTML = `<option value="">(Sin grupos)</option>`;
        CLAVES = [];
        renderClaves();
      } else {
        // si el select existe pero está vacío, lo sincronizamos con el gid elegido
        if (selGrupo && !selGrupo.value) {
          selGrupo.value = String(gid);
        }
        await cargarClaves(EXAMEN_ID_ACTUAL, gid);
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
    if (!EXAMEN_ID_ACTUAL || !gid) {
      CLAVES = [];
      renderClaves();
      return;
    }

    await cargarClaves(EXAMEN_ID_ACTUAL, gid);
  });

  // Edición manual en tabla (enforce rules)
  tblClavesBody?.addEventListener("change", (e) => {
    const el = e.target;
    const idx = Number(el.getAttribute("data-i"));
    const row = CLAVES.find((x) => x.numero_pregunta === idx);
    if (!row) return;
    if (el.classList.contains("sel-origen"))
      row.origen = el.value.toUpperCase();
    if (el.classList.contains("sel-p")) row.p = el.value.toUpperCase();
    if (el.classList.contains("sel-q")) row.q = el.value.toUpperCase();
    enforceRules();
    renderClaves();
  });

  // Aleatorizar P/Q (cliente) – si prefieres en servidor, llama /api/claves/aleatorizar
  btnAleatorizarPQ?.addEventListener("click", async () => {
    try {
      const selGrupo = document.getElementById("selGrupo");
      const grupoId = Number(selGrupo?.value || 0);
      if (!EXAMEN_ID_ACTUAL || !grupoId) {
        alert("Selecciona examen y grupo.");
        return;
      }

      // 1) aleatoriza en BD
      await aleatorizarClavesServer(EXAMEN_ID_ACTUAL, grupoId);

      // 2) recarga desde BD
      CLAVES = await getClavesOrigen(EXAMEN_ID_ACTUAL, grupoId);
      enforceRules();
      renderClaves();

      alert("✅ Aleatorización P/Q aplicada.");
    } catch (e) {
      console.error(e);
      alert(e.message || "No se pudo aleatorizar.");
    }
  });

  // Descargar pruebas
  btnDescargar?.addEventListener("click", async () => {
    try {
      if (!EXAMEN_ID_ACTUAL) {
        alert("Selecciona un examen.");
        return;
      }

      const selGrupo = document.getElementById("selGrupo");
      const grupoIdSel = Number(selGrupo?.value || 0);
      if (grupoIdSel) {
        await guardarClavesServer(EXAMEN_ID_ACTUAL, grupoIdSel, CLAVES);
      }

      const r = await fetch(apiURL("/api/pruebas/descargar_all"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examen_id: EXAMEN_ID_ACTUAL }),
      });
      // ...

      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "PRUEBAS_TODOS.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert(e.message || "Fallo la descarga del ZIP.");
    }
  });

  // ===========================
  // Recargar exámenes al abrir "Gestionar tipo de pruebas"
  // ===========================
  document.addEventListener("shown.bs.modal", (ev) => {
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
   TEMAS (CRUD en modal) — CUADERNILLOS
   ======================= */
(() => {
  // Usamos una bandera distinta para no chocar con otros módulos
  if (window.__TEMAS_WIRED_CUAD__) return;
  window.__TEMAS_WIRED_CUAD__ = true;

  let dtTemas = null;

  $.fn.dataTable.ext.errMode = "console";

  const urlTemas = (all) =>
    `${window.TEMAS_API_BASE_CUAD}${all ? "?all=1" : ""}`;

  async function fetchTemas(includeInactive) {
    const url = urlTemas(includeInactive);
    console.log("[Temas CUAD] GET", url);
    const r = await fetch(url);
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`Temas HTTP ${r.status}: ${t}`);
    }
    const json = await r.json();
    console.log("[Temas CUAD] datos recibidos:", json);
    return Array.isArray(json) ? json : [];
  }

  async function renderTemasCuad() {
    const showInactivos = document.getElementById(
      "chkVerInactivosTemas"
    )?.checked;
    const data = await fetchTemas(showInactivos);

    const cols = [
      { data: "id" },
      { data: "nombre" },
      {
        data: "activo",
        render: (v) =>
          v
            ? '<span class="badge bg-success">Activo</span>'
            : '<span class="badge bg-secondary">Inactivo</span>',
      },
      {
        data: null,
        orderable: false,
        render: (row) => {
          const toggleTxt = row.activo ? "Deshabilitar" : "Habilitar";
          const toggleClass = row.activo ? "btn-warning" : "btn-success";
          return `
            <div class="btn-group btn-group-sm" role="group">
              <button class="btn btn-primary btn-editar-tema"
                      data-id="${row.id}" data-nombre="${row.nombre}">
                Editar
              </button>
              <button class="btn ${toggleClass} btn-toggle-tema"
                      data-id="${row.id}">
                ${toggleTxt}
              </button>
            </div>`;
        },
      },
    ];

    if (!$.fn.DataTable.isDataTable("#tabla-temas")) {
      console.log("[Temas CUAD] creando DataTable…");
      dtTemas = $("#tabla-temas").DataTable({
        data,
        destroy: true,
        autoWidth: false,
        responsive: true,
        pageLength: 8,
        columns: cols,
        language: {
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
        },
      });

      // EDITAR
      $("#tabla-temas").on("click", ".btn-editar-tema", function () {
        const id = this.dataset.id;
        const nombre = this.dataset.nombre || "";

        const inputId = document.getElementById("temaIdEditar");
        const inputNombre = document.getElementById("temaNombreEditar");
        const modalEditarEl = document.getElementById("modalTemaEditar");

        if (!inputId || !inputNombre || !modalEditarEl) {
          console.error("[Temas CUAD] faltan elementos para editar tema");
          return;
        }

        inputId.value = id;
        inputNombre.value = nombre;

        if (modalEditarEl.parentElement !== document.body) {
          document.body.appendChild(modalEditarEl);
        }

        const mEditar = bootstrap.Modal.getOrCreateInstance(modalEditarEl, {
          backdrop: "static",
        });
        mEditar.show();
      });

      // TOGGLE
      $("#tabla-temas").on("click", ".btn-toggle-tema", async function () {
        const id = this.dataset.id;
        if (!confirm("¿Cambiar el estado de este tema?")) return;
        try {
          const r = await fetch(`${window.TEMAS_API_BASE_CUAD}/${id}/toggle`, {
            method: "PATCH",
          });
          const d = await r.json();
          if (!r.ok) return alert(d.error || "No se pudo cambiar el estado.");
          await renderTemasCuad();
        } catch (e) {
          console.error(e);
          alert("Error de red.");
        }
      });
    } else {
      console.log("[Temas CUAD] refrescando DataTable…");
      dtTemas.clear().rows.add(data).draw(false);
    }

    setTimeout(() => {
      try {
        $("#tabla-temas").DataTable().columns.adjust().responsive.recalc();
      } catch {}
    }, 0);
  }

  // Cuando se muestre el modal de Temas → cargar lista para CUADERNILLOS
  $(document).on("shown.bs.modal", "#modalTemas", async function () {
    console.log("[Temas CUAD] modal mostrado → renderTemasCuad()");
    try {
      await renderTemasCuad();
    } catch (e) {
      console.error(e);
      alert("No se pudo cargar Temas. Revisa consola.");
    }
  });

  // Filtro “mostrar inactivos”
  $(document).on("change", "#chkVerInactivosTemas", async function () {
    try {
      await renderTemasCuad();
    } catch (e) {
      console.error(e);
    }
  });

  // Crear
  $(document).on("submit", "#formTemaCrear", async function (e) {
    e.preventDefault();
    const nombre = document.getElementById("temaNombreCrear").value.trim();
    if (!nombre) return;
    try {
      const r = await fetch(window.TEMAS_API_BASE_CUAD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      const d = await r.json();
      if (!r.ok) return alert(d.error || "Error al crear.");
      bootstrap.Modal.getInstance(
        document.getElementById("modalTemaCrear")
      )?.hide();
      document.getElementById("temaNombreCrear").value = "";
      await renderTemasCuad();
    } catch (e2) {
      console.error(e2);
      alert("Error de red.");
    }
  });

  // Editar
  $(document).on("submit", "#formTemaEditar", async function (e) {
    e.preventDefault();
    const id = document.getElementById("temaIdEditar").value;
    const nombre = document.getElementById("temaNombreEditar").value.trim();
    if (!nombre) return;
    try {
      const r = await fetch(`${window.TEMAS_API_BASE_CUAD}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      const d = await r.json();
      if (!r.ok) return alert(d.error || "Error al actualizar.");
      bootstrap.Modal.getInstance(
        document.getElementById("modalTemaEditar")
      )?.hide();
      await renderTemasCuad();
    } catch (e2) {
      console.error(e2);
      alert("Error de red.");
    }
  });
})();

// Botón "Temas" en Generar matriz: abrir #modalTemas usando SOLO este archivo
(function () {
 

  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("#btnTemasMatriz");
    if (!btn) return;

    const modalEl = document.getElementById("modalTemas");
    if (!modalEl) {
      console.error("[TemasMatriz] No existe #modalTemas en el DOM");
      alert("No se encontró el modal de Temas.");
      return;
    }

    // Nos aseguramos de que el modal esté directo en <body>
    if (modalEl.parentElement !== document.body) {
      document.body.appendChild(modalEl);
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl, {
      backdrop: "static",
    });

    modal.show();
  });
})();

// Botón "+ Agregar temas" dentro de Gestión de Temas
(function () {
  const btnAgregar = document.getElementById("btnAgregarTema");
  if (!btnAgregar) return;

  btnAgregar.addEventListener("click", () => {
    const modalCrearEl = document.getElementById("modalTemaCrear");
    if (!modalCrearEl) {
      console.error("No existe #modalTemaCrear en el DOM");
      return;
    }

    // Aseguramos que esté colgando de <body> (por si acaso)
    if (modalCrearEl.parentElement !== document.body) {
      document.body.appendChild(modalCrearEl);
    }

    const mCrear = bootstrap.Modal.getOrCreateInstance(modalCrearEl, {
      backdrop: "static",
    });
    mCrear.show();
  });
})();

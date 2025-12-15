// Estado global del último archivo generado (docx/pdf)
// --- SIEMPRE al comienzo del archivo ---
window.__ultimoGenerado = {
  docxUrl: null,
  pdfUrl: null,
  docxName: null,
  pdfName: null,
};

if (window.__GENERACION_PREGUNTAS_LOADED__) {
  console.warn(
    "generacion_preguntas.js ya estaba cargado; omito segunda ejecución"
  );
  // opcional: return;  // si envuelves el resto del código en una función puedes cortar aquí
} else {
  window.__GENERACION_PREGUNTAS_LOADED__ = true;
}
function generarNuevoExamen() {
  document
    .getElementById("modal-examen")
    .classList.replace("oculto", "mostrar-flex");
}

function cerrarModalExamen() {
  document
    .getElementById("modal-examen")
    .classList.replace("mostrar-flex", "oculto");
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

    if (!$.fn.DataTable.isDataTable("#tabla-examenes")) {
      tabla.DataTable({
        data: examenes,
        columns: [
          { data: "nombre" },
          { data: "numero" },
          { data: "institucion" },
          { data: "anio" },
          {
            data: null,
            render: function (data, type, row) {
              return `
  <button class="btn btn-sm btn-primary btn-buscar" data-id="${row.idexamenes}">Cursos</button>
  <button class="btn btn-sm btn-success mx-1" onclick="abrirModalExportar(${row.idexamenes})">Exportar</button>
  <button class="btn btn-sm btn-danger eliminar-examen" data-id="${row.idexamenes}">Eliminar</button>
`;
            },
          },
        ],
        autoWidth: false, // Desactiva el ancho automático de columnas
        responsive: true, // Activa responsividad si lo usas
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
        },
      });
    } else {
      const dt = tabla.DataTable();
      dt.clear();
      dt.rows.add(examenes);
      dt.draw();
    }
  } catch (error) {
    console.error("❌ Error al cargar exámenes:", error);
  }
}

// ================== INICIALIZACIÓN DEL MÓDULO ==================
window.initGeneracionPreguntas = function () {
  console.log("🔁 initGeneracionPreguntas() → recargar tabla y wiring");

  // 1) Cargar / recargar tabla de exámenes
  cargarExamenes();

  // 2) Enganchar input de archivo y botón importar (solo una vez)
  const archivo = document.getElementById("archivo");
  const btnImportar = document.getElementById("btnImportar");

  if (archivo && btnImportar && !archivo.dataset.wired) {
    archivo.dataset.wired = "1"; // marca para no duplicar el listener
    archivo.addEventListener("change", () => {
      btnImportar.disabled = false;
    });
  }
};



$(document).on("click", ".eliminar-examen", async function () {
  const id = $(this).data("id");

  if (!confirm("¿Estás seguro de eliminar este examen?")) return;

  try {
    const res = await fetch(`http://localhost:5050/api/examenes/${id}`, {
      method: "DELETE",
    });

    const data = await res.json();
    if (res.ok) {
      alert("✅ " + data.mensaje);
      cargarExamenes();
    } else {
      alert("❌ " + (data.error || "Error al eliminar examen"));
    }
  } catch (err) {
    console.error("Error eliminando examen:", err);
    alert("❌ Error al conectar con el servidor");
  }
});

async function importarExamen() {
  const input = document.getElementById("archivo");
  const archivo = input.files[0];
  const btnImportar = document.getElementById("btnImportar");

  if (!archivo) {
    alert("Selecciona un archivo primero");
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
      alert("✅ Examen importado correctamente");

      // 🔒 Desactiva el botón después de importar exitosamente
      document.getElementById("btnImportar").disabled = true;
      // Recarga tabla
      cargarExamenes();
    } else {
      alert("❌ " + (resultado.error || "Error al importar"));
    }
  } catch (err) {
    console.error(err);
    alert("❌ Error al conectar con el servidor");
  }
}
//  Para exportar examenes
if (typeof examenSeleccionadoParaExportar === "undefined") {
  var examenSeleccionadoParaExportar = null;
}

function abrirModalExportar(idexamen) {
  console.log("🧪 Modal abierto para exportar:", idexamen);
  examenSeleccionadoParaExportar = idexamen;
  document
    .getElementById("modal-exportar")
    .classList.replace("oculto", "mostrar");
}

function cerrarModalExportar() {
  document
    .getElementById("modal-exportar")
    .classList.replace("mostrar", "oculto");
  examenSeleccionadoParaExportar = null;
}

async function exportarExamenSeleccionado(formato) {
  if (!examenSeleccionadoParaExportar) return;

  try {
    // 1) ¿Existe la API del preload?
    if (window.api && typeof window.api.exportarExamen === "function") {
      const res = await window.api.exportarExamen(
        examenSeleccionadoParaExportar,
        formato
      );
      if (res?.ok) {
        console.log("✅ Guardado en:", res.path);
      } else if (!res?.canceled) {
        alert(
          "❌ No se pudo exportar: " + (res?.message || "Error desconocido")
        );
      }
    } else {
      // 2) Fallback: descarga directa desde el backend (abre nueva pestaña)
      console.warn("window.api no disponible, usando fallback fetch.");
      const url = `http://localhost:5050/api/exportar_examen/${examenSeleccionadoParaExportar}?formato=${formato}`;
      window.open(url, "_blank");
    }
  } catch (e) {
    console.error("Error exportando:", e);
    alert("❌ Error exportando.");
  } finally {
    cerrarModalExportar();
  }
}

/* =======================
   TEMAS (CRUD en modal) — INICIALIZAR CUANDO EL MODAL ESTÁ VISIBLE
   ======================= */


(() => {
  if (window.__TEMAS_WIRED__) return;
  window.__TEMAS_WIRED__ = true;

  let dtTemas = null;

  // Mostrar errores de DataTables en consola
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

  async function renderTemas() {
    const showInactivos = document.getElementById(
      "chkVerInactivosTemas"
    )?.checked;
    const data = await fetchTemas(showInactivos);

    if (!$.fn.DataTable.isDataTable("#tabla-temas")) {
      console.log("[Temas] creando DataTable…");
      dtTemas = $("#tabla-temas").DataTable({
        data,
        destroy: true, // por si la inicializaron antes
        autoWidth: false,
        responsive: true, // no usar scrollX
        pageLength: 8,
        columns: [
          { data: "id" },
          { data: "nombre" },
          { data: "n_preguntas" },
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
        ],
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

      // Delegados (una sola vez)
      $("#tabla-temas").on("click", ".btn-editar-tema", function () {
        const id = this.dataset.id;
        const nombre = this.dataset.nombre;
        document.getElementById("temaIdEditar").value = id;
        document.getElementById("temaNombreEditar").value = nombre;
        new bootstrap.Modal(document.getElementById("modalTemaEditar")).show();
      });

      $("#tabla-temas").on("click", ".btn-toggle-tema", async function () {
        const id = this.dataset.id;
        if (!confirm("¿Cambiar el estado de este tema?")) return;
        try {
          const r = await fetch(`${window.TEMAS_API_BASE}/${id}/toggle`, {
            method: "PATCH",
          });
          const d = await r.json();
          if (!r.ok) return alert(d.error || "No se pudo cambiar el estado.");
          await renderTemas();
        } catch (e) {
          console.error(e);
          alert("Error de red.");
        }
      });
    } else {
      console.log("[Temas] refrescando DataTable…");
      dtTemas.clear().rows.add(data).draw(false);
    }

    // Ajusta columnas por si el modal cambió de ancho
    setTimeout(() => {
      try {
        $("#tabla-temas").DataTable().columns.adjust().responsive.recalc();
      } catch {}
    }, 0);
  }

  // ————— Cableado robusto —————

  // 1) Inicializar SOLO cuando el modal ya está visible

  $(document).on("shown.bs.modal", "#modalTemas", async function () {
    console.log("[Temas] modal mostrado → renderTemas()");
    try {
      await renderTemas();
    } catch (e) {
      console.error(e);
      alert("No se pudo cargar Temas. Revisa consola.");
    }
  });

  // 2) Filtro “mostrar inactivos”
  $(document).on("change", "#chkVerInactivosTemas", async function () {
    try {
      await renderTemas();
    } catch (e) {
      console.error(e);
    }
  });

  // 3) Crear
  $(document).on("submit", "#formTemaCrear", async function (e) {
    e.preventDefault();
    const nombre = document.getElementById("temaNombreCrear").value.trim();
    if (!nombre) return;
    try {
      const r = await fetch(window.TEMAS_API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      const d = await r.json();
      if (!r.ok) return alert(d.error || "Error al crear.");
      bootstrap.Modal.getInstance(
        document.getElementById("modalTemaCrear")
      ).hide();
      document.getElementById("temaNombreCrear").value = "";
      await renderTemas();
      new bootstrap.Modal(document.getElementById("modalTemas")).show();
    } catch (e2) {
      console.error(e2);
      alert("Error de red.");
    }
  });

  // 4) Editar
  $(document).on("submit", "#formTemaEditar", async function (e) {
    e.preventDefault();
    const id = document.getElementById("temaIdEditar").value;
    const nombre = document.getElementById("temaNombreEditar").value.trim();
    if (!nombre) return;
    try {
      const r = await fetch(`${window.TEMAS_API_BASE}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      const d = await r.json();
      if (!r.ok) return alert(d.error || "Error al actualizar.");
      bootstrap.Modal.getInstance(
        document.getElementById("modalTemaEditar")
      ).hide();
      await renderTemas();
      new bootstrap.Modal(document.getElementById("modalTemas")).show();
    } catch (e2) {
      console.error(e2);
      alert("Error de red.");
    }
  });
})();

// Reusa tu objeto de traducciones si lo tienes
//preguntas
// Helper fetch -> JSON con manejo de errores

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
if (typeof window.examenActual === "undefined") window.examenActual = null;
if (typeof window.dtBuscarTemas === "undefined") window.dtBuscarTemas = null;
if (typeof window.dtBuscarPregs === "undefined") window.dtBuscarPregs = null;

// Click en "Buscar" de un examen
// Click en "Buscar"
$(document).on("click", ".btn-buscar", async function () {
  const raw = this.dataset.id ?? $(this).attr("data-id");
  const id = Number(raw);
  console.log("[Buscar] id =", raw, "->", id);
  if (!Number.isInteger(id) || id <= 0) {
    alert("ID de examen inválido");
    return;
  }
  examenActual = id;

  try {
    await fetch(
      `http://localhost:5050/api/examenes/${id}/partir_y_guardar?overwrite=0`,
      { method: "POST" }
    );

    await cargarTemasDelExamen(id);
    new bootstrap.Modal(document.getElementById("modalBuscar")).show();
  } catch (e) {
    console.error(e);
    alert("No se pudo preparar el examen.");
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
          render: (row) =>
            `<button class="btn btn-primary btn-ver-tema" 
                      data-tema="${row.id}" 
                      data-nombre="${row.nombre}">Descargar</button>`,
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

  // Título del modal preguntas
  $("#tituloTemaPregs").text(temaNombre);

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
              return `<a class="btn btn-sm btn-secondary" href="${href}" target="_blank">Abrir</a>`;
            },
          },
        ],
        language: DT_ES,
      });
    } else {
      dtPregsTema.clear().rows.add(pregs).draw(false);
    }

    // Mostrar modal de preguntas
    new bootstrap.Modal(document.getElementById("modalPreguntas")).show();
  } catch (e) {
    console.error(e);
    alert("No se pudieron cargar las preguntas.");
  }
});

// ======================= GRUPOS (nuevo) =======================
// ======================= GRUPOS (nuevo) =======================
// --- Definición segura de API_BASEs ---
if (typeof window.GRUPOS_API_BASE === "undefined")
  window.GRUPOS_API_BASE = "http://localhost:5050/api/grupos";

if (typeof window.TEMAS_API_BASE === "undefined")
  window.TEMAS_API_BASE = "http://localhost:5050/api/temas";

if (typeof window.dtGrupos === "undefined") window.dtGrupos = null;
window.grupoSeleccionado = null; // { id, clave }

// --- cache de temas activos ---
if (typeof window.__temasCache === "undefined") window.__temasCache = null;
async function cargarTemasActivos() {
  if (__temasCache) return __temasCache;
  const r = await fetch(TEMAS_API_BASE);
  const arr = await r.json();
  __temasCache = (arr || []).filter((t) => t.activo);
  return __temasCache;
}

// --- helpers cuotas (fila + total) ---
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
    <div class="row g-2 align-items-center cuota-row mb-2">
      <div class="col-8">
        <select class="form-select sel-tema" required>
          <option value="" disabled ${
            temaSel ? "" : "selected"
          }>Selecciona tema…</option>
          ${opts}
        </select>
      </div>
      <div class="col-3">
        <input type="number" min="1" class="form-control inp-cant" placeholder="Cant." required value="${cant}">
      </div>
      <div class="col-1 text-end">
        <button type="button" class="btn btn-sm btn-danger btnQuitarCuota">✕</button>
      </div>
    </div>`;
}
function totalFrom(containerSel, totalSel) {
  const n = [...document.querySelectorAll(`${containerSel} .inp-cant`)]
    .map((i) => parseInt(i.value, 10) || 0)
    .reduce((a, b) => a + b, 0);
  document.querySelector(totalSel).textContent = n;
}

// --- API helpers ---
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
// guardar cuotas por ID de grupo (sin examenes)
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

// -------- panel izquierdo (lista dinámica) --------
async function renderGruposLeftPanel() {
  const ul = document.getElementById("lista-grupos");
  if (!ul) return;

  try {
    const grupos = await fetchGrupos(false); // solo activos
    ul.innerHTML = "";

    grupos.forEach((g) => {
      const li = document.createElement("li");
      li.className = "d-flex align-items-center justify-content-between mb-2";

      const left = document.createElement("div");
      left.className = "d-flex align-items-center gap-2";
      left.innerHTML = `
        <span class="btn btn-sm btn-custom">${g.clave}</span>
        <span class="text-muted small">${g.nombre || ""}</span>
        <span class="btn btn-sm btn-primary">${g.total_preguntas ?? 0}</span>
      `;

      const right = document.createElement("div");
      right.className = "d-flex align-items-center gap-1";

      const btnCfg = document.createElement("button");
      btnCfg.className = "btn btn-sm btn-secondary";
      btnCfg.title = "Configurar cuotas por tema";
      btnCfg.textContent = "⚙";
      btnCfg.onclick = () => abrirModalEditarGrupo(g);

      const btnDel = document.createElement("button");

      btnDel.className = "btn btn-sm btn-danger btnQuitarCuota";
      btnDel.title = "Eliminar";
      btnDel.textContent = "✕";
      btnDel.onclick = async () => {
        if (!confirm("¿Eliminar este grupo?")) return;
        const r = await fetch(`${window.GRUPOS_API_BASE}/${g.idgrupo}`, {
          method: "DELETE",
        });
        const d = await r.json();
        if (!r.ok) return alert(d.error || "No se pudo eliminar");
        if (grupoSeleccionado?.id === g.idgrupo) grupoSeleccionado = null;
        await renderGruposLeftPanel();
        if ($.fn.DataTable.isDataTable("#tabla-grupos"))
          await renderGruposModal();
      };

      right.appendChild(btnCfg);
      right.appendChild(btnDel);

      li.appendChild(left);
      li.appendChild(right);

      li.style.cursor = "pointer";

      li.onclick = (ev) => {
        if (ev.target === btnCfg || ev.target === btnDel) return;
        [...ul.children].forEach((n) => n.classList.remove("selected"));
        li.classList.add("selected");

        // ⬇️ importante: guardar en window
        window.grupoSeleccionado = { id: g.idgrupo, clave: g.clave };
        console.log("Grupo seleccionado:", window.grupoSeleccionado);
      };

      ul.appendChild(li);
    });
  } catch (e) {
    console.error("[Grupos] No se pudo cargar la lista:", e);
  }
}

// mostrar lista al abrir tu modal principal
if (typeof window.__origGenerarNuevoExamen === "undefined") {
  window.__origGenerarNuevoExamen = window.generarNuevoExamen;
}
window.generarNuevoExamen = function () {
  renderGruposLeftPanel();
  if (typeof window.__origGenerarNuevoExamen === "function") {
    window.__origGenerarNuevoExamen();
  }
};

// -------- DataTable del modal (CRUD) --------
async function renderGruposModal() {
  const showInactivos = document.getElementById(
    "chkVerInactivosGrupos"
  )?.checked;
  const data = await fetchGrupos(showInactivos);

  if (!$.fn.DataTable.isDataTable("#tabla-grupos")) {
    dtGrupos = $("#tabla-grupos").DataTable({
      data,
      destroy: true,
      autoWidth: false,
      responsive: true,
      pageLength: 8,
      columns: [
        { data: "idgrupo", title: "ID" },
        { data: "clave", title: "Clave" },
        { data: "nombre", title: "Nombre" },
        { data: "total_preguntas", title: "Preguntas" },
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
                <button class="btn btn-primary btn-editar-grupo"
                        data-id="${row.idgrupo}" data-clave="${row.clave}"
                        data-nombre="${row.nombre || ""}">
                  Editar
                </button>
                <button class="btn ${toggleClass} btn-toggle-grupo" data-id="${
              row.idgrupo
            }">
                  ${toggleTxt}
                </button>
                <button class="btn btn-danger btn-eliminar-grupo" data-id="${
                  row.idgrupo
                }">
                  Eliminar
                </button>
              </div>`;
          },
        },
      ],
      language: DT_ES,
    });

    // Delegados
    $("#tabla-grupos").off("click", ".btn-editar-grupo");
    $("#tabla-grupos").on("click", ".btn-editar-grupo", async function () {
      const { id, clave, nombre } = this.dataset;
      // usa el mismo editor que el panel izquierdo
      abrirModalEditarGrupo({ idgrupo: Number(id), clave, nombre });
    });

    $("#tabla-grupos").on("click", ".btn-toggle-grupo", async function () {
      const id = this.dataset.id;
      try {
        const r = await fetch(`${window.GRUPOS_API_BASE}/${id}/toggle`, {
          method: "PATCH",
        });
        const d = await r.json();
        if (!r.ok) return alert(d.error || "No se pudo cambiar el estado.");
        await renderGruposModal();
        await renderGruposLeftPanel();
      } catch (e) {
        console.error(e);
        alert("Error de red.");
      }
    });

    $("#tabla-grupos").on("click", ".btn-eliminar-grupo", async function () {
      const id = this.dataset.id;
      if (!confirm("¿Eliminar este grupo?")) return;
      try {
        const r = await fetch(`${window.GRUPOS_API_BASE}/${id}`, {
          method: "DELETE",
        });
        const d = await r.json();
        if (!r.ok) return alert(d.error || "No se pudo eliminar");
        await renderGruposModal();
        await renderGruposLeftPanel();
      } catch (e) {
        console.error(e);
        alert("Error de red.");
      }
    });
  } else {
    dtGrupos.clear().rows.add(data).draw(false);
  }

  setTimeout(() => {
    try {
      $("#tabla-grupos").DataTable().columns.adjust().responsive.recalc();
    } catch {}
  }, 0);
}

// abrir modal → cargar tabla
$(document).on("shown.bs.modal", "#modalGrupos", async function () {
  try {
    await renderGruposModal();
  } catch (e) {
    console.error(e);
    alert("No se pudo cargar grupos.");
  }
});

// filtro “mostrar inactivos”
$(document).on("change", "#chkVerInactivosGrupos", async function () {
  try {
    await renderGruposModal();
  } catch (e) {
    console.error(e);
  }
});

// ========== CREAR GRUPO ==========
$(document).on("show.bs.modal", "#modalGrupoCrear", async function () {
  const temas = await cargarTemasActivos();
  const cont = document.getElementById("cuotasContainer");
  cont.innerHTML = filaCuotaHTML(temas);
  totalFrom("#cuotasContainer", "#totalCuotas");

  document.getElementById("btnAgregarCuota").onclick = () => {
    cont.insertAdjacentHTML("beforeend", filaCuotaHTML(temas));
  };
  cont.addEventListener("click", (e) => {
    if (e.target.classList.contains("btnQuitarCuota")) {
      e.target.closest(".cuota-row")?.remove();
      totalFrom("#cuotasContainer", "#totalCuotas");
    }
  });
  cont.addEventListener("input", (e) => {
    if (e.target.classList.contains("inp-cant"))
      totalFrom("#cuotasContainer", "#totalCuotas");
  });
});

$(document).on("submit", "#formGrupoCrear", async function (e) {
  e.preventDefault();

  const clave = $("#grupoClaveCrear").val().trim();
  const nombre = $("#grupoNombreCrear").val().trim();

  // Armar cuotas
  const cuotas = [];
  const seen = new Set();
  for (const row of document.querySelectorAll("#cuotasContainer .cuota-row")) {
    const temaId = row.querySelector(".sel-tema").value;
    const cant = row.querySelector(".inp-cant").value;
    if (!temaId || !cant) continue;
    if (seen.has(temaId)) {
      alert("No repitas el mismo tema.");
      return;
    }
    seen.add(temaId);
    cuotas.push({ tema_id: Number(temaId), cantidad: Number(cant) });
  }
  if (!clave || cuotas.length === 0) {
    alert("Completa la clave y al menos una cuota.");
    return;
  }

  // 1) crear grupo
  let idgrupo = null;
  try {
    const r = await fetch(window.GRUPOS_API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave, nombre }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) idgrupo = j.idgrupo ?? j.id; // según lo que devuelva tu API
    else if (r.status !== 409)
      return alert(j.error || "No se pudo crear el grupo.");
  } catch (e) {
    console.error(e);
    return alert("Error de red al crear el grupo.");
  }

  // si no vino el id, búscalo por clave
  if (!idgrupo) {
    const todos = await fetchGrupos(true);
    idgrupo = (todos.find((g) => g.clave === clave) || {}).idgrupo;
    if (!idgrupo) return alert("No se pudo obtener el id del grupo.");
  }

  // 2) guardar cuotas
  try {
    await saveCuotasGrupoById(idgrupo, cuotas);
    // ⬇️ solo cerrar y refrescar la lista de la izquierda
    bootstrap.Modal.getInstance(
      document.getElementById("modalGrupoCrear")
    ).hide();
    await renderGruposLeftPanel();
  } catch (e2) {
    console.error(e2);
    alert(e2.message || "No se pudieron guardar las cuotas.");
  }
});

// ========== EDITAR GRUPO ==========
async function abrirModalEditarGrupo(g) {
  $("#grupoIdEditar").val(g.idgrupo);
  $("#grupoClaveEditar").val(g.clave);
  $("#grupoNombreEditar").val(g.nombre || "");

  const temas = await cargarTemasActivos();
  const cont = document.getElementById("cuotasContainerEdit");
  cont.innerHTML = "";

  // cuotas actuales
  const cuotas = await fetchCuotasGrupo(g.idgrupo);
  if (Array.isArray(cuotas) && cuotas.length) {
    cuotas.forEach((q) =>
      cont.insertAdjacentHTML(
        "beforeend",
        filaCuotaHTML(temas, q.tema_id, q.cantidad)
      )
    );
  } else {
    cont.insertAdjacentHTML("beforeend", filaCuotaHTML(temas));
  }

  totalFrom("#cuotasContainerEdit", "#totalCuotasEdit");

  document.getElementById("btnAgregarCuotaEdit").onclick = () => {
    cont.insertAdjacentHTML("beforeend", filaCuotaHTML(temas));
  };
  cont.addEventListener("click", (e) => {
    if (e.target.classList.contains("btnQuitarCuota")) {
      e.target.closest(".cuota-row")?.remove();
      totalFrom("#cuotasContainerEdit", "#totalCuotasEdit");
    }
  });
  cont.addEventListener("input", (e) => {
    if (e.target.classList.contains("inp-cant"))
      totalFrom("#cuotasContainerEdit", "#totalCuotasEdit");
  });
  -new bootstrap.Modal(document.getElementById("modalGrupoEditar")).show();
  +abrirModalSobre("modalGrupos", "modalGrupoEditar");
}

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
    alert(err.message);
    return;
  }

  if (!nuevaClave || cuotas.length === 0) {
    alert("Completa clave y al menos una cuota.");
    return;
  }

  try {
    // 1) actualizar datos del grupo
    const r1 = await fetch(`${window.GRUPOS_API_BASE}/${idgrupo}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave: nuevaClave, nombre }),
    });
    const j1 = await r1.json();
    if (!r1.ok) throw new Error(j1.error || "No se pudo actualizar el grupo.");

    // 2) reemplazar cuotas
    await saveCuotasGrupoById(idgrupo, cuotas);

    bootstrap.Modal.getInstance(
      document.getElementById("modalGrupoEditar")
    ).hide();
    await renderGruposModal();
    await renderGruposLeftPanel();
    //new bootstrap.Modal(document.getElementById("modalGrupos")).show();
  } catch (e2) {
    console.error(e2);
    alert(e2.message || "Error al actualizar cuotas.");
  }
});
// --- Gestión de apilamiento entre tu modal custom y los modales Bootstrap ---
(function () {
  const main = document.getElementById("modal-examen"); // tu modal grande custom
  if (!main) return;

  let bsOpenCount = 0;

  function hideMainIfNeeded() {
    if (!main) return;
    // recuerda si estaba visible para luego restaurarlo
    if (!main.dataset.wasVisible && main.classList.contains("mostrar-flex")) {
      main.dataset.wasVisible = "1";
    }
    main.classList.remove("mostrar-flex");
    main.classList.add("oculto");
  }

  function maybeRestoreMain() {
    if (!main) return;
    if (bsOpenCount === 0 && main.dataset.wasVisible === "1") {
      main.classList.remove("oculto");
      main.classList.add("mostrar-flex");
      delete main.dataset.wasVisible;
    }
  }

  // Para cualquier modal de Bootstrap que se abra/cierre
  $(document).on("show.bs.modal", ".modal", function () {
    bsOpenCount++;
    hideMainIfNeeded();
  });

  $(document).on("hidden.bs.modal", ".modal", function () {
    bsOpenCount = Math.max(0, bsOpenCount - 1);
    maybeRestoreMain();
  });
})();
function abrirModalSobre(parentId, childId) {
  const parentEl = document.getElementById(parentId);
  const childEl = document.getElementById(childId);

  const parent = bootstrap.Modal.getOrCreateInstance(parentEl);
  const child = bootstrap.Modal.getOrCreateInstance(childEl);

  // Oculta el padre y, cuando el hijo se cierre, vuelve a mostrarlo
  parent.hide();
  childEl.addEventListener(
    "hidden.bs.modal",
    () => {
      // reabrir solo si el padre sigue montado
      bootstrap.Modal.getOrCreateInstance(parentEl).show();
    },
    { once: true }
  );

  child.show();
}

// ========= GENERAR EXAMEN DESDE GRUPO (robusto) =========
(() => {
  const BASE = "http://localhost:5050";
  let blobUrlActual = null;
  let __bannerEl = null;

  function ensureBanner() {
    if (__bannerEl && document.body.contains(__bannerEl)) return __bannerEl;
    const cont =
      document.querySelector("#zona-avisos") ||
      document.querySelector(".pdf-vista") ||
      document.getElementById("modal-examen") ||
      document.body;
    __bannerEl =
      document.getElementById("banner-estado") || document.createElement("div");
    __bannerEl.id = "banner-estado";
    __bannerEl.className = "alert alert-info mb-3";
    if (!__bannerEl.parentElement) cont.prepend(__bannerEl);
    return __bannerEl;
  }
  function setBanner(msg, kind = "info") {
    const el = ensureBanner();
    el.className = `alert alert-${kind} mb-3`;
    el.innerHTML = msg;
  }

  async function generarExamenGrupo(formato = "word") {
    try {
      const sel = window.grupoSeleccionado;
      if (!sel?.id) {
        setBanner(
          "Selecciona un grupo en la lista de la izquierda.",
          "warning"
        );
        return;
      }

      const endpoint = `http://localhost:5050/api/grupos/${
        sel.id
      }/generar_doc?formato=${encodeURIComponent(formato)}&numerar=1`;
      setBanner(`Generando examen para el grupo <b>${sel.clave}</b>…`, "info");

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
        setBanner(`❌ ${msg}`, "danger");
        mostrarAccionesDescarga(false);
        return;
      }

      // --- Normalizador de rutas absolutas desde el backend ----
      const toAbs = (p) =>
        p ? `http://127.0.0.1:5050${p.startsWith("/") ? "" : "/"}${p}` : null;

      // 1) Guardamos rutas para DESCARGA (tal como vienen del backend)
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

      // 2) Para la VISTA en iframe, FORZAR SIEMPRE PDF inline:
      //    a) si viene ruta_rel_pdf (normalmente "/api/descargas/Nombre con espacios.pdf")
      //       la convertimos a inline quitando "/api" (→ "/descargas/...").
      // 3) Si NO hay PDF, forzarlo ahora con el nuevo endpoint
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

            // usar el PDF inline en el visor
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

      // 4) Mostrar en visor:
      ensureViewer();
      if (previewAbs) {
        cargarIframe(previewAbs); // preview_url del backend (pdf o html)
      } else if (window.__ultimoGenerado.pdfUrl) {
        cargarIframe(
          window.__ultimoGenerado.pdfUrl.replace(
            "http://127.0.0.1:5050/api/",
            "http://127.0.0.1:5050/"
          )
        );
      } else if (docxName) {
        await mostrarVistaDocx(docxName); // último recurso (HTML)
      } else {
        setBanner("No hay vista previa disponible.", "warning");
      }

      // 4) Links de arriba del visor + banner
      ponerLinksVista(docxUrlApi, pdfUrlApi);
      mostrarAccionesDescarga(true);
      setBanner("✅ Tu examen está listo.", "success");
    } catch (e) {
      console.error(e);
      setBanner("❌ Error de red al generar el examen.", "danger");
      mostrarAccionesDescarga(false);
    }
  }

  // ⬇⬇ REGISTRO DE CLICK CON DELEGACIÓN (funciona aunque el botón se cree luego)
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("#btnGenerarDesdeGrupo");
    if (!btn) return;
    // Puedes permitir data-formato="pdf" en el botón si quieres
    const formato = btn.dataset.formato || "word";
    generarExamenGrupo(formato);
  });

  // Limpieza del blob si se cierra la página
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
  b.className = `alert alert-${kind} mb-3`;
  b.innerHTML = msg;
}

async function guardarUltimoDeDescargasDocx() {
  const res = await window.api?.saveLastFromFolder?.({
    sourceDir:
      "D:\\tesis software\\Software-con-IA-Language-Tool-para-Generar-Cuadernillos-Mediante-Banco-de-Preguntas-de-Ex-menes-\\descargas",
    pattern: "\\.(docx)$",
    suggestedName: window.__ultimoGenerado?.docxName || "examen.docx",
  });
  if (!res?.ok && !res?.canceled) alert(res?.message || "No se pudo guardar.");
}
async function guardarUltimoDeDescargasPdf() {
  const res = await window.api?.saveLastFromFolder?.({
    sourceDir:
      "D:\\tesis software\\Software-con-IA-Language-Tool-para-Generar-Cuadernillos-Mediante-Banco-de-Preguntas-de-Ex-menes-\\descargas",
    pattern: "\\.(pdf)$",
    suggestedName: window.__ultimoGenerado?.pdfName || "examen.pdf",
  });
  if (!res?.ok && !res?.canceled) alert(res?.message || "No se pudo guardar.");
}

// Delegación: capturamos clicks aunque el botón se inserte luego
document.addEventListener("click", async (ev) => {
  // ----- GUARDAR DOCX -----
  if (ev.target.closest("#btnGuardarDocx")) {
    try {
      // A) Si vienes del listado (hay id) → exportar por id (IPC)
      if (window.examenSeleccionadoParaExportar) {
        console.log("[GUARDAR DOCX] Plan A: exportarExamenSeleccionado(docx)");
        return exportarExamenSeleccionado("docx");
      }

      // B) Si vienes de Generar (hay URL del backend) → guardar desde URL (IPC)
      const u = window.__ultimoGenerado?.docxUrl;
      const n = window.__ultimoGenerado?.docxName || "examen.docx";
      if (u) {
        console.log("[GUARDAR DOCX] Plan B: guardarDesdeUrl", u, n);
        const r = await window.api?.guardarDesdeUrl?.(u, n);
        if (!r?.ok && !r?.canceled)
          alert(r?.message || "No se pudo guardar DOCX.");
        return;
      }

      // C) Último archivo en /descargas → copiarlo (IPC)
      console.log("[GUARDAR DOCX] Plan C: saveLastFromFolder");
      const res = await window.api?.saveLastFromFolder?.({
        sourceDir:
          "D:\\tesis software\\Software-con-IA-Language-Tool-para-Generar-Cuadernillos-Mediante-Banco-de-Preguntas-de-Ex-menes-\\descargas",
        pattern: "\\.(docx)$",
        suggestedName: n,
      });
      if (!res?.ok && !res?.canceled)
        alert(res?.message || "No se pudo guardar DOCX.");
    } catch (e) {
      console.error(e);
      alert("Error guardando DOCX.");
    }
  }

  // ----- GUARDAR PDF -----
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
          alert(r?.message || "No se pudo guardar PDF.");
        return;
      }

      console.log("[GUARDAR PDF] Plan C: saveLastFromFolder");
      const res = await window.api?.saveLastFromFolder?.({
        sourceDir:
          "D:\\tesis software\\Software-con-IA-Language-Tool-para-Generar-Cuadernillos-Mediante-Banco-de-Preguntas-de-Ex-menes-\\descargas",
        pattern: "\\.(pdf)$",
        suggestedName: n,
      });
      if (!res?.ok && !res?.canceled)
        alert(res?.message || "No se pudo guardar PDF.");
    } catch (e) {
      console.error(e);
      alert("Error guardando PDF.");
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
  const iframe = document.getElementById("frame-examen");
  if (!iframe) return;

  cont?.classList.remove("cargado");

  const url = urlAbsOrel.startsWith("http")
    ? urlAbsOrel
    : `http://127.0.0.1:5050${
        urlAbsOrel.startsWith("/") ? "" : "/"
      }${urlAbsOrel}`;

  console.log("[iframe] src ->", url);
  iframe.onload = () => cont?.classList.add("cargado");
  iframe.removeAttribute("srcdoc"); // <- clave para PDF
  iframe.src = url;
}

function ensureViewer() {
  const host =
    document.getElementById("modal-examen") ||
    document.querySelector(".pdf-vista") ||
    document.body;

  if (
    document.getElementById("visor-examen") &&
    document.getElementById("frame-examen")
  )
    return;

  const box = document.createElement("div");
  box.id = "visor-examen";
  box.className = "visor-examen"; // 👈 clave (puedes añadir otras clases después)
  box.style.minHeight = "620px";
  box.style.height = "620px";
  box.style.marginTop = "12px";
  box.style.background = "#fff";
  box.innerHTML = `
    <div id="linksVista" class="mb-2"></div>
    <div id="accionesDescarga" class="d-none mb-2">
      <button id="btnGuardarDocx" class="btn btn-primary btn-sm me-2">Guardar DOCX…</button>
      <button id="btnGuardarPdf"  class="btn btn-outline-secondary btn-sm">Guardar PDF…</button>
    </div>
    <iframe id="frame-examen" style="width:100%;height:100%;border:0"></iframe>
  `;
  host.appendChild(box);
}

async function mostrarVistaDocx(nombreDocx) {
  ensureViewer();

  const base = "http://127.0.0.1:5050";
  const cont = document.getElementById("visor-examen");
  const frame = document.getElementById("frame-examen");
  const btnAbrir = document.getElementById("btnAbrirPreview");

  const banner = (msg, kind = "success") => {
    const el =
      document.getElementById("banner-estado") ||
      (() => {
        const d = document.createElement("div");
        d.id = "banner-estado";
        d.className = "alert alert-info mb-3";
        (document.getElementById("visor-examen") || document.body).prepend(d);
        return d;
      })();
    el.className = `alert alert-${kind} mb-3`;
    el.innerHTML = msg;
  };

  try {
    // quita estado cargado mientras cambia el contenido
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

    // Link “Abrir en pestaña”
    if (btnAbrir) {
      btnAbrir.classList.remove("d-none");
      btnAbrir.onclick = () => window.open(absUrl, "_blank", "noopener");
    }

    // 1) Intento normal con src
    frame.onload = () => cont?.classList.add("cargado");
    frame.removeAttribute("srcdoc");
    frame.src = absUrl;

    // 2) A los 900 ms, si sigue en blanco, usar srcdoc
    setTimeout(async () => {
      let looksBlank = false;
      try {
        looksBlank =
          !frame.contentWindow ||
          frame.contentWindow.location.href === "about:blank";
      } catch {
        looksBlank = true;
      }

      if (!looksBlank) return; // ya cargó → onload agregó “cargado”

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

        // 👇 IMPORTANTE: marcar como cargado cuando usamos srcdoc
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

// Muestra/oculta el bloque de acciones
function mostrarAccionesDescarga(show) {
  const box = document.getElementById("accionesDescarga");
  if (!box) return;
  box.classList.toggle("d-none", !show);
}

// Guardar DOCX…

function ponerLinksVista(docxUrl, pdfUrl) {
  const box = document.getElementById("linksVista");
  if (!box) return;
  let html = "";
  if (docxUrl)
    html += `📄 <a href="${docxUrl}" target="_blank" rel="noopener">Ver DOCX</a> `;
  if (pdfUrl)
    html += ` | 🖨️ <a href="${pdfUrl}" target="_blank" rel="noopener">Ver PDF</a>`;
  box.innerHTML = html;
}

// ======================= BANCO DE PREGUNTAS =======================
// ======================= BANCO DE PREGUNTAS =======================
(function () {
  if (typeof window.BANCO_API_BASE === "undefined") {
    window.BANCO_API_BASE = "http://localhost:5050/api/banco_preguntas";
  }

  // DataTables y estado
  let dtBancoResumen = null;
  let dtBancoDetalle = null;
  let bancoDataCache = [];        // todos los registros del banco
  let temaSeleccionadoBanco = null;
  let temasCacheBanco = null;     // todos los temas (para resumen y selects)
  let temaPreseleccionadoImport = null; // para el modal Importar

  // ------------- Helpers de fetch -------------
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

  // ------------- Construir resumen por tema -------------
  async function construirResumenPorTema() {
    // contador a partir del banco
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

    // combinar con TODOS los temas existentes
    const temas = await fetchTemasAllBanco();
    const resumen = temas.map((t) => {
      const base = mapCont.get(t.id) || {
        id_tema: t.id,
        tema: t.nombre,
        n_preguntas: 0,
        n_solucionarios: 0,
      };
      // aseguramos nombre correcto del tema desde /temas
      base.tema = t.nombre;
      return base;
    });

    return resumen;
  }

  // ------------- DataTable RESUMEN -------------
  async function cargarBancoResumen() {
    await cargarBancoDesdeApi();
    const resumen = await construirResumenPorTema();

    if (!$.fn.DataTable.isDataTable("#tabla-banco-resumen")) {
      dtBancoResumen = $("#tabla-banco-resumen").DataTable({
        data: resumen,
        autoWidth: false,
        responsive: true,
        pageLength: 8,
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
            render: (row) =>
              `<button class="btn btn-info btn-sm btn-banco-detalles"
                        data-tema="${row.id_tema}"
                        data-nombre="${row.tema}">
                  Detalles
               </button>`,
          },
        ],
        language: window.DT_ES || {},
      });

      // Click en Detalles
      $("#tabla-banco-resumen").on(
        "click",
        ".btn-banco-detalles",
        function () {
          const idTema = this.dataset.tema;
          const nombre = this.dataset.nombre;
          verDetalleTemaBanco(idTema, nombre);
        }
      );
    } else {
      dtBancoResumen.clear().rows.add(resumen).draw(false);
    }
  }

  // Helper para renderizar las acciones (se usa en detalle)
  function renderAccionesBanco(row) {
    const id = row.id;
    const hasPreg = !!row.doc_preguntas_nombre;
    const hasSol = !!row.doc_sol_nombre;

    const disabledDesc = hasPreg ? "" : "disabled";
    const solClass = hasSol ? "btn-info" : "btn-outline-info";
    const solText = hasSol ? "Cambiar sol." : "Agregar sol.";

    return `
      <div class="btn-group btn-group-sm" role="group">
        <button class="btn btn-success"
                onclick="window.bancoDescPaquete(${id})"
                ${disabledDesc}>
          Descargar
        </button>
        <button class="btn ${solClass}"
                onclick="window.bancoAbrirSolucionario(${id})"
                ${disabledDesc}>
          ${solText}
        </button>
        <button class="btn btn-primary"
                onclick="window.bancoAbrirEditar(${id})">
          Editar
        </button>
        <button class="btn btn-danger"
                onclick="window.bancoEliminar(${id})">
          Eliminar
        </button>
      </div>`;
  }

  // ------------- DataTable DETALLE POR TEMA -------------
  function cargarBancoDetalle() {
    if (!temaSeleccionadoBanco) return;

    const datos = bancoDataCache.filter((r) => {
      const tid = r.tema_id ?? r.temaId ?? r.id_tema;
      return String(tid) === String(temaSeleccionadoBanco);
    });

    if (!$.fn.DataTable.isDataTable("#tabla-banco-detalle")) {
      dtBancoDetalle = $("#tabla-banco-detalle").DataTable({
        data: datos,
        autoWidth: false,
        responsive: true,
        pageLength: 8,
        columns: [
          {
            data: "doc_preguntas_nombre",
            title: "DOCX Preguntas",
            render: (d) =>
              d
                ? `<span class="badge bg-secondary">${d}</span>`
                : '<span class="text-muted">No asignado</span>',
          },
          {
            data: "doc_sol_nombre",
            title: "Solucionario",
            render: (d) =>
              d
                ? `<span class="badge bg-info">${d}</span>`
                : '<span class="text-muted">Sin solucionario</span>',
          },
          {
            data: null,
            title: "Acciones",
            orderable: false,
            render: (row) => renderAccionesBanco(row),
          },
        ],
        language: window.DT_ES || {},
      });
    } else {
      dtBancoDetalle.clear().rows.add(datos).draw(false);
    }
  }

  // ------------- Cambiar entre vistas -------------
  function verDetalleTemaBanco(idTema, nombreTema) {
    temaSeleccionadoBanco = idTema;

    document
      .getElementById("vista-banco-resumen")
      .classList.add("d-none");
    document
      .getElementById("vista-banco-detalle")
      .classList.remove("d-none");

    const lbl = document.getElementById("bancoTituloTemaDetalle");
    if (lbl) lbl.textContent = nombreTema || "";

    cargarBancoDetalle();
  }

  async function volverABancoResumen() {
    temaSeleccionadoBanco = null;
    document
      .getElementById("vista-banco-detalle")
      .classList.add("d-none");
    document
      .getElementById("vista-banco-resumen")
      .classList.remove("d-none");
    await cargarBancoResumen();
  }

  async function recargarBancoDespuesDeCambio() {
    await cargarBancoResumen();
    if (temaSeleccionadoBanco) {
      cargarBancoDetalle();
    }
  }

  // ------------- Cargar temas en selects (usando cache) -------------
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
        selImp.disabled = true; // <- bloquea el cambio cuando vienes del detalle
      } else {
        selImp.disabled = false;
      }
    }
    if (selEdit && !selEdit.dataset.fixed) {
      selEdit.innerHTML = opts;
    }
  }

  // ------------- Abrir modal principal -------------
  async function abrirModalBancoPreguntas() {
    try {
      temaSeleccionadoBanco = null;
      const vRes = document.getElementById("vista-banco-resumen");
      const vDet = document.getElementById("vista-banco-detalle");
      if (vRes && vDet) {
        vRes.classList.remove("d-none");
        vDet.classList.add("d-none");
      }

      await cargarBancoResumen();
      await cargarTemasParaBanco();

      new bootstrap.Modal(
        document.getElementById("modalBancoPreguntas")
      ).show();
    } catch (e) {
      console.error(e);
      alert("No se pudo cargar el banco de preguntas.");
    }
  }

  // ------------- Delegación de botones globales -------------
  document.addEventListener("click", async (ev) => {
    // Abrir modal Banco de preguntas
    if (ev.target.closest("#btnBancoPreguntas")) {
      ev.preventDefault();
      temaPreseleccionadoImport = null; // modo normal
      await abrirModalBancoPreguntas();
      return;
    }

    // Volver del detalle al resumen
    if (ev.target.closest("#btnBancoVolverResumen")) {
      ev.preventDefault();
      await volverABancoResumen();
      return;
    }

    // Abrir modal Importar (desde resumen)
    if (ev.target.closest("#btnBancoImportar")) {
      ev.preventDefault();
      temaPreseleccionadoImport = null; // no fijar tema, usuario elige
      await cargarTemasParaBanco();
      new bootstrap.Modal(
        document.getElementById("modalBancoImportar")
      ).show();
      return;
    }

    // Abrir modal Importar (desde detalle → fijar tema)
    if (ev.target.closest("#btnBancoImportarDetalle")) {
      ev.preventDefault();
      temaPreseleccionadoImport = temaSeleccionadoBanco; // fijamos tema actual
      await cargarTemasParaBanco();
      new bootstrap.Modal(
        document.getElementById("modalBancoImportar")
      ).show();
      return;
    }

    // Guardar importación (tema + DOCX preguntas)
    if (ev.target.closest("#btnBancoImportarGuardar")) {
      ev.preventDefault();
      await importarTemaBanco();
      return;
    }

    // Guardar edición (tema y posibles reemplazos de archivos)
    if (ev.target.closest("#btnBancoEditarGuardar")) {
      ev.preventDefault();
      await guardarEdicionBanco();
      return;
    }
  });

  // ---- Importar tema (docx preguntas) ----
  async function importarTemaBanco() {
    const temaId = document.getElementById("bancoTemaImportar").value;
    const file = document.getElementById("bancoFilePreguntas").files[0];
    if (!temaId || !file) {
      alert("Selecciona un tema y un archivo DOCX.");
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
      alert(j.error || "Error al importar tema.");
      return;
    }

    bootstrap.Modal.getInstance(
      document.getElementById("modalBancoImportar")
    ).hide();
    document.getElementById("bancoFilePreguntas").value = "";
    await recargarBancoDespuesDeCambio();
  }

  // ---- Acciones globales (se usan en las filas de detalle) ----
  window.bancoDescPaquete = function (id) {
    const url = `${window.BANCO_API_BASE}/${id}/download`;
    window.open(url, "_blank");
  };

  window.bancoEliminar = async function (id) {
    if (!confirm("¿Eliminar este registro del banco?")) return;
    const r = await fetch(`${window.BANCO_API_BASE}/${id}`, {
      method: "DELETE",
    });
    const j = await r.json();
    if (!r.ok) {
      alert(j.error || "No se pudo eliminar.");
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

    new bootstrap.Modal(
      document.getElementById("modalBancoEditar")
    ).show();
  };

  // 👉 Cambiar / agregar solucionario SOLO para ese item (sin abrir modal)
  window.bancoAbrirSolucionario = function (id) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return; // usuario canceló

      const fd = new FormData();
      fd.append("doc_solucionario", file);

      try {
        const r = await fetch(
          `${window.BANCO_API_BASE}/${id}/reemplazar/solucionario`,
          { method: "POST", body: fd }
        );
        const j = await r.json();
        if (!r.ok) {
          alert(j.error || "No se pudo guardar el solucionario.");
          return;
        }

        alert("✅ Solucionario guardado correctamente.");
        await recargarBancoDespuesDeCambio();
      } catch (err) {
        console.error(err);
        alert("❌ Error de red al guardar el solucionario.");
      }
    };

    input.click();
  };

  // ---- Guardar edición (tema + posibles reemplazos) ----
  async function guardarEdicionBanco() {
    const id = document.getElementById("bancoEditId").value;
    const temaId = document.getElementById("bancoTemaEditar").value;
    const filePreg = document.getElementById("bancoEditFilePreg").files[0];
    const fileSol = document.getElementById("bancoEditFileSol").files[0];

    // 1) actualizar tema
    if (temaId) {
      const r = await fetch(`${window.BANCO_API_BASE}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema_id: Number(temaId) }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j.error || "No se pudo actualizar el tema.");
        return;
      }
    }

    // 2) reemplazar DOCX de preguntas
    if (filePreg) {
      const fd = new FormData();
      fd.append("doc_preguntas", filePreg);
      const r = await fetch(
        `${window.BANCO_API_BASE}/${id}/reemplazar/preguntas`,
        { method: "POST", body: fd }
      );
      const j = await r.json();
      if (!r.ok) {
        alert(j.error || "No se pudo reemplazar DOCX de preguntas.");
        return;
      }
    }

    // 3) reemplazar solucionario
    if (fileSol) {
      const fd = new FormData();
      fd.append("doc_solucionario", fileSol);
      const r = await fetch(
        `${window.BANCO_API_BASE}/${id}/reemplazar/solucionario`,
        { method: "POST", body: fd }
      );
      const j = await r.json();
      if (!r.ok) {
        alert(j.error || "No se pudo reemplazar solucionario.");
        return;
      }
    }

    bootstrap.Modal.getInstance(
      document.getElementById("modalBancoEditar")
    ).hide();
    await recargarBancoDespuesDeCambio();
  }
})();

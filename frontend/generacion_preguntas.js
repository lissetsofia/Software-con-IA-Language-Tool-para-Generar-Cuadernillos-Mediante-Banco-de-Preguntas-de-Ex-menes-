// Estado global del último archivo generado (docx/pdf)
// --- SIEMPRE al comienzo del archivo ---
window.__ultimoGenerado = { docxUrl: null, pdfUrl: null, docxName: null, pdfName: null };


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
  <button class="btn btn-sm btn-primary btn-buscar" data-id="${row.idexamenes}">PREGUNTAS</button>
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
// Ejecutar carga directamente cuando se inyecta esta página
setTimeout(() => {
  console.log("⏳ Esperando carga del DOM y tabla...");
  cargarExamenes();
}, 300); // o más si es necesario

// Habilita botón si el usuario selecciona otro archivo
window.addEventListener("DOMContentLoaded", () => {
  const archivo = document.getElementById("archivo");
  const btnImportar = document.getElementById("btnImportar");

  if (archivo && btnImportar) {
    archivo.addEventListener("change", () => {
      btnImportar.disabled = false;
    });
  }
});
/* =======================
   TEMAS (CRUD en modal) — INICIALIZAR CUANDO EL MODAL ESTÁ VISIBLE
   ======================= */
(() => {
  if (window.__TEMAS_WIRED__) return;
  window.__TEMAS_WIRED__ = true;

  const TEMAS_API_BASE = "http://localhost:5050/api/temas";

  let dtTemas = null;

  // Mostrar errores de DataTables en consola
  $.fn.dataTable.ext.errMode = "console";

  const urlTemas = (all) => `${TEMAS_API_BASE}${all ? "?all=1" : ""}`;

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
        if (!confirm("¿Cambiar el estado de este curso?")) return;
        try {
          const r = await fetch(`${TEMAS_API_BASE}/${id}/toggle`, {
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
      const r = await fetch(TEMAS_API_BASE, {
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
      const r = await fetch(`${TEMAS_API_BASE}/${id}`, {
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

const DT_ES = {
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

let examenActual = null;
let dtBuscarTemas = null;
let dtBuscarPregs = null;

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
  const url = `http://localhost:5050/api/examenes/${encodeURIComponent(id)}/temas`;
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
            `<button class="btn btn-outline-primary btn-ver-tema" 
                      data-tema="${row.id}" 
                      data-nombre="${row.nombre}">Ver</button>`,
        },
      ],
      language: DT_ES,
    });
  } else {
    dtBuscarTemas.clear().rows.add(temas).draw(false);
  }
}


let dtPregsTema = null;

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
const GRUPOS_API_BASE = "http://localhost:5050/api/grupos";
const TEMAS_API_BASE  = "http://localhost:5050/api/temas";

let dtGrupos = null;
window.grupoSeleccionado = null;  // { id, clave }

// --- cache de temas activos ---
let __temasCache = null;
async function cargarTemasActivos() {
  if (__temasCache) return __temasCache;
  const r = await fetch(TEMAS_API_BASE);
  const arr = await r.json();
  __temasCache = (arr || []).filter(t => t.activo);
  return __temasCache;
}

// --- helpers cuotas (fila + total) ---
function leerCuotasDe(containerSel){
  const filas = [...document.querySelectorAll(`${containerSel} .cuota-row`)];
  const cuotas = [];
  const seen = new Set();
  for (const row of filas) {
    const temaId = row.querySelector(".sel-tema")?.value;
    const cant   = row.querySelector(".inp-cant")?.value;
    if (!temaId || !cant) continue;
    if (seen.has(temaId)) throw new Error("No repitas el mismo tema.");
    seen.add(temaId);
    cuotas.push({ tema_id: Number(temaId), cantidad: Number(cant) });
  }
  return cuotas;
}

function filaCuotaHTML(temas, temaSel = "", cant = "") {
  const opts = temas.map(t =>
    `<option value="${t.id}" ${String(t.id)===String(temaSel)?"selected":""}>${t.nombre}</option>`
  ).join("");
  return `
    <div class="row g-2 align-items-center cuota-row mb-2">
      <div class="col-8">
        <select class="form-select sel-tema" required>
          <option value="" disabled ${temaSel?"":"selected"}>Selecciona tema…</option>
          ${opts}
        </select>
      </div>
      <div class="col-3">
        <input type="number" min="1" class="form-control inp-cant" placeholder="Cant." required value="${cant}">
      </div>
      <div class="col-1 text-end">
        <button type="button" class="btn btn-sm btn-outline-danger btnQuitarCuota">✕</button>
      </div>
    </div>`;
}
function totalFrom(containerSel, totalSel){
  const n = [...document.querySelectorAll(`${containerSel} .inp-cant`)]
    .map(i => parseInt(i.value,10)||0).reduce((a,b)=>a+b,0);
  document.querySelector(totalSel).textContent = n;
}

// --- API helpers ---
async function fetchGrupos(includeInactive) {
  const url = includeInactive ? `${GRUPOS_API_BASE}?all=1` : GRUPOS_API_BASE;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Grupos HTTP ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}
async function fetchCuotasGrupo(idgrupo) {
  const r = await fetch(`${GRUPOS_API_BASE}/${idgrupo}/cuotas`);
  if (!r.ok) return [];
  return r.json();
}
// guardar cuotas por ID de grupo (sin examenes)
async function saveCuotasGrupoById(idgrupo, cuotas) {
  const r = await fetch(`${GRUPOS_API_BASE}/${idgrupo}/cuotas`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cuotas })
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

    grupos.forEach(g => {
      const li = document.createElement("li");
      li.className = "d-flex align-items-center justify-content-between mb-2";

      const left = document.createElement("div");
      left.className = "d-flex align-items-center gap-2";
      left.innerHTML = `
        <span class="badge bg-dark px-2">${g.clave}</span>
        <span class="text-muted small">${g.nombre || ""}</span>
        <span class="badge bg-info">${g.total_preguntas ?? 0}</span>
      `;

      const right = document.createElement("div");
      right.className = "d-flex align-items-center gap-1";

      const btnCfg = document.createElement("button");
      btnCfg.className = "btn btn-sm btn-outline-secondary";
      btnCfg.title = "Configurar cuotas por tema";
      btnCfg.textContent = "📄";
      btnCfg.onclick = () => abrirModalEditarGrupo(g);

      const btnDel = document.createElement("button");
      btnDel.className = "btn btn-sm btn-outline-danger";
      btnDel.title = "Eliminar";
      btnDel.textContent = "❌";
      btnDel.onclick = async () => {
        if (!confirm("¿Eliminar este grupo?")) return;
        const r = await fetch(`${GRUPOS_API_BASE}/${g.idgrupo}`, { method: "DELETE" });
        const d = await r.json();
        if (!r.ok) return alert(d.error || "No se pudo eliminar");
        if (grupoSeleccionado?.id === g.idgrupo) grupoSeleccionado = null;
        await renderGruposLeftPanel();
        if ($.fn.DataTable.isDataTable("#tabla-grupos")) await renderGruposModal();
      };

      right.appendChild(btnCfg);
      right.appendChild(btnDel);

      li.appendChild(left);
      li.appendChild(right);

      li.style.cursor = "pointer";
          
      li.onclick = (ev) => {
        if (ev.target === btnCfg || ev.target === btnDel) return;
        [...ul.children].forEach(n => n.classList.remove("selected"));
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
const _origGenerarNuevoExamen = window.generarNuevoExamen;
window.generarNuevoExamen = function () {
  renderGruposLeftPanel();
  if (typeof _origGenerarNuevoExamen === "function") _origGenerarNuevoExamen();
};

// -------- DataTable del modal (CRUD) --------
async function renderGruposModal() {
  const showInactivos = document.getElementById("chkVerInactivosGrupos")?.checked;
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
        { data: "clave",  title: "Clave" },
        { data: "nombre", title: "Nombre" },
        { data: "total_preguntas", title: "Preguntas" },
        {
          data: "activo",
          render: v => v ? '<span class="badge bg-success">Activo</span>'
                         : '<span class="badge bg-secondary">Inactivo</span>'
        },
        {
          data: null,
          orderable: false,
          render: row => {
            const toggleTxt = row.activo ? "Deshabilitar" : "Habilitar";
            const toggleClass = row.activo ? "btn-warning" : "btn-success";
            return `
              <div class="btn-group btn-group-sm" role="group">
                <button class="btn btn-primary btn-editar-grupo"
                        data-id="${row.idgrupo}" data-clave="${row.clave}"
                        data-nombre="${row.nombre || ""}">
                  Editar
                </button>
                <button class="btn ${toggleClass} btn-toggle-grupo" data-id="${row.idgrupo}">
                  ${toggleTxt}
                </button>
                <button class="btn btn-danger btn-eliminar-grupo" data-id="${row.idgrupo}">
                  Eliminar
                </button>
              </div>`;
          }
        }
      ],
      language: DT_ES
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
        const r = await fetch(`${GRUPOS_API_BASE}/${id}/toggle`, { method: "PATCH" });
        const d = await r.json();
        if (!r.ok) return alert(d.error || "No se pudo cambiar el estado.");
        await renderGruposModal();
        await renderGruposLeftPanel();
      } catch (e) { console.error(e); alert("Error de red."); }
    });

    $("#tabla-grupos").on("click", ".btn-eliminar-grupo", async function () {
      const id = this.dataset.id;
      if (!confirm("¿Eliminar este grupo?")) return;
      try {
        const r = await fetch(`${GRUPOS_API_BASE}/${id}`, { method: "DELETE" });
        const d = await r.json();
        if (!r.ok) return alert(d.error || "No se pudo eliminar");
        await renderGruposModal();
        await renderGruposLeftPanel();
      } catch (e) { console.error(e); alert("Error de red."); }
    });

  } else {
    dtGrupos.clear().rows.add(data).draw(false);
  }

  setTimeout(() => {
    try { $("#tabla-grupos").DataTable().columns.adjust().responsive.recalc(); } catch {}
  }, 0);
}

// abrir modal → cargar tabla
$(document).on("shown.bs.modal", "#modalGrupos", async function () {
  try { await renderGruposModal(); } catch (e) { console.error(e); alert("No se pudo cargar grupos."); }
});

// filtro “mostrar inactivos”
$(document).on("change", "#chkVerInactivosGrupos", async function () {
  try { await renderGruposModal(); } catch (e) { console.error(e); }
});

// ========== CREAR GRUPO ==========
$(document).on("show.bs.modal", "#modalGrupoCrear", async function () {
  const temas = await cargarTemasActivos();
  const cont  = document.getElementById("cuotasContainer");
  cont.innerHTML = filaCuotaHTML(temas);
  totalFrom("#cuotasContainer","#totalCuotas");

  document.getElementById("btnAgregarCuota").onclick = () => {
    cont.insertAdjacentHTML("beforeend", filaCuotaHTML(temas));
  };
  cont.addEventListener("click", e => {
    if (e.target.classList.contains("btnQuitarCuota")) {
      e.target.closest(".cuota-row")?.remove();
      totalFrom("#cuotasContainer","#totalCuotas");
    }
  });
  cont.addEventListener("input", e => {
    if (e.target.classList.contains("inp-cant")) totalFrom("#cuotasContainer","#totalCuotas");
  });
});

$(document).on("submit", "#formGrupoCrear", async function (e) {
  e.preventDefault();

  const clave  = $("#grupoClaveCrear").val().trim();
  const nombre = $("#grupoNombreCrear").val().trim();

  // Armar cuotas
  const cuotas = [];
  const seen = new Set();
  for (const row of document.querySelectorAll("#cuotasContainer .cuota-row")) {
    const temaId = row.querySelector(".sel-tema").value;
    const cant   = row.querySelector(".inp-cant").value;
    if (!temaId || !cant) continue;
    if (seen.has(temaId)) { alert("No repitas el mismo tema."); return; }
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
    const r = await fetch(GRUPOS_API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave, nombre })
    });
    const j = await r.json().catch(()=> ({}));
    if (r.ok) idgrupo = j.idgrupo ?? j.id;         // según lo que devuelva tu API
    else if (r.status !== 409) return alert(j.error || "No se pudo crear el grupo.");
  } catch (e) {
    console.error(e); return alert("Error de red al crear el grupo.");
  }

  // si no vino el id, búscalo por clave
  if (!idgrupo) {
    const todos = await fetchGrupos(true);
    idgrupo = (todos.find(g => g.clave === clave) || {}).idgrupo;
    if (!idgrupo) return alert("No se pudo obtener el id del grupo.");
  }

  // 2) guardar cuotas
  try {
    await saveCuotasGrupoById(idgrupo, cuotas);
    bootstrap.Modal.getInstance(document.getElementById("modalGrupoCrear")).hide();
    await renderGruposModal();
    await renderGruposLeftPanel();
    new bootstrap.Modal(document.getElementById("modalGrupos")).show();
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
  const cont  = document.getElementById("cuotasContainerEdit");
  cont.innerHTML = "";

  // cuotas actuales
  const cuotas = await fetchCuotasGrupo(g.idgrupo);
  if (Array.isArray(cuotas) && cuotas.length) {
    cuotas.forEach(q => cont.insertAdjacentHTML("beforeend", filaCuotaHTML(temas, q.tema_id, q.cantidad)));
  } else {
    cont.insertAdjacentHTML("beforeend", filaCuotaHTML(temas));
  }

  totalFrom("#cuotasContainerEdit", "#totalCuotasEdit");

  document.getElementById("btnAgregarCuotaEdit").onclick = () => {
    cont.insertAdjacentHTML("beforeend", filaCuotaHTML(temas));
  };
  cont.addEventListener("click", e => {
    if (e.target.classList.contains("btnQuitarCuota")) {
      e.target.closest(".cuota-row")?.remove();
      totalFrom("#cuotasContainerEdit", "#totalCuotasEdit");
    }
  });
  cont.addEventListener("input", e => {
    if (e.target.classList.contains("inp-cant")) totalFrom("#cuotasContainerEdit", "#totalCuotasEdit");
  });
- new bootstrap.Modal(document.getElementById("modalGrupoEditar")).show();
+ abrirModalSobre("modalGrupos", "modalGrupoEditar");
}

$(document).off("submit", "#formGrupoEditar");
$(document).on("submit", "#formGrupoEditar", async function (e) {
  e.preventDefault();

  const idgrupo    = $("#grupoIdEditar").val();
  const nuevaClave = $("#grupoClaveEditar").val().trim();
  const nombre     = $("#grupoNombreEditar").val().trim();

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
    const r1 = await fetch(`${GRUPOS_API_BASE}/${idgrupo}`, {
      method:"PUT",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ clave: nuevaClave, nombre })
    });
    const j1 = await r1.json();
    if (!r1.ok) throw new Error(j1.error || "No se pudo actualizar el grupo.");

    // 2) reemplazar cuotas
    await saveCuotasGrupoById(idgrupo, cuotas);

    bootstrap.Modal.getInstance(document.getElementById("modalGrupoEditar")).hide();
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
  const main = document.getElementById('modal-examen'); // tu modal grande custom
  if (!main) return;

  let bsOpenCount = 0;

  function hideMainIfNeeded() {
    if (!main) return;
    // recuerda si estaba visible para luego restaurarlo
    if (!main.dataset.wasVisible && main.classList.contains('mostrar-flex')) {
      main.dataset.wasVisible = '1';
    }
    main.classList.remove('mostrar-flex');
    main.classList.add('oculto');
  }

  function maybeRestoreMain() {
    if (!main) return;
    if (bsOpenCount === 0 && main.dataset.wasVisible === '1') {
      main.classList.remove('oculto');
      main.classList.add('mostrar-flex');
      delete main.dataset.wasVisible;
    }
  }

  // Para cualquier modal de Bootstrap que se abra/cierre
  $(document).on('show.bs.modal', '.modal', function () {
    bsOpenCount++;
    hideMainIfNeeded();
  });

  $(document).on('hidden.bs.modal', '.modal', function () {
    bsOpenCount = Math.max(0, bsOpenCount - 1);
    maybeRestoreMain();
  });
})();
function abrirModalSobre(parentId, childId) {
  const parentEl = document.getElementById(parentId);
  const childEl  = document.getElementById(childId);

  const parent = bootstrap.Modal.getOrCreateInstance(parentEl);
  const child  = bootstrap.Modal.getOrCreateInstance(childEl);

  // Oculta el padre y, cuando el hijo se cierre, vuelve a mostrarlo
  parent.hide();
  childEl.addEventListener("hidden.bs.modal", () => {
    // reabrir solo si el padre sigue montado
    bootstrap.Modal.getOrCreateInstance(parentEl).show();
  }, { once: true });

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
    __bannerEl = document.getElementById("banner-estado") || document.createElement("div");
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

 /* async function generarExamenGrupo(formato = "word") {
  try {
    const sel = window.grupoSeleccionado;
    if (!sel?.id) {
      setBanner("Selecciona un grupo en la lista de la izquierda.", "warning");
      return;
    }

    const url = `http://localhost:5050/api/grupos/${sel.id}/generar_doc?formato=${encodeURIComponent(formato)}`;
    setBanner(`Generando examen para el grupo <b>${sel.clave}</b>…`, "info");

    const res = await fetch(url, { method: "POST" });
    const ct = res.headers.get("Content-Type") || "";

    if (!res.ok) {
      // Manejo de errores como ya tenías
      if (ct.includes("application/json")) {
        const j = await res.json().catch(() => ({}));
        if (res.status === 409 && Array.isArray(j.faltantes)) {
          const li = j.faltantes.map(f =>
            `<li><b>${f.tema}</b>: requiere ${f.requeridas}, disponibles ${f.disponibles}</li>`
          ).join("");
          setBanner(`❌ No hay preguntas suficientes:<ul class="mt-2 mb-0">${li}</ul>`, "danger");
          return;
        }
        if (res.status === 422 && Array.isArray(j.archivos_defectuosos)) {
          const li = j.archivos_defectuosos
            .map(x => `<li><code>${(x.path||"").replace(/\\/g,"/")}</code> — ${x.motivo||"archivo inválido"}</li>`)
            .join("");
          setBanner(`❌ Hay preguntas con DOCX defectuosos:<ul class="mt-2 mb-0">${li}</ul>`, "danger");
          return;
        }
        setBanner(`❌ ${j.error || "No se pudo generar el examen."}`, "danger");
      } else {
        setBanner(`❌ Error ${res.status} al generar el examen.`, "danger");
      }
      return;
    }

    // ⬇️ AQUÍ EL CAMBIO: tratar respuesta como JSON, no blob
    const data = await res.json();

    const linkDocx = data?.ruta_rel ? `http://localhost:5050/${data.ruta_rel}` : null;
    const linkPdf  = data?.ruta_rel_pdf ? `http://localhost:5050/${data.ruta_rel_pdf}` : null;

    if (!linkDocx && !linkPdf) {
      setBanner("⚠️ Se generó pero no recibí rutas de descarga.", "warning");
      return;
    }

    let msg = `✅ Tu examen está listo. `;
    if (linkDocx) msg += `📄 <a href="${linkDocx}" target="_blank" rel="noopener">Descargar DOCX</a> `;
    if (linkPdf)  msg += ` | 🖨️ <a href="${linkPdf}" target="_blank" rel="noopener">Descargar PDF</a>`;
    setBanner(msg, "success");

  } catch (e) {
    console.error(e);
    setBanner("❌ Error de red al generar el examen.", "danger");
  }
}*/

async function generarExamenGrupo(formato = "word") {
  try {
    const sel = window.grupoSeleccionado;
    if (!sel?.id) {
      setBanner("Selecciona un grupo en la lista de la izquierda.", "warning");
      return;
    }

    const endpoint = `http://localhost:5050/api/grupos/${sel.id}/generar_doc?formato=${encodeURIComponent(formato)}&numerar=1`;
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

    // Normaliza rutas (por si el backend devuelve sin '/')
    const toAbs = (p) => p ? `http://127.0.0.1:5050${p.startsWith("/") ? "" : "/"}${p}` : null;

    const docxUrl = toAbs(data.ruta_rel);
    // ojo: a veces tu backend devuelve ruta_rel_pdf SIN “/” inicial
    const pdfUrl  = toAbs(data.ruta_rel_pdf);

    window.__ultimoGenerado.docxUrl  = docxUrl;
    window.__ultimoGenerado.pdfUrl   = pdfUrl;
    window.__ultimoGenerado.docxName = data.archivo_docx || "examen.docx";
    window.__ultimoGenerado.pdfName  = data.archivo_pdf  || "examen.pdf";

    let msg = `✅ Tu examen está listo. `;
    if (docxUrl) msg += `📄 <a href="${docxUrl}" target="_blank" rel="noopener">Ver DOCX</a> `;
    if (pdfUrl)  msg += `| 🖨️ <a href="${pdfUrl}" target="_blank" rel="noopener">Ver PDF</a>`;
    setBanner(msg, "success");
    ponerLinksVista(docxUrl, pdfUrl);
    mostrarAccionesDescarga(true);

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

function showBanner(msg, kind="info") {
  const b = document.getElementById("banner-estado") || (() => {
    const el = document.createElement("div");
    el.id = "banner-estado";
    (document.querySelector(".pdf-vista") || document.body).prepend(el);
    return el;
  })();
  b.className = `alert alert-${kind} mb-3`;
  b.innerHTML = msg;
}



// Guarda con preload si existe (IPC), o cae a descarga del navegador
/*document.getElementById("btnGuardarDocx")?.addEventListener("click", async () => {
  // 1) Si venías del listado (tienes id) usa exportarExamen
  if (window.examenSeleccionadoParaExportar) {
    return exportarExamenSeleccionado("docx");
  }
  // 2) Si venías de "Generar" (no hay id), guarda por URL
  const u = window.__ultimoGenerado?.docxUrl;
  const n = window.__ultimoGenerado?.docxName || "examen.docx";
  if (!u) return alert("No hay DOCX generado.");
  const res = await window.api?.guardarDesdeUrl?.(u, n);
  if (!res?.ok && !res?.canceled) alert("No se pudo guardar DOCX: " + (res?.message || "Error"));
});*/

// Botón GUARDAR DOCX… (usar ID -> URL -> último de /descargas)

async function guardarUltimoDeDescargasDocx() {
  const res = await window.api?.saveLastFromFolder?.({
    sourceDir: "D:\\tesis software\\Software-con-IA-Language-Tool-para-Generar-Cuadernillos-Mediante-Banco-de-Preguntas-de-Ex-menes-\\descargas",
    pattern: "\\.(docx)$",
    suggestedName: window.__ultimoGenerado?.docxName || "examen.docx",
  });
  if (!res?.ok && !res?.canceled) alert(res?.message || "No se pudo guardar.");
}
async function guardarUltimoDeDescargasPdf() {
  const res = await window.api?.saveLastFromFolder?.({
    sourceDir: "D:\\tesis software\\Software-con-IA-Language-Tool-para-Generar-Cuadernillos-Mediante-Banco-de-Preguntas-de-Ex-menes-\\descargas",
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
        if (!r?.ok && !r?.canceled) alert(r?.message || "No se pudo guardar DOCX.");
        return;
      }

      // C) Último archivo en /descargas → copiarlo (IPC)
      console.log("[GUARDAR DOCX] Plan C: saveLastFromFolder");
      const res = await window.api?.saveLastFromFolder?.({
        sourceDir: "D:\\tesis software\\Software-con-IA-Language-Tool-para-Generar-Cuadernillos-Mediante-Banco-de-Preguntas-de-Ex-menes-\\descargas",
        pattern: "\\.(docx)$",
        suggestedName: n
      });
      if (!res?.ok && !res?.canceled) alert(res?.message || "No se pudo guardar DOCX.");
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
        if (!r?.ok && !r?.canceled) alert(r?.message || "No se pudo guardar PDF.");
        return;
      }

      console.log("[GUARDAR PDF] Plan C: saveLastFromFolder");
      const res = await window.api?.saveLastFromFolder?.({
        sourceDir: "D:\\tesis software\\Software-con-IA-Language-Tool-para-Generar-Cuadernillos-Mediante-Banco-de-Preguntas-de-Ex-menes-\\descargas",
        pattern: "\\.(pdf)$",
        suggestedName: n
      });
      if (!res?.ok && !res?.canceled) alert(res?.message || "No se pudo guardar PDF.");
    } catch (e) {
      console.error(e);
      alert("Error guardando PDF.");
    }
  }
});

















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
  if (docxUrl) html += `📄 <a href="${docxUrl}" target="_blank" rel="noopener">Ver DOCX</a> `;
  if (pdfUrl)  html += `| 🖨️ <a href="${pdfUrl}" target="_blank" rel="noopener">Ver PDF</a>`;
  box.innerHTML = html;
}


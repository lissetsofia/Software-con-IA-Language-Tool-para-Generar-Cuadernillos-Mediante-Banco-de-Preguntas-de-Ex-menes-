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
  <button class="btn btn-sm btn-primary">Buscar</button>
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

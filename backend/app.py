from flask import Flask, request, jsonify, send_file
from db import get_connection
import os, tempfile, time
import win32com.client as win32
import pythoncom
import re
from werkzeug.utils import secure_filename
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from docx import Document
from docx2pdf import convert
from io import BytesIO




app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['DESCARGAS_FOLDER'] = 'descargas'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['DESCARGAS_FOLDER'], exist_ok=True)
@app.route("/login", methods=["POST"])
def login():
    data = request.json
    usuario = data["usuario"]
    clave = data["clave"]

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM usuarios WHERE username=%s AND password=%s", (usuario, clave))
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if user:
        return jsonify({"status": "ok", "mensaje": "Login correcto"})
    else:
        return jsonify({"status": "error", "mensaje": "Credenciales inválidas"}), 401

@app.route("/probar-conexion")
def probar_conexion():
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT DATABASE()")
        nombre_bd = cursor.fetchone()[0]
        cursor.close()
        conn.close()
        return jsonify({"conexion": "ok", "base_datos": nombre_bd})
    except Exception as e:
        return jsonify({"conexion": "error", "detalle": str(e)})

@app.route("/api/examenes")
def obtener_examenes():
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT idexamenes, nombre, numero, institucion, anio FROM examenes")
        examenes = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify(examenes)
    except Exception as e:
        return jsonify({"status": "error", "detalle": str(e)}), 500


@app.route('/api/examenes/<int:idexamen>', methods=['DELETE'])
def eliminar_examen(idexamen):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM examenes WHERE idexamenes = %s", (idexamen,))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({'mensaje': 'Examen eliminado correctamente'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500



@app.route('/api/importar_examen', methods=['POST'])

def importar_examen():
    if 'archivo' not in request.files:
        return jsonify({'error': 'No se envió archivo'}), 400

    archivo = request.files['archivo']
    if archivo.filename == '':
        return jsonify({'error': 'Nombre de archivo vacío'}), 400

    # ✅ Usar nombre original para extraer datos
    nombre_original = archivo.filename
    nombre_sin_extension = nombre_original.replace(".docx", "")

    # ✅ Expresión regular para extraer datos
    patron = r"examen\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+)\s+(I{1,2})\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)\s+(\d{4})"
    match = re.search(patron, nombre_sin_extension, re.IGNORECASE)

    if not match:
        return jsonify({'error': 'Nombre de archivo no tiene formato válido'}), 400

    # ✅ Extraer valores
    nombre = f"Examen {match.group(1).strip().title()}"
    numero = match.group(2)
    institucion = match.group(3).upper()
    anio = int(match.group(4))

    # ✅ Guardar archivo de forma segura
    filename = secure_filename(nombre_original)
    ruta_archivo = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    archivo.save(ruta_archivo)

    try:
        conn = get_connection()
        cursor = conn.cursor()
        # Verificar si ya existe un archivo con el mismo nombre
        cursor.execute("SELECT COUNT(*) FROM examenes WHERE archivo_nombre = %s", (filename,))
        existe = cursor.fetchone()[0]

        if existe > 0:
            cursor.close()
            conn.close()
            return jsonify({'error': 'Ya se ha importado un examen con ese nombre de archivo'}), 400



        sql = """
            INSERT INTO examenes (nombre, numero, institucion, anio, archivo_nombre, archivo_ruta)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        cursor.execute(sql, (nombre, numero, institucion, anio, filename, ruta_archivo))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({'exito': True, 'mensaje': 'Examen importado correctamente'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    


@app.route("/api/exportar_examen/<int:idexamen>")
def exportar_examen(idexamen):
    formato = (request.args.get("formato") or "pdf").lower()
    if formato not in ("pdf", "word"):
        return jsonify({"error": "formato inválido (pdf|word)"}), 400

    # 1) Obtener ruta del DOCX desde la BD
    try:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT archivo_ruta, archivo_nombre FROM examenes WHERE idexamenes=%s",
            (idexamen,)
        )
        row = cur.fetchone()
        cur.close(); conn.close()
    except Exception as e:
        return jsonify({"error": f"DB error: {e}"}), 500

    if not row:
        return jsonify({"error": "No existe el examen"}), 404

    ruta_docx = os.path.abspath(row["archivo_ruta"])
    if not os.path.isfile(ruta_docx):
        return jsonify({"error": f"No existe el archivo en disco: {ruta_docx}"}), 500

    # 2) Entregar DOCX
    if formato == "word":
        return send_file(
            ruta_docx,
            as_attachment=True,
            download_name=row["archivo_nombre"],
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            max_age=0,
        )

    # 3) Convertir a PDF con tu función generar_pdf(ruta_word)
    try:
        ruta_pdf = generar_pdf(ruta_docx)  # <- tu función existente
        # asegura ruta absoluta
        ruta_pdf = os.path.abspath(ruta_pdf)

        # enviar y borrar el temporal al finalizar
        resp = send_file(
            ruta_pdf,
            as_attachment=True,
            download_name=os.path.splitext(row["archivo_nombre"])[0] + ".pdf",
            mimetype="application/pdf",
            max_age=0,
        )

        @resp.call_on_close
        def _cleanup():
            try:
                if os.path.exists(ruta_pdf):
                    os.remove(ruta_pdf)
            except Exception:
                pass

        return resp

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": f"Fallo al convertir a PDF: {e}"}), 500
def generar_pdf(ruta_word: str) -> str:
    ruta_word = os.path.abspath(ruta_word)

    # carpeta temporal única donde dejaremos el PDF
    tmpdir = tempfile.mkdtemp(prefix="pdf_")
    nombre_pdf = os.path.splitext(os.path.basename(ruta_word))[0] + ".pdf"
    ruta_pdf = os.path.join(tmpdir, nombre_pdf)

    # Constantes Word
    wdExportFormatPDF = 17
    wdExportOptimizeForPrint = 0
    wdExportAllDocument = 0
    wdExportDocumentContent = 0
    wdExportCreateNoBookmarks = 0

    # Requerido para hilos que crean objetos COM
    pythoncom.CoInitialize()

    # Inicia Word en un proceso aislado y silencioso
    word = win32.DispatchEx("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0

    try:
        # Abrir solo lectura
        doc = word.Documents.Open(ruta_word, ReadOnly=True)

        # Exportar como PDF (fiel al diseño impreso)
        doc.ExportAsFixedFormat(
            OutputFileName=ruta_pdf,
            ExportFormat=wdExportFormatPDF,
            OpenAfterExport=False,
            OptimizeFor=wdExportOptimizeForPrint,
            Range=wdExportAllDocument,
            From=1, To=1,  # ignorados cuando Range = All
            Item=wdExportDocumentContent,
            IncludeDocProps=True,
            KeepIRM=True,
            CreateBookmarks=wdExportCreateNoBookmarks,
            DocStructureTags=True,      # accesibilidad/estructura
            BitmapMissingFonts=True,    # si falta una fuente, rasteriza
            UseISO19005_1=False         # pon True si quieres PDF/A-1b
        )
        doc.Close(False)

        # A veces Word tarda un instante en cerrar el handle al archivo
        for _ in range(10):
            if os.path.exists(ruta_pdf) and os.path.getsize(ruta_pdf) > 0:
                break
            time.sleep(0.1)

        if not os.path.exists(ruta_pdf) or os.path.getsize(ruta_pdf) == 0:
            raise RuntimeError("Word no generó el PDF (archivo vacío).")

        return ruta_pdf

    finally:
        try:
            word.Quit()
        except Exception:
            pass
        pythoncom.CoUninitialize()


@app.route("/api/examen_nombre/<int:idexamen>")
def examen_nombre(idexamen):
    try:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT archivo_nombre FROM examenes WHERE idexamenes=%s",
            (idexamen,)
        )
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return jsonify({"error": "No existe el examen"}), 404
        return jsonify({"archivo_nombre": row["archivo_nombre"]})
    except Exception as e:
        return jsonify({"error": f"DB error: {e}"}), 500
    

    
if __name__ == "__main__":
    app.run(port=5050)

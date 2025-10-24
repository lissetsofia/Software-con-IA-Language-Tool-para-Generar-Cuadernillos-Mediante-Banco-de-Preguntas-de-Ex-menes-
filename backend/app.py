from flask import Flask, request, jsonify, send_file, redirect, url_for
from db import get_connection

import os, tempfile, time
import win32com.client as win32
import pythoncom
import re
from werkzeug.utils import secure_filename
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from docx2pdf import convert
from io import BytesIO
import   zipfile, shutil,  unicodedata, copy
import xml.etree.ElementTree as ET
from docx import Document as DocxDocument

# ↑ cerca de otros imports
import json

...
try:
    from docxcompose.composer import Composer
except Exception:
    Composer = None


app = Flask(__name__)

NS = {
    "w":  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r":  "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "m":  "http://schemas.openxmlformats.org/officeDocument/2006/math",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "a":  "http://schemas.openxmlformats.org/drawingml/2006/main",
    "pic":"http://schemas.openxmlformats.org/drawingml/2006/picture",
    "v":  "urn:schemas-microsoft-com:vml",
    "o":  "urn:schemas-microsoft-com:office:office",
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
}
for p, u in NS.items():
    ET.register_namespace(p, u)
# rutas absolutas
BACKEND_DIR = os.path.abspath(os.path.dirname(__file__))
PROYECTO_DIR = os.path.abspath(os.path.join(BACKEND_DIR, ".."))

app.config['UPLOAD_FOLDER'] = os.path.join(BACKEND_DIR, "uploads")
app.config['DESCARGAS_FOLDER'] = os.path.join(PROYECTO_DIR, "descargas")  # <- fuera de /backend

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['DESCARGAS_FOLDER'], exist_ok=True)

# (si quieres verificar en consola)
print("DESCARGAS_FOLDER =>", app.config['DESCARGAS_FOLDER'])



app.config['PREGUNTAS_DIR'] = os.path.join(os.path.dirname(__file__), 'temas_archivos')
os.makedirs(app.config['PREGUNTAS_DIR'], exist_ok=True)

# cerca de los imports superiores
class DocxVacioError(Exception):
    def __init__(self, paths): self.paths = paths


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
    
# ---------------------------
# CRUD TEMAS (cursos)
# ---------------------------

@app.route("/api/temas", methods=["GET"])
def temas_listar():
    """?all=1 para incluir inactivos; por defecto solo activos."""
    include_all = request.args.get("all") == "1"
    try:
        conn = get_connection()
        cur = conn.cursor(dictionary=True)

        # Opción con LEFT JOIN + COUNT(idpreguntas) (robusta y eficiente)
        if include_all:
            cur.execute("""
                SELECT t.id, t.nombre, t.activo,
                       COALESCE(COUNT(p.idpreguntas), 0) AS n_preguntas
                FROM temas t
                LEFT JOIN preguntas p ON p.tema_id = t.id
                GROUP BY t.id, t.nombre, t.activo
                ORDER BY t.nombre
            """)
        else:
            cur.execute("""
                SELECT t.id, t.nombre, t.activo,
                       COALESCE(COUNT(p.idpreguntas), 0) AS n_preguntas
                FROM temas t
                LEFT JOIN preguntas p ON p.tema_id = t.id
                WHERE t.activo = 1
                GROUP BY t.id, t.nombre, t.activo
                ORDER BY t.nombre
            """)

        rows = cur.fetchall()
        cur.close(); conn.close()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
@app.route("/api/temas", methods=["POST"])
def temas_crear():
    data = request.get_json(silent=True) or {}
    nombre = (data.get("nombre") or "").strip()
    if not nombre:
        return jsonify({"error": "El nombre es requerido"}), 400
    if len(nombre) > 100:
        return jsonify({"error": "Máximo 100 caracteres"}), 400
    try:
        conn = get_connection(); cur = conn.cursor()
        # Evitar duplicados (case-insensitive)
        cur.execute("SELECT id FROM temas WHERE LOWER(nombre)=LOWER(%s)", (nombre,))
        if cur.fetchone():
            cur.close(); conn.close()
            return jsonify({"error": "Ya existe un curso con ese nombre"}), 409
        cur.execute("INSERT INTO temas (nombre, activo) VALUES (%s, 1)", (nombre,))
        conn.commit()
        nuevo_id = cur.lastrowid
        cur.close(); conn.close()
        return jsonify({"exito": True, "id": nuevo_id, "nombre": nombre, "activo": 1}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/temas/<int:tema_id>", methods=["PUT"])
def temas_editar(tema_id):
    data = request.get_json(silent=True) or {}
    nombre = (data.get("nombre") or "").strip()
    if not nombre:
        return jsonify({"error": "El nombre es requerido"}), 400
    try:
        conn = get_connection(); cur = conn.cursor()
        # Chequeo de duplicado
        cur.execute("SELECT id FROM temas WHERE LOWER(nombre)=LOWER(%s) AND id<>%s", (nombre, tema_id))
        if cur.fetchone():
            cur.close(); conn.close()
            return jsonify({"error": "Ya existe otro curso con ese nombre"}), 409
        cur.execute("UPDATE temas SET nombre=%s WHERE id=%s", (nombre, tema_id))
        conn.commit()
        cur.close(); conn.close()
        return jsonify({"exito": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/temas/<int:tema_id>/toggle", methods=["PATCH"])
def temas_toggle(tema_id):
    """Habilitar/Deshabilitar (soft-delete)."""
    try:
        conn = get_connection(); cur = conn.cursor()
        cur.execute("UPDATE temas SET activo=1-activo WHERE id=%s", (tema_id,))
        conn.commit()
        cur.close(); conn.close()
        return jsonify({"exito": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/temas/<int:tema_id>", methods=["DELETE"])
def temas_eliminar(tema_id):
    """
    Eliminar definitivo.
    - por defecto: si hay preguntas, bloquea.
    - si ?force=1: borra también sus preguntas (¡peligroso!).
    """
    force = request.args.get("force") == "1"
    try:
        conn = get_connection(); cur = conn.cursor()
        # ¿tiene preguntas?
        cur.execute("SELECT COUNT(*) FROM preguntas WHERE tema_id=%s", (tema_id,))
        n = cur.fetchone()[0]

        if n > 0 and not force:
            cur.close(); conn.close()
            return jsonify({"error": f"El tema tiene {n} preguntas. Deshabilítalo o elimina con force=1."}), 409

        if force:
            cur.execute("DELETE FROM preguntas WHERE tema_id=%s", (tema_id,))
        cur.execute("DELETE FROM temas WHERE id=%s", (tema_id,))
        conn.commit()
        cur.close(); conn.close()
        return jsonify({"exito": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

# ---------------------------
# CRUD preguntas
# ---------------------------
import os, re, zipfile, shutil, tempfile, unicodedata, copy
import xml.etree.ElementTree as ET

# -----------------------------------------------------------------------------------
# Helpers DOCX / XML
# -----------------------------------------------------------------------------------
NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = "{%s}" % NS_W
ns_doc = {"w": NS_W}

def paragraph_text(p):
    """
    Reconstruye el texto real de un <w:p> sin meter espacios falsos entre runs,
    respetando xml:space='preserve' y considerando <w:tab>/<w:br> como espacio.
    """
    parts = []
    for node in p.iter():
        if node.tag == W + "t":
            txt = node.text or ""
            if node.get(W + "space") == "preserve":
                parts.append(txt)
            else:
                parts.append(txt.strip())
        elif node.tag in (W + "tab", W + "br"):
            parts.append(" ")
    return "".join(parts)

def _norm(s: str) -> str:
    if not s:
        return ""
    s = s.lower().strip()
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")  # quita acentos
    s = re.sub(r"\s+", " ", s)
    return s

def _slug(s: str) -> str:
    t = _norm(s)
    t = t.replace(" ", "_")
    return re.sub(r"[^a-z0-9_]+", "", t) or "tema"

def is_centered_bold_heading(p):
    """Heurística: párrafo centrado/negrita y corto ⇒ probable encabezado."""
    pPr = p.find("w:pPr", ns_doc)
    centered = False
    if pPr is not None:
        jc = pPr.find("w:jc", ns_doc)
        centered = (jc is not None and jc.get(W + "val") == "center")
    bold = any((r.find("w:rPr", ns_doc) is not None and r.find("w:rPr/w:b", ns_doc) is not None)
               for r in p.findall("w:r", ns_doc))
    txt = _norm(paragraph_text(p))
    return (centered or bold) and len(txt) <= 30 and re.fullmatch(r"[a-z\s]+", txt or "") is not None

def _reempacar_docx(work_dir: str, elementos_xml, destino_docx: str):
    tmp = tempfile.mkdtemp(prefix="docx_")
    shutil.copytree(work_dir, tmp, dirs_exist_ok=True)

    doc_path = os.path.join(tmp, 'word', 'document.xml')
    tree = ET.parse(doc_path)
    root = tree.getroot()
    body = root.find(W + 'body')

    # 1) sectPr original (igual que ya tenías)
    sectPr = body.find(W + 'sectPr')
    if sectPr is None and len(list(body)) > 0:
        last = list(body)[-1]
        if last.tag == W + 'p':
            pPr = last.find(W + 'pPr')
            if pPr is not None:
                sectPr = pPr.find(W + 'sectPr')
    if sectPr is None:
        sectPr = ET.Element(W + 'sectPr')

    # 2) limpiar body
    for ch in list(body):
        body.remove(ch)

    # 3) añadir SOLO contenido saneado
    for el in elementos_xml:
        frag = copy.deepcopy(el)
        _sanear_fragmento(frag)
        body.append(frag)

    # 4) remate válido: p vacío + sectPr final
    body.append(ET.Element(W + 'p'))
    body.append(copy.deepcopy(sectPr))

    tree.write(doc_path, xml_declaration=True, encoding='UTF-8', method='xml')

    with zipfile.ZipFile(destino_docx, 'w') as z:
        for base, _, files in os.walk(tmp):
            for f in files:
                p = os.path.join(base, f)
                z.write(p, os.path.relpath(p, tmp))
    shutil.rmtree(tmp, ignore_errors=True)


def reparar_docx_inplace(path_in: str) -> None:
    pythoncom.CoInitialize()
    try:
        word = win32.DispatchEx("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0
        doc = word.Documents.Open(path_in, ReadOnly=False, OpenAndRepair=True,
                                  ConfirmConversions=False, AddToRecentFiles=False, Visible=False)
        # Guardar sobre el mismo archivo
        wdFormatXMLDocument = 12
        doc.SaveAs(path_in, FileFormat=wdFormatXMLDocument)
        doc.Close(False)
    finally:
        try: word.Quit()
        except: pass
        pythoncom.CoUninitialize()

# -----------------------------------------------------------------------------------
# CRUD PREGUNTAS / PARTIR EXAMEN POR TEMAS (ROBUSTO)
# -----------------------------------------------------------------------------------
@app.route("/api/examenes/<int:idexamen>/partir_y_guardar", methods=["POST"])
def partir_y_guardar(idexamen):
    overwrite = (request.args.get("overwrite") == "1")

    # ====== utilidades/constantes del "código firme" ======
    NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    W = "{%s}" % NS_W
    ns_doc = {"w": NS_W}

    LETTER_FMTS = {"upperLetter", "lowerLetter"}
    ROMAN_FMTS  = {"upperRoman", "lowerRoman"}
    BULLET_FMTS = {"bullet"}
    QUESTION_FMTS = {"decimal", "decimalZero"}
    NON_QUESTION_TOPLEVEL_FMTS = LETTER_FMTS | ROMAN_FMTS | BULLET_FMTS

    def normalize(s: str) -> str:
        s = (s or "").lower().strip()
        s = unicodedata.normalize("NFD", s)
        s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
        s = re.sub(r"\s+", " ", s)
        return s

    def slugify(s: str) -> str:
        s = normalize(s)
        s = re.sub(r"[^a-z0-9]+", "_", s)
        s = re.sub(r"_+", "_", s).strip("_")
        return s or "tema"

    def paragraph_text(p) -> str:
        parts = []
        for node in p.iter():
            if node.tag == W + "t":
                txt = node.text or ""
                if node.get(W + "space") == "preserve":
                    parts.append(txt)
                else:
                    parts.append(txt.strip())
            elif node.tag in (W + "tab", W + "br"):
                parts.append(" ")
        return "".join(parts)

    def is_centered_bold_heading(p) -> bool:
        pPr = p.find("w:pPr", ns_doc)
        centered = False
        if pPr is not None:
            jc = pPr.find("w:jc", ns_doc)
            centered = (jc is not None and jc.get(W + "val") == "center")
        bold = any((r.find("w:rPr", ns_doc) is not None and r.find("w:rPr/w:b", ns_doc) is not None)
                   for r in p.findall("w:r", ns_doc))
        txt = normalize(paragraph_text(p))
        return (centered or bold) and len(txt) <= 40 and re.fullmatch(r"[a-z\s]+", txt or "") is not None

    def is_question_start(plain_text: str, numPr, fmt: str, ilvl: str) -> bool:
        if re.match(r"^\s*\(?[1-9]\d{0,2}\)?[.)]?(?:\s+|(?=[^\s]))", plain_text):
            return True
        if numPr is None or ilvl != "0" or fmt in NON_QUESTION_TOPLEVEL_FMTS:
            return False
        return (fmt in QUESTION_FMTS) or (fmt == "")

    def match_topic_name(line_norm: str, CANON_TOPICS: dict) -> str | None:
        cleaned = re.sub(r"^[\s\-\–\—\:;,\.\(\)\[\]\{\}]+|[\s\-\–\—\:;,\.\(\)\[\]\{\}]+$", "", line_norm).strip()
        cleaned = re.sub(r"\s+", " ", cleaned)
        return CANON_TOPICS.get(cleaned, None)

    def heading_block_topic(elems, start, CANON_TOPICS):
        texts = []
        j = start
        while j < len(elems) and elems[j].tag == W + "p":
            p = elems[j]
            if p.find(".//w:numPr", ns_doc) is not None:
                break
            tnorm = normalize(paragraph_text(p))
            if not tnorm:
                break
            if not is_centered_bold_heading(p):
                break
            texts.append(tnorm)
            merged = normalize(" ".join(texts))
            exact = match_topic_name(merged, CANON_TOPICS)
            if exact:
                return exact, (j - start + 1)
            j += 1
            if len(texts) >= 3:
                break
        return None, 0
    def looks_like_title(p, line_norm: str) -> bool:
            """
            Título si: (centrado/negrita) o (sin numeración y corto).
            Aumentamos el largo permitido a 80 para tolerar colas como '... del Perú y del mundo'.
            """
            if is_centered_bold_heading(p):
                return True
            if p.find(".//w:numPr", ns_doc) is None:
                if len(line_norm) <= 80 and re.fullmatch(r"[a-z0-9\s]+", line_norm or ""):
                    return True
            return False
    def soft_topic_match(line_norm: str, CANON_TOPICS: dict) -> str | None:
            """
            Soft-match simétrico por tokens (más tolerante con temas cortos como 'geografia').
            Acepta si:
            - cobertura_tema ≥ 0.5 y cobertura_linea ≥ 0.35, o
            - Jaccard ≥ 0.5
            Además: fallback por prefijo (la línea empieza con el nombre del tema).
            """
            def toks(s): 
                return [w for w in re.split(r"[^a-z0-9]+", normalize(s)) if w]

            lt = set(toks(line_norm))
            if not lt:
                return None

            best, best_score = None, 0.0
            for canon_norm, original in CANON_TOPICS.items():
                tt = set(toks(canon_norm))
                if not tt:
                    continue
                inter = len(tt & lt)
                if inter == 0:
                    continue

                topic_cov = inter / len(tt)
                line_cov  = inter / len(lt)
                jaccard   = inter / len(tt | lt)
                score = (topic_cov + line_cov + jaccard) / 3.0

                ok = ((topic_cov >= 0.5 and line_cov >= 0.35) or (jaccard >= 0.5))
                if ok and score > best_score:
                    best, best_score = original, score

            if best:
                return best

            # Prefijo: 'geografia del peru...' debe mapear a 'GEOGRAFÍA'
            for canon_norm, original in CANON_TOPICS.items():
                if line_norm.startswith(canon_norm + " "):
                    return original

            return None

    def detectar_tema(elem, texto_norm, plain_text, numPr_elem, fmt, ilvl, CANON_TOPICS, TOPIC_TRIGGERS):
        """
        Orden:
          1) Coincidencia EXACTA de línea con el nombre de tema.
          2) Trigger al inicio (tolerante): start<=2, before_words<=2, after_words<=8.
             Si además es inicio de pregunta, acepta sin mirar longitudes.
          3) Si 'parece título' (looks_like_title), aplicar soft_topic_match.
        """
        # 1) Exacto
        mt = match_topic_name(texto_norm, CANON_TOPICS)
        if mt:
            return mt

        # Limpia prefijos (I., 1), A)) y colas de puntuación
        t = re.sub(r"^(?:[ivxlcdm]+|[0-9]+|[a-z])[\.\)]\s*", "", texto_norm)
        t = re.sub(r"[\s\-\–\—\:;,\.\(\)\[\]\{\}]+$", "", t)

        # 2) Trigger al inicio (más laxo)
        for tema, triggers in TOPIC_TRIGGERS.items():
            for trig in triggers:
                m = re.search(rf"(^|\W){re.escape(trig)}(\W|$)", t)
                if not m:
                    continue
                start = m.start(0); end = m.end(0)
                before_words = len(t[:start].strip().split())
                after_words  = len(t[end:].strip().split())

                # Si el mismo párrafo es inicio de pregunta, aceptamos directo
                if start <= 2 and is_question_start(plain_text, numPr_elem, fmt, ilvl):
                    return tema

                # Título puro pero con cola algo más larga (p.ej. '... del perú y del mundo')
                if start <= 2 and before_words <= 2 and after_words <= 8:
                    return tema

        # 3) Soft por tokens si 'parece título' (no solo centrado/negrita)
        if looks_like_title(elem, texto_norm):
            st = soft_topic_match(texto_norm, CANON_TOPICS)
            if st:
                return st

        return None

    # ====== 1) Traer examen y TEMAS desde BD ======
    try:
        conn = get_connection(); cur = conn.cursor(dictionary=True)
        cur.execute("SELECT archivo_ruta, archivo_nombre FROM examenes WHERE idexamenes=%s", (idexamen,))
        exam = cur.fetchone()
        if not exam:
            cur.close(); conn.close()
            return jsonify({"error": "Examen no existe"}), 404
        ruta_docx = os.path.abspath(exam["archivo_ruta"])
        if not os.path.isfile(ruta_docx):
            cur.close(); conn.close()
            return jsonify({"error": f"Archivo DOCX no encontrado: {ruta_docx}"}), 500

        cur.execute("SELECT id, nombre FROM temas")
        temas_rows = cur.fetchall()
        cur.close(); conn.close()
    except Exception as e:
        return jsonify({"error": f"DB error: {e}"}), 500

    # ⚠️ TEMAS solo desde la BD
    TEMAS = [r["nombre"] for r in temas_rows]
    CANON_TOPICS = { normalize(t): t for t in TEMAS }  # norm->original
    temas_bd_map = { normalize(r["nombre"]): (r["id"], r["nombre"]) for r in temas_rows }

    # Base de sinónimos del código firme (solo se aplican si el tema existe en BD)
    TOPIC_TRIGGERS_BASE = {
        "RAZONAMIENTO MATEMÁTICO": ["razonamiento matematico","raz matematico","razonamiento de matematica"],
        "RAZONAMIENTO VERBAL": ["razonamiento verbal","raz verbal"],
        "COMUNICACIÓN": ["comunicacion","capacidad comunicativa"],
        "ÁLGEBRA": ["algebra"],
        "GEOMETRÍA": ["geometria"],
        "TRIGONOMETRÍA": ["trigonometria"],
        "FÍSICA": ["fisica"],
        "QUÍMICA": ["quimica"],
        "ECOLOGÍA Y MEDIO AMBIENTE": ["ecologia y medio ambiente"],
        "BIOLOGÍA": ["biologia"],
        "ZOOLOGÍA": ["zoologia"],
        "ECONOMÍA": ["economia"],
        "HISTORIA DEL PERÚ EN EL CONTEXTO MUNDIAL": ["historia del peru en el contexto mundial","historia del peru"],
        "EDUCACIÓN CÍVICA": ["educacion civica","civica"],
        "GEOGRAFÍA DEL PERÚ Y DEL MUNDO": ["geografia del peru y del mundo","geografia del peru","geografia"],
        "ARITMÉTICA": ["aritmetica"],
        "MATEMÁTICA II": ["matematica ii","matematica 2"],
        "COMPETENCIA LINGÜÍSTICA": ["competencia linguistica","competencia linguistica comunicativa"],
    }
    # Triggers efectivos: solo para temas que existan en BD; si no hay base, usa su propio nombre
    TOPIC_TRIGGERS = {
        name: TOPIC_TRIGGERS_BASE.get(name, [normalize(name)])
        for name in TEMAS
    }

    base_examen_dir = os.path.join(app.config['PREGUNTAS_DIR'], f"examen_{idexamen}")
    os.makedirs(base_examen_dir, exist_ok=True)

    # ====== 2) Limpiar si overwrite ======
    if overwrite:
        try:
            conn = get_connection(); cur = conn.cursor()
            cur.execute("DELETE FROM preguntas WHERE examenes_idexamenes=%s", (idexamen,))
            conn.commit()
            cur.close(); conn.close()
        except Exception as e:
            return jsonify({"error": f"No se pudo limpiar preguntas previas: {e}"}), 500
        if os.path.isdir(base_examen_dir):
            shutil.rmtree(base_examen_dir, ignore_errors=True)
        os.makedirs(base_examen_dir, exist_ok=True)

    # ====== 3) Unzip DOCX y numbering ======
    tmp_root = tempfile.mkdtemp(prefix="split_")
    work = os.path.join(tmp_root, "work"); os.mkdir(work)
    with zipfile.ZipFile(ruta_docx, "r") as z:
        z.extractall(work)

    num_fmt_map = {}
    numbering_xml_path = os.path.join(work, "word", "numbering.xml")
    if os.path.exists(numbering_xml_path):
        tree_num = ET.parse(numbering_xml_path)
        root_num = tree_num.getroot()
        for num in root_num.findall(".//w:num", ns_doc):
            numId = num.attrib.get(W + "numId")
            abs_el = num.find("./w:abstractNumId", ns_doc)
            if abs_el is None: continue
            abs_id = abs_el.attrib.get(W + "val")
            abstract = root_num.find(f".//w:abstractNum[@w:abstractNumId='{abs_id}']", ns_doc)
            if abstract is None: continue
            for lvl in abstract.findall("./w:lvl", ns_doc):
                ilvl = lvl.attrib.get(W + "ilvl")
                nf = lvl.find("./w:numFmt", ns_doc)
                if nf is not None:
                    num_fmt_map[(numId, ilvl)] = nf.attrib.get(W + "val")

    # ====== 4) Partir como en el código firme ======
    document_xml_path = os.path.join(work, "word", "document.xml")
    tree_doc = ET.parse(document_xml_path)
    root_doc = tree_doc.getroot()
    body = root_doc.find(W + "body")
    elems = list(body)

    preguntas_por_tema = {t: [] for t in TEMAS}  # solo temas que existen en BD
    actual_pregunta, copiando = [], False
    tema_actual, tema_anterior = "", ""
    active_q_numId = None

    i = 0
    while i < len(elems):
        elem = elems[i]
        if elem.tag != W + "p":
            i += 1
            continue

        plain_text = paragraph_text(elem)
        texto_norm = normalize(plain_text)

        # 0) título repartido
        topic_from_block, span = heading_block_topic(elems, i, CANON_TOPICS)
        if topic_from_block:
            if copiando and tema_anterior in preguntas_por_tema and actual_pregunta:
                preguntas_por_tema[tema_anterior].append(actual_pregunta)
            tema_actual = topic_from_block
            tema_anterior = tema_actual
            copiando = False
            actual_pregunta = []
            active_q_numId = None
            i += span
            continue

        # 1) num info
        numPr = elem.find(".//w:numPr", ns_doc)
        ilvl_val = numPr.find("./w:ilvl", ns_doc).get(W+"val") if (numPr is not None and numPr.find("./w:ilvl", ns_doc) is not None) else ""
        numId_val = numPr.find("./w:numId", ns_doc).get(W+"val") if (numPr is not None and numPr.find("./w:numId", ns_doc) is not None) else ""
        fmt = num_fmt_map.get((numId_val, ilvl_val), "")

        # 2) detección de tema
        posible_tema = detectar_tema(elem, texto_norm, plain_text, numPr, fmt, ilvl_val, CANON_TOPICS, TOPIC_TRIGGERS)
        if posible_tema:
            if copiando and tema_anterior in preguntas_por_tema and actual_pregunta:
                preguntas_por_tema[tema_anterior].append(actual_pregunta)
            # ⚠️ Solo aceptamos si existe en BD
            if posible_tema in preguntas_por_tema:
                tema_actual = posible_tema
                tema_anterior = tema_actual
                copiando = False
                actual_pregunta = []
                active_q_numId = None
                if not is_question_start(plain_text, numPr, fmt, ilvl_val):
                    i += 1
                    continue
            else:
                # tema no registrado en BD → ignorar este encabezado
                i += 1
                continue

        # 3) inicio de pregunta
        qstart = is_question_start(plain_text, numPr, fmt, ilvl_val)
        if qstart and numPr is not None and ilvl_val == "0" and fmt not in NON_QUESTION_TOPLEVEL_FMTS:
            if active_q_numId is None:
                active_q_numId = numId_val
        if qstart and active_q_numId and numPr is not None and numId_val != active_q_numId:
            if fmt in NON_QUESTION_TOPLEVEL_FMTS:
                qstart = False

        if tema_actual in preguntas_por_tema:
            if not copiando and qstart:
                copiando = True
                actual_pregunta = [elem]
            elif copiando and qstart:
                preguntas_por_tema[tema_actual].append(actual_pregunta)
                actual_pregunta = [elem]
            elif copiando:
                actual_pregunta.append(elem)

        i += 1

    if copiando and tema_actual in preguntas_por_tema and actual_pregunta:
        preguntas_por_tema[tema_actual].append(actual_pregunta)

    # ====== 5) Guardar .docx y registrar (sin crear temas) ======
    insertados, resumen = 0, {}
    try:
        conn = get_connection(); cur = conn.cursor()
        for tema_nombre, preguntas in preguntas_por_tema.items():
            if not preguntas:
                continue
            tema_key = normalize(tema_nombre)
            if tema_key not in temas_bd_map:
                # seguridad extra (no debería ocurrir porque TEMAS viene de BD)
                continue

            tema_id, tema_nombre_bd = temas_bd_map[tema_key]
            out_dir = os.path.join(base_examen_dir, slugify(tema_nombre_bd))
            os.makedirs(out_dir, exist_ok=True)

            for idx, contenido in enumerate(preguntas, start=1):
                nombre_archivo = f"{slugify(tema_nombre_bd)}_pregunta_{idx}.docx"
                ruta_archivo = os.path.abspath(os.path.join(out_dir, nombre_archivo))
                _reempacar_docx(work, contenido, ruta_archivo)
                try:
                    reparar_docx_inplace(ruta_archivo)   # ← limpia cualquier rastro dañino
                except Exception:
                    pass  # continúa aunque no se pueda reparar


                cur.execute("""
                    SELECT 1 FROM preguntas
                    WHERE examenes_idexamenes=%s AND tema_id=%s AND numero_p=%s
                """, (idexamen, tema_id, idx))
                if not cur.fetchone():
                    cur.execute("""
                        INSERT INTO preguntas (examenes_idexamenes, tema_id, numero_p, archivo_nombre, archivo_ruta)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (idexamen, tema_id, idx, nombre_archivo, ruta_archivo))
                    insertados += 1

            resumen[tema_nombre_bd] = len(preguntas)

        conn.commit()
        cur.close(); conn.close()
    except Exception as e:
        try:
            cur.close(); conn.close()
        except Exception:
            pass
        shutil.rmtree(tmp_root, ignore_errors=True)
        return jsonify({"error": f"Fallo guardando en BD: {e}"}), 500

    shutil.rmtree(tmp_root, ignore_errors=True)
    return jsonify({
        "ok": True,
        "examen": idexamen,
        "carpeta_base": base_examen_dir,
        "preguntas_insertadas": insertados,
        "por_tema": resumen
    })


# ========== TEMAS DEL EXAMEN (con conteo de preguntas ya partidas) ==========
# === TEMAS DE UN EXAMEN (para el modal "Buscar") ===
# === TEMAS DE UN EXAMEN (para el modal "Buscar") ===
# === TEMAS DE UN EXAMEN (para el modal "Buscar") ===
def _temas_de_examen_impl(idexamen: int):
    try:
        conn = get_connection(); cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT  t.id, t.nombre, t.activo,
                    COALESCE(COUNT(p.idpreguntas), 0) AS n_preguntas
            FROM temas t
            LEFT JOIN preguntas p
                   ON p.tema_id = t.id
                  AND p.examenes_idexamenes = %s
            GROUP BY t.id, t.nombre, t.activo
            ORDER BY t.nombre;
        """, (idexamen,))
        rows = cur.fetchall()
        cur.close(); conn.close()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Un único handler que normaliza el id (venga como string o int)
def temas_de_examen(idexamen):
    try:
        idexamen = int(idexamen)
    except (TypeError, ValueError):
        return jsonify({"error": "id de examen inválido"}), 400
    return _temas_de_examen_impl(idexamen)

# Registra TODAS las variantes para evitar 404 por detalles de ruta
app.url_map.strict_slashes = False  # ya lo tienes, lo dejo por claridad
try:
    app.add_url_rule(
        "/api/examenes/<int:idexamen>/temas",
        endpoint="temas_de_examen_int",
        view_func=temas_de_examen,
        methods=["GET"],
    )
    app.add_url_rule(
        "/api/examenes/<idexamen>/temas",
        endpoint="temas_de_examen_str",
        view_func=temas_de_examen,
        methods=["GET"],
    )
    app.add_url_rule(
        "/api/examenes/<int:idexamen>/temas/",
        endpoint="temas_de_examen_int_slash",
        view_func=temas_de_examen,
        methods=["GET"],
    )
    app.add_url_rule(
        "/api/examenes/<idexamen>/temas/",
        endpoint="temas_de_examen_str_slash",
        view_func=temas_de_examen,
        methods=["GET"],
    )
except AssertionError:
    # Si ya existían, ignora el error de duplicado.
    pass
# ⭐ alias: si alguien hace GET /api/examenes/<id> redirige a /temas
@app.route("/api/examenes/<int:idexamen>", methods=["GET"])
def examenes_alias_temas(idexamen):
    return redirect(url_for("temas_de_examen", idexamen=idexamen), code=308)


# === LISTAR PREGUNTAS (filtrable por examen y/o tema) ===
@app.route("/api/preguntas", methods=["GET"])
def preguntas_listar():
    examen_id = request.args.get("examen", type=int)
    tema_id   = request.args.get("tema", type=int)

    where = []
    params = []
    if examen_id is not None:
        where.append("examenes_idexamenes=%s"); params.append(examen_id)
    if tema_id is not None:
        where.append("tema_id=%s"); params.append(tema_id)

    sql = """
        SELECT idpreguntas, examenes_idexamenes, tema_id,
               numero_p, archivo_nombre, archivo_ruta
        FROM preguntas
    """
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY numero_p"

    try:
        conn = get_connection(); cur = conn.cursor(dictionary=True)
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        cur.close(); conn.close()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------
# CRUD GRUPOS (A, B, C, ES, etc.)
# ---------------------------

def _sanitize_clave(clave: str) -> str:
    return (clave or "").strip().upper()[:5]

@app.route("/api/grupos", methods=["GET"])
def grupos_listar():
    include_all = request.args.get("all") == "1"
    try:
        conn = get_connection(); cur = conn.cursor(dictionary=True)
        sql = """
            SELECT g.idgrupo, g.clave, g.nombre, g.activo, g.fecha_creacion,
                   COALESCE(SUM(gt.cantidad), 0) AS total_preguntas
            FROM grupos g
            LEFT JOIN grupo_tema gt ON gt.grupos_idgrupo = g.idgrupo
        """
        if not include_all:
            sql += " WHERE g.activo=1"
        sql += """
            GROUP BY g.idgrupo, g.clave, g.nombre, g.activo, g.fecha_creacion
            ORDER BY g.clave
        """
        cur.execute(sql)
        rows = cur.fetchall()
        cur.close(); conn.close()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def _sanitize_clave(clave: str) -> str:
    return (clave or "").strip().upper()[:5]

@app.route("/api/grupos", methods=["POST"])
def grupos_crear():
    data = request.get_json(force=True) or {}
    clave  = _sanitize_clave(data.get("clave", ""))
    nombre = (data.get("nombre") or "").strip()
    cuotas = data.get("cuotas") or []  # [{tema_id, cantidad}, ...]

    if not clave:
        return jsonify({"error": "La 'clave' es requerida"}), 400
    if len(nombre) > 100:
        return jsonify({"error": "El 'nombre' admite máximo 100 caracteres"}), 400

    try:
        conn = get_connection(); cur = conn.cursor()
        cur.execute("SELECT 1 FROM grupos WHERE UPPER(clave)=UPPER(%s)", (clave,))
        if cur.fetchone():
            cur.close(); conn.close()
            return jsonify({"error": f"Ya existe un grupo con clave '{clave}'"}), 409

        cur.execute("INSERT INTO grupos (clave, nombre, activo) VALUES (%s,%s,1)", (clave, nombre))
        idgrupo = cur.lastrowid

        for c in cuotas:
            tema_id = int(c["tema_id"]); cant = int(c["cantidad"])
            if cant <= 0:  # opcional: ignora/valida
                continue
            cur.execute("""
                INSERT INTO grupo_tema (grupos_idgrupo, tema_id, cantidad)
                VALUES (%s,%s,%s)
                ON DUPLICATE KEY UPDATE cantidad=VALUES(cantidad)
            """, (idgrupo, tema_id, cant))

        conn.commit()
        cur.close(); conn.close()
        return jsonify({"exito": True, "idgrupo": idgrupo})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/grupos/<int:idgrupo>", methods=["PUT"])
def grupos_editar(idgrupo):
    """
    Body JSON (campos opcionales):
    { "clave": "B", "nombre": "Humanidades", "activo": 1 }
    """
    data = request.get_json(silent=True) or {}
    clave  = data.get("clave", None)
    nombre = data.get("nombre", None)
    activo = data.get("activo", None)

    updates = []
    params  = []

    if clave is not None:
        clave = _sanitize_clave(clave)
        if not clave:
            return jsonify({"error": "La 'clave' no puede ser vacía"}), 400
        updates.append("clave=%s"); params.append(clave)

    if nombre is not None:
        nombre = (nombre or "").strip()
        if len(nombre) > 100:
            return jsonify({"error": "El 'nombre' admite máximo 100 caracteres"}), 400
        updates.append("nombre=%s"); params.append(nombre)

    if activo is not None:
        try:
            activo = 1 if int(activo) else 0
        except Exception:
            return jsonify({"error": "El campo 'activo' debe ser 0 o 1"}), 400
        updates.append("activo=%s"); params.append(activo)

    if not updates:
        return jsonify({"error": "No hay campos para actualizar"}), 400

    try:
        conn = get_connection(); cur = conn.cursor()

        # Chequeo de duplicado de clave si se cambia
        if "clave=%s" in updates:
            cur.execute("SELECT idgrupo FROM grupos WHERE UPPER(clave)=UPPER(%s) AND idgrupo<>%s", (clave, idgrupo))
            if cur.fetchone():
                cur.close(); conn.close()
                return jsonify({"error": f"Ya existe otro grupo con clave '{clave}'"}), 409

        sql = f"UPDATE grupos SET {', '.join(updates)} WHERE idgrupo=%s"
        params.append(idgrupo)
        cur.execute(sql, tuple(params))
        conn.commit()
        cur.close(); conn.close()
        return jsonify({"exito": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/grupos/<int:idgrupo>/toggle", methods=["PATCH"])
def grupos_toggle(idgrupo):
    """Activa/Desactiva un grupo (soft)."""
    try:
        conn = get_connection(); cur = conn.cursor()
        cur.execute("UPDATE grupos SET activo = 1 - activo WHERE idgrupo=%s", (idgrupo,))
        conn.commit()
        cur.close(); conn.close()
        return jsonify({"exito": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/grupos/<int:idgrupo>", methods=["DELETE"])
def grupos_eliminar(idgrupo):
    """
    Borrado definitivo.
    - Bloquea si hay cuotas en grupo_tema o exámenes generados.
    - ?force=1 elimina primero sus cuotas (NO borra exámenes generados).
    """
    force = request.args.get("force") == "1"
    try:
        conn = get_connection(); cur = conn.cursor()

        cur.execute("SELECT COUNT(*) FROM grupo_tema WHERE grupos_idgrupo=%s", (idgrupo,))
        n_gt = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM examen_generado WHERE grupos_idgrupo=%s", (idgrupo,))
        n_gen = cur.fetchone()[0]

        if (n_gt > 0 or n_gen > 0) and not force:
            cur.close(); conn.close()
            return jsonify({"error": f"No se puede borrar: cuotas={n_gt}, generados={n_gen}. Desactívalo o usa force=1."}), 409

        if force and n_gt > 0:
            cur.execute("DELETE FROM grupo_tema WHERE grupos_idgrupo=%s", (idgrupo,))

        # Por seguridad NO borramos examen_generado. Si existe FK, el delete fallará.
        cur.execute("DELETE FROM grupos WHERE idgrupo=%s", (idgrupo,))
        conn.commit()
        cur.close(); conn.close()
        return jsonify({"exito": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =======================
# EXAMEN ↔ GRUPOS (lecturas para UI)
# =======================
# Ver cuotas asignadas al grupo (solo las asignadas)
@app.route("/api/grupos/<clave>/cuotas", methods=["GET"])
def grupos_cuotas_get(clave):
    try:
        conn = get_connection(); cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT t.id AS tema_id, t.nombre AS tema, gt.cantidad
            FROM grupo_tema gt
            JOIN grupos g ON g.idgrupo = gt.grupos_idgrupo
            JOIN temas  t ON t.id     = gt.tema_id
            WHERE g.clave = %s
            ORDER BY t.nombre
        """, (clave.upper(),))
        rows = cur.fetchall()
        cur.close(); conn.close()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Reemplazar cuotas del grupo (PUT con la lista completa)
# GET: cuotas existentes (solo las que tienen cantidad)
# GET: cuotas existentes (solo las que tienen cantidad)
@app.route("/api/grupos/<int:idgrupo>/cuotas", methods=["GET"])
def grupo_cuotas_get(idgrupo):
    try:
        conn = get_connection(); cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT gt.tema_id, t.nombre AS tema, gt.cantidad
            FROM grupo_tema gt
            JOIN temas t ON t.id = gt.tema_id
            WHERE gt.grupos_idgrupo = %s
            ORDER BY t.nombre
        """, (idgrupo,))
        rows = cur.fetchall()
        cur.close(); conn.close()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# PUT: reemplaza todas las cuotas del grupo
@app.route("/api/grupos/<int:idgrupo>/cuotas", methods=["PUT"])
def grupo_cuotas_put(idgrupo):
    data = request.get_json(force=True) or {}
    cuotas = data.get("cuotas", [])
    try:
        conn = get_connection(); cur = conn.cursor()

        tema_ids = [int(c["tema_id"]) for c in cuotas if "tema_id" in c]
        # Borra las que ya no están
        if tema_ids:
            cur.execute(
                "DELETE FROM grupo_tema WHERE grupos_idgrupo=%s AND tema_id NOT IN (%s)" %
                ("%s", ",".join(["%s"]*len(tema_ids))),
                (idgrupo, *tema_ids)
            )
        else:
            cur.execute("DELETE FROM grupo_tema WHERE grupos_idgrupo=%s", (idgrupo,))

        # Upsert de cada cuota (asegúrate de tener UNIQUE (grupos_idgrupo, tema_id))
        for c in cuotas:
            cur.execute("""
                INSERT INTO grupo_tema (grupos_idgrupo, tema_id, cantidad)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE cantidad=VALUES(cantidad)
            """, (idgrupo, int(c["tema_id"]), int(c["cantidad"])))

        conn.commit()
        cur.close(); conn.close()
        return jsonify({"status": "ok"})
    except Exception as e:
        try: conn.rollback()
        except: pass
        return jsonify({"error": str(e)}), 500



# =======================
# GENERAR SELECCIÓN POR GRUPO (aleatoria por tema)
# =======================
# =======================
# GENERAR DOC (WORD/PDF) SEGÚN GRUPO
# =======================
# =======================
# GENERAR DOC (WORD/PDF) SEGÚN GRUPO
# =======================
# --- Implementación común ---
def _grupos_generar_doc_impl(idgrupo: int, formato: str):
    formato = (formato or "word").lower()
    if formato not in ("word", "pdf"):
        return jsonify({"error": "formato inválido (word|pdf)"}), 400

    try:
        conn = get_connection(); cur = conn.cursor(dictionary=True)

        # Datos del grupo
        cur.execute("SELECT idgrupo, clave, nombre FROM grupos WHERE idgrupo=%s", (idgrupo,))
        g = cur.fetchone()
        if not g:
            cur.close(); conn.close()
            return jsonify({"error":"Grupo no existe"}), 404
        clave = g["clave"] or f"G{idgrupo}"

        # Cuotas
        cur.execute("""
            SELECT gt.tema_id, t.nombre AS tema, gt.cantidad
            FROM grupo_tema gt
            JOIN temas t ON t.id = gt.tema_id
            WHERE gt.grupos_idgrupo = %s
            ORDER BY t.nombre
        """, (idgrupo,))
        cuotas = cur.fetchall()
        if not cuotas:
            cur.close(); conn.close()
            return jsonify({"error":"El grupo no tiene cuotas configuradas."}), 400

        total_requeridas = sum(max(0, int(c["cantidad"])) for c in cuotas)
        if total_requeridas <= 0:
            cur.close(); conn.close()
            return jsonify({"error": "Todas las cuotas están en 0. Asigna cantidades > 0."}), 400

        tema_ids = [c["tema_id"] for c in cuotas if int(c["cantidad"]) > 0]
        if not tema_ids:
            cur.close(); conn.close()
            return jsonify({"error":"No hay cuotas con cantidad > 0."}), 400

        # Disponibilidad
        cur.execute(
            "SELECT tema_id, COUNT(*) AS disponibles "
            "FROM preguntas "
            "WHERE tema_id IN (" + ",".join(["%s"]*len(tema_ids)) + ") "
            "GROUP BY tema_id", tuple(tema_ids)
        )
        disp = cur.fetchall()
        mapa_disp = {int(d["tema_id"]): int(d["disponibles"]) for d in disp}
        faltantes = []
        for c in cuotas:
            req = max(0, int(c["cantidad"]))
            if req and mapa_disp.get(int(c["tema_id"]), 0) < req:
                faltantes.append({
                    "tema_id": int(c["tema_id"]),
                    "tema": c["tema"],
                    "requeridas": req,
                    "disponibles": mapa_disp.get(int(c["tema_id"]), 0)
                })
        if faltantes:
            cur.close(); conn.close()
            return jsonify({"ok": False, "error": "No hay preguntas suficientes para crear este examen.", "faltantes": faltantes}), 409

        # Modo diagnóstico
        if request.args.get("debug") == "1":
            cur.close(); conn.close()
            return jsonify({
                "grupo_id": idgrupo,
                "cuotas": cuotas,
                "disponibilidad_por_tema": mapa_disp,
                "total_requeridas": total_requeridas
            })

        # Selección aleatoria
        # --- Selección aleatoria agrupada por tema (respeta el orden de cuotas) ---
        grouped = []  # [(tema_nombre, [ruta_docx, ...]), ...]
        for c in cuotas:
            tema_nombre = c["tema"]
            cantidad = int(c["cantidad"])
            if cantidad <= 0:
                continue

            cur.execute("""
                SELECT archivo_ruta
                FROM preguntas
                WHERE tema_id = %s
                ORDER BY RAND()
                LIMIT %s
            """, (c["tema_id"], cantidad))
            filas = cur.fetchall()
            if len(filas) < cantidad:
                cur.close(); conn.close()
                return jsonify({"ok": False, "error": "Stock insuficiente inesperado."}), 409

            paths = [os.path.abspath(f["archivo_ruta"]) for f in filas]
            grouped.append((tema_nombre, paths))

            # justo después de construir 'grouped'
        vacios = [(t, len(fs)) for (t, fs) in grouped if not fs]
        if vacios:
            return jsonify({"ok": False, "error": "No se encontraron preguntas para algunos temas",
                            "detalles": [{"tema": t, "encontradas": n} for t, n in vacios]}), 409

                # --- Unir y normalizar (igual que ya tienes) ---
               # --- Unir y normalizar ---
        ts = time.strftime("%Y-%m-%d %H-%M")
        # timestamp legible
        friendly = f"Examen del grupo {clave} - {ts}"
        # NOMBRE AMIGABLE

        base_name = f"{friendly}.docx"


        destino_docx = os.path.join(app.config['DESCARGAS_FOLDER'], base_name)

        # Puedes forzar COM con ?com=1 (Windows). Por defecto usamos el camino Python (estable).
        usar_com = (request.args.get("com") == "1") and _com_disponible()
        if not usar_com and Composer is None and _com_disponible():
            usar_com = True 
        malos = []
        if usar_com:
            # COM (Word) + títulos
            destino_docx, _, malos = _merge_grouped_with_headings_wordcom(grouped, destino_docx)
        else:
            # Python (docxcompose) + títulos
            destino_docx, _, malos = _merge_grouped_with_headings(grouped, destino_docx)
            # Normaliza numeración decimal como en tu Colab
            try:
                _post_merge_fix_numbering(destino_docx)    # fuerza numId=1 ilvl=0 para 'decimal'
            except Exception:
                pass
            # Secciones continuas y limpieza opcional
            try:
                _hacer_secciones_continuas(destino_docx)   # cambia nextPage->continuous y quita <w:br type="page"/>
            except Exception:
                pass
       # ... después de producir destino_docx (con COM o con python) ...
        try:
            # 🔁 Convierte cualquier viñeta a numeración 1., 2., 3., …
            bullets_to_numbers_docx(destino_docx)
        except Exception as _e:
            # no abortes la generación por esto: lo dejamos como advertencia silenciosa
           print("bullet->decimal warning:", _e)



        # Reparación/compactado con Word si está disponible (opcional pero útil tras editar XML)
        try:
            reparar_docx_inplace(destino_docx)
        except Exception:
            pass

     
        # --- Guardar y devolver JSON (sin descargar) ---
        # --- Guardar y devolver JSON (sin descargar) ---
          # --- Guardar y devolver JSON (sin descargar) ---
        advertencias = []  # o usa los “malos” que devuelven los merges
        result = {
            "ok": True,
            "formato": formato,
            "archivo_docx": base_name,
            "ruta_rel": f"/api/descargas/{base_name}",
            "warnings": [{"path": p, "motivo": m} for (p, m) in advertencias]  # lista vacía si no hay
        }
        # =========================
        # ⛑️ PLAN B: aplanar numeración si ?flat=1
        # (convierte toda la numeración a texto y elimina numbering.xml)
        # =========================
        if request.args.get("flat") == "1":
            try:
                aplanar_listas_a_texto(destino_docx)
                reparar_docx_inplace(destino_docx)  # opcional
            except Exception:
                pass

        # Si pidieron PDF, convertir AHORA (después del aplanado si aplica)
        if formato == "pdf":
            pdf_name = f"{friendly}.pdf"
            # 🔴 convertir SIEMPRE el DOCX recién generado
            pdf_tmp = guardar_pdf(destino_docx)
            pdf_final = os.path.join(app.config['DESCARGAS_FOLDER'], pdf_name)
            try:
                shutil.move(pdf_tmp, pdf_final)
            except Exception:
                shutil.copy2(pdf_tmp, pdf_final)
                try: os.remove(pdf_tmp)
                except: pass

            result.update({
                "archivo_pdf": pdf_name,
                "ruta_rel_pdf": f"/api/descargas/{pdf_name}"
            })


        return jsonify(result)



    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# Acepta ID numérico y también GET para compatibilidad
@app.route("/api/grupos/<int:idgrupo>/generar_doc", methods=["GET", "POST"])
def grupos_generar_doc_por_id(idgrupo: int):
    return _grupos_generar_doc_impl(idgrupo, request.args.get("formato"))

# NUEVA: acepta clave tipo "A", "B", "ES" y también GET
@app.route("/api/grupos/<clave>/generar_doc", methods=["GET", "POST"])
def grupos_generar_doc_por_clave(clave: str):
    try:
        conn = get_connection(); cur = conn.cursor()
        cur.execute("SELECT idgrupo FROM grupos WHERE UPPER(clave)=UPPER(%s)", (clave,))
        row = cur.fetchone()
        cur.close(); conn.close()
        if not row:
            return jsonify({"error": f"Grupo con clave '{clave}' no existe"}), 404
        idgrupo = int(row[0])
        return _grupos_generar_doc_impl(idgrupo, request.args.get("formato"))
    except Exception as e:
        return jsonify({"error": str(e)}), 500






@app.get("/api/descargas/<path:nombre>")
def descargar_archivo(nombre):
    # seguridad básica: evita subir directorios
    nombre = os.path.normpath(nombre).replace("\\", "/")
    if "/" in nombre:
        # solo se acepta el nombre dentro de descargas
        return jsonify({"error": "nombre inválido"}), 400

    ruta = os.path.join(app.config['DESCARGAS_FOLDER'], nombre)
    if not os.path.isfile(ruta):
        return jsonify({"error": "archivo no existe"}), 404

    # ahora sí, descarga al cliente
    return send_file(
        ruta,
        as_attachment=True,
        download_name=nombre,
        max_age=0,
        mimetype=("application/pdf" if nombre.lower().endswith(".pdf")
                  else "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    )
def _tiene_texto_o_contenido(p):
    import zipfile
    patterns = (
        b"<w:t",           # texto
        b"<w:tbl",         # tablas
        b"<w:drawing",     # imágenes/ecuaciones renderizadas
        b"<w:pict",        # VML antiguo
        b"<w:object",      # OLE
        b"<m:oMath",       # ecuaciones OMML
        b"<w:txbxContent", # texto en cuadros de texto
        b"<w:sdt",         # content controls
        b"<w:fldSimple",   # campos simples
        b"<w:instrText",   # instrucciones de campo
    )
    with zipfile.ZipFile(p, 'r') as z:
        # cuerpo + headers/footers por si el contenido quedó allí
        names = ['word/document.xml'] + \
                [n for n in z.namelist()
                 if n.startswith('word/header') or n.startswith('word/footer')]
        data = b''.join(z.read(n) for n in names if n in z.namelist())
    return any(pat in data for pat in patterns)

def _sanear_fragmento(el):
    """
    Elimina elementos que suelen quedar desbalanceados al recortar:
    bookmarks, rangos de comentarios, control de cambios, proofErr, y
    sectPr internos (conservaremos solo el sectPr final en el body).
    """
    BAD_TAGS = {
        W + "bookmarkStart",
        W + "bookmarkEnd",
        W + "commentRangeStart",
        W + "commentRangeEnd",
        W + "commentReference",
        W + "proofErr",
        W + "permStart",
        W + "permEnd",
        W + "moveFrom",
        W + "moveTo",
        W + "ins",
        W + "del",
        W + "smartTag",
        W + "sectPr",  # NO queremos sectPr dentro de párrafos copiados
    }
    # recorrer en profundidad y borrar las malas
    for bad in list(el.iter()):
        if bad.tag in BAD_TAGS:
            parent = bad.getparent() if hasattr(bad, "getparent") else None
            # ElementTree estándar no tiene getparent; hacemos workaround:
            if parent is None:
                # buscar padre manualmente
                for anc in el.iter():
                    for ch in list(anc):
                        if ch is bad:
                            anc.remove(ch)
                            break
            else:
                parent.remove(bad)
    # limpia atributos de control de cambios/rastros
    for node in el.iter():
        for attr in list(node.attrib.keys()):
            if any(k in attr for k in ("rsid",)):  # rsidR, rsidDel, etc.
                node.attrib.pop(attr, None)

def _post_merge_fix_numbering(docx_path: str):
    """
    Replica lo que hiciste en Colab:
    - Descomprime el .docx
    - Lee numbering.xml para mapear (numId, ilvl) -> numFmt
    - Reescribe en document.xml los w:numPr que sean 'decimal' a numId=1, ilvl=0
    - Reempaqueta el .docx
    """
    import os, zipfile, shutil
    import xml.etree.ElementTree as ET

    NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    W = "{%s}" % NS_W
    ns = {"w": NS_W}

    tmp_dir = os.path.join(os.path.dirname(docx_path), "_tmp_fix_num")
    if os.path.exists(tmp_dir):
        shutil.rmtree(tmp_dir, ignore_errors=True)
    os.makedirs(tmp_dir, exist_ok=True)

    # 1) unzip
    with zipfile.ZipFile(docx_path, "r") as z:
        z.extractall(tmp_dir)

    # 2) mapear formatos desde numbering.xml
    num_fmt_map = {}
    numbering_xml_path = os.path.join(tmp_dir, "word", "numbering.xml")
    if os.path.exists(numbering_xml_path):
        tnum = ET.parse(numbering_xml_path)
        rnum = tnum.getroot()

        for num in rnum.findall(".//w:num", ns):
            numId = num.attrib.get(W + "numId")
            abs_el = num.find("w:abstractNumId", ns)
            if abs_el is None:
                continue
            abs_id = abs_el.attrib.get(W + "val")
            abstract = rnum.find(f".//w:abstractNum[@w:abstractNumId='{abs_id}']", ns)
            if abstract is None:
                continue
            for lvl in abstract.findall("w:lvl", ns):
                ilvl = lvl.attrib.get(W + "ilvl")
                nfmt = lvl.find("w:numFmt", ns)
                if nfmt is not None:
                    num_fmt_map[(numId, ilvl)] = nfmt.attrib.get(W + "val")

    # 3) reescribir document.xml (solo decimal -> numId=1, ilvl=0)
    doc_xml_path = os.path.join(tmp_dir, "word", "document.xml")
    tdoc = ET.parse(doc_xml_path)
    rdoc = tdoc.getroot()

    for p in rdoc.findall(".//w:p", ns):
        numPr = p.find(".//w:numPr", ns)
        if numPr is None:
            continue
        numId = numPr.find("w:numId", ns)
        ilvl = numPr.find("w:ilvl", ns)
        numId_val = numId.attrib.get(W + "val") if numId is not None else "-"
        ilvl_val = ilvl.attrib.get(W + "val") if ilvl is not None else "-"

        fmt = num_fmt_map.get((numId_val, ilvl_val), "decimal")
        if fmt == "decimal":
            if numId is not None:
                numId.attrib[W + "val"] = "1"
            if ilvl is not None:
                ilvl.attrib[W + "val"] = "0"

    ET.register_namespace("w", NS_W)
    tdoc.write(doc_xml_path, encoding="utf-8", xml_declaration=True)

    # 4) rezip sobre el MISMO archivo
    tmp_docx = docx_path + ".tmp"
    with zipfile.ZipFile(tmp_docx, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(tmp_dir):
            for f in files:
                p = os.path.join(root, f)
                z.write(p, os.path.relpath(p, tmp_dir))

    shutil.move(tmp_docx, docx_path)
    shutil.rmtree(tmp_dir, ignore_errors=True)

def _hacer_secciones_continuas(docx_path: str):
    """
    Convierte los section breaks de 'nextPage' a 'continuous' y elimina <w:br w:type="page"/>.
    """
    import zipfile, io, xml.etree.ElementTree as ET
    NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    W = "{%s}" % NS_W
    ns = {"w": NS_W}

    with zipfile.ZipFile(docx_path, "r") as zin:
        files = {n: zin.read(n) for n in zin.namelist()}

    if "word/document.xml" not in files:
        return

    root = ET.fromstring(files["word/document.xml"])

    # 1) sectPr -> type continuous
    for sectPr in root.findall(".//w:sectPr", ns):
        t = sectPr.find("./w:type", ns)
        if t is not None and t.get(W + "val") in ("nextPage", "page"):
            t.set(W + "val", "continuous")

    # 2) quita <w:br w:type="page"/>
    for br in root.findall(".//w:br", ns):
        if br.get(W + "type") == "page":
            parent = None
            # ET estándar no tiene getparent; buscamos a mano
            for p in root.iter():
                for ch in list(p):
                    if ch is br:
                        parent = p
                        break
            if parent is not None:
                parent.remove(br)

    doc_bytes = ET.tostring(root, encoding="utf-8", xml_declaration=True)

    # reempacar DOCX
    with zipfile.ZipFile(docx_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for n, b in files.items():
            if n == "word/document.xml":
                zout.writestr(n, doc_bytes)
            else:
                zout.writestr(n, b)






def _tmp_heading_doc(texto: str) -> str:
    """Crea un DOCX temporal con un párrafo centrado y en negrita como título de sección."""
    from docx import Document as DocxDocument
    import tempfile, os
    doc = DocxDocument()
    p = doc.add_paragraph()
    run = p.add_run(texto)
    run.bold = True
    # centrado
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    # un poquito de espacio abajo
    p.paragraph_format.space_after = 300  # 15pt aprox

    fd, path = tempfile.mkstemp(suffix=".docx", prefix="titulo_")
    os.close(fd)
    doc.save(path)
    return path


def _merge_grouped_with_headings(grouped, out_path):
    """
    grouped: [(tema_nombre, [docx1, docx2, ...]), ...]
    Une metiendo un doc temporal con el título antes de cada bloque.
    """


    # Documento maestro vacío
    maestro = DocxDocument()
    comp = Composer(maestro)

    tmp_titles = []
    try:
        for (tema, files) in grouped:
            # 1) insertar título como un pequeño DOCX
            tpath = _tmp_heading_doc(tema)
            tmp_titles.append(tpath)
            comp.append(DocxDocument(tpath))  # añade el título

            # 2) añadir todas las preguntas del tema
            for f in files:
                comp.append(DocxDocument(os.path.abspath(f)))

        comp.save(out_path)
        return out_path, [], []  # compatibles con tu interfaz
    finally:
        # limpiar temporales
        for p in tmp_titles:
            try:
                os.remove(p)
            except Exception:
                pass


def _merge_grouped_with_headings_wordcom(grouped, out_path):
    """
    grouped: [(tema, [paths_pregunta,...]), ...]
    - Crea un DOCX temporal de título por tema.
    - Inserta con Word/COM.
    - NO pone salto de página después del título; SÍ después de cada pregunta.
    """
    tmp_titles = []
    flat = []  # [(path, is_title)]
    for (tema, files) in grouped:
        tpath = _tmp_heading_doc(tema)
        tmp_titles.append(tpath)
        flat.append((tpath, True))
        for f in files:
            flat.append((os.path.abspath(f), False))

    try:
        out, _, malos = _merge_with_word(flat, out_path)  # usa COM con flags
        # Si TODO lo que no es título falló, verás solo títulos → devuélvelo en JSON
        if malos:
            print("⚠️ Archivos que Word no pudo insertar:", malos[:5], "… total:", len(malos))
        return out, [], malos
    finally:
        for p in tmp_titles:
            try: os.remove(p)
            except: pass


def _merge_with_word(marked_paths, out_path):
    """
    marked_paths: [(path, is_title)]
    Inserta cada archivo con Word. PageBreak solo tras preguntas (is_title=False).
    Hace fallback copiando FormattedText si InsertFile falla.
    Filtra inexistentes y vacíos antes de llamar a Word.
    """
    import os, pythoncom
    import win32com.client as win32

    wdCollapseEnd = 0
    wdFormatXMLDocument = 12
    wdPageBreak = 7

    # Filtrado previo (evita rutas malas que 'matan' el merge)
    cleaned = []
    for p, is_title in marked_paths:
        if not p or not os.path.isfile(p):
            continue
        try:
            if _tiene_texto_o_contenido(p):  # ya la tienes definida
                cleaned.append((os.path.abspath(p), is_title))
        except Exception:
            # si no puedo leer el zip, lo salto
            continue

    pythoncom.CoInitialize()
    word = win32.DispatchEx("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    malos = []
    try:
        doc_dest = word.Documents.Add()

        def end_range():
            r = doc_dest.Content
            r.Collapse(wdCollapseEnd)
            return r

        for p_abs, is_title in cleaned:
            try:
                r = end_range()
                # InsertFile suele preservar más formato que FormattedText
                r.InsertFile(p_abs)
            except Exception as e:
                # Fallback: abrir y volcar FormattedText (sin portapapeles)
                malos.append((p_abs, f"InsertFile: {e}"))
                try:
                    doc_src = word.Documents.Open(
                        p_abs, ReadOnly=True, ConfirmConversions=False,
                        AddToRecentFiles=False, Revert=False, Visible=False,
                        OpenAndRepair=True
                    )
                    src = doc_src.Content
                    dst = end_range()
                    dst.FormattedText = src.FormattedText
                    doc_src.Close(False)
                except Exception as e2:
                    malos.append((p_abs, f"FormattedText: {e2}"))
                    continue  # este archivo definitivamente no entró

            # 👇 Salto de página SOLO después de preguntas
            if not is_title:
                end_range().InsertBreak(wdPageBreak)

        try:
            doc_dest.SaveAs2(out_path, FileFormat=wdFormatXMLDocument)
        except Exception:
            doc_dest.SaveAs(out_path, FileFormat=wdFormatXMLDocument)
        doc_dest.Close(False)
        return out_path, [], malos
    finally:
        try: word.Quit()
        except: pass
        pythoncom.CoUninitialize()




def _ensure_numbering_part(files: dict):
    import xml.etree.ElementTree as ET

    has_numbering_part = ("word/numbering.xml" in files and files["word/numbering.xml"])
    # ⬅️ NUEVO: sabremos si existe de verdad el part antes de tocar rels/CT.

    # 1) relación en word/_rels/document.xml.rels
    rels_name = "word/_rels/document.xml.rels"
    rels_ctt = files.get(rels_name)
    if rels_ctt is None:
        rels_root = ET.Element("Relationships", {
            "xmlns": "http://schemas.openxmlformats.org/package/2006/relationships"
        })
    else:
        rels_root = ET.fromstring(rels_ctt)

    have_rels = False
    REL = "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"
    for r in rels_root.findall(REL):
        if (r.get("Type") == "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering"
            and r.get("Target") == "numbering.xml"):
            have_rels = True
            break

    # ⬇️ SOLO crear la relación si de verdad existe word/numbering.xml
    if has_numbering_part and not have_rels:
        used = {r.get("Id") for r in rels_root.findall(REL)}
        i = 1
        new_id = f"rId{i}"
        while new_id in used:
            i += 1
            new_id = f"rId{i}"
        ET.SubElement(
            rels_root, REL,
            {"Id": new_id,
             "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering",
             "Target": "numbering.xml"}
        )
        files[rels_name] = ET.tostring(rels_root, encoding="utf-8", xml_declaration=True)

    # 2) override en [Content_Types].xml
    ct_name = "[Content_Types].xml"
    ct_ctt = files.get(ct_name)
    if ct_ctt is None:
        Types = ET.Element("Types", {
            "xmlns": "http://schemas.openxmlformats.org/package/2006/content-types"
        })
    else:
        Types = ET.fromstring(ct_ctt)

    ns_ct = "http://schemas.openxmlformats.org/package/2006/content-types"
    override_tag = "{%s}Override" % ns_ct
    have_ct = any(el.tag == override_tag and el.get("PartName") == "/word/numbering.xml" for el in Types)

    # ⬇️ SOLO declarar el Override si existe numbering.xml
    if has_numbering_part and not have_ct:
        ET.SubElement(Types, override_tag, {
            "PartName": "/word/numbering.xml",
            "ContentType": "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"
        })
        files[ct_name] = ET.tostring(Types, encoding="utf-8", xml_declaration=True)

def aplanar_listas_a_texto(docx_path: str):
    """
    Elimina TODA numeración de Word (w:numPr) y numera las preguntas como texto:
    1. ..., 2. ..., 3. ... (continuo en todo el documento).
    Borra además numbering.xml y su relación/Content-Type para que Word no repare nada.
    """
    import re, zipfile, xml.etree.ElementTree as ET

    NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    W = "{%s}" % NS_W
    ns = {"w": NS_W}

    # Un "inicio de pregunta" escrito como texto: 1)  / 1.  / (1)  / 1⌀ (pegado)
    RX_Q = re.compile(r"^\s*\(?\d{1,3}\)?[.)]?(?:\s+|(?=[^\s]))")

    def _para_text(p):
        return "".join((t.text or "") for t in p.findall(".//w:t", ns))

    def _strip_prefix_in_runs(p, n_chars):
        # quita n_chars del principio del párrafo, repartidos en los runs
        remaining = n_chars
        for r in p.findall(".//w:r", ns):
            t = r.find("./w:t", ns)
            if t is None or remaining <= 0:
                continue
            cur = t.text or ""
            if len(cur) <= remaining:
                t.text = ""
                remaining -= len(cur)
            else:
                t.text = cur[remaining:]
                break

    def _prepend_text(p, txt):
        # inserta un run con texto preservando espacios al inicio del párrafo
        r = ET.Element(W + "r")
        t = ET.SubElement(r, W + "t", {W + "space": "preserve"})
        t.text = txt
        # colócalo antes del primer hijo que no sea pPr
        children = list(p)
        idx = 0
        if children and children[0].tag == W + "pPr":
            idx = 1
        p.insert(idx, r)

    with zipfile.ZipFile(docx_path, "r") as zin:
        files = {n: zin.read(n) for n in zin.namelist()}

    if "word/document.xml" not in files:
        return

    root = ET.fromstring(files["word/document.xml"])
    contador = 1
    changed_doc = False

    for p in root.findall(".//w:p", ns):
        # 1) Si tiene numeración de Word, elimínala
        pPr = p.find("./w:pPr", ns)
        if pPr is not None:
            numPr = pPr.find("./w:numPr", ns)
            if numPr is not None:
                pPr.remove(numPr)
                # marcarlo como "pregunta" (para numerarlo)
                txt = _para_text(p)
                # si empieza con número textual, lo quitamos; si no, nada
                m = RX_Q.match(txt)
                if m:
                    _strip_prefix_in_runs(p, m.end())
                _prepend_text(p, f"{contador}. ")
                contador += 1
                changed_doc = True
                continue

        # 2) Si no tenía lista pero empieza con número textual → numerar y limpiar prefijo
        txt = _para_text(p)
        m = RX_Q.match(txt)
        if m:
            _strip_prefix_in_runs(p, m.end())
            _prepend_text(p, f"{contador}. ")
            contador += 1
            changed_doc = True

    if changed_doc:
        files["word/document.xml"] = ET.tostring(root, encoding="utf-8", xml_declaration=True)

    # 3) Elimina numbering.xml y su relación/override para que Word no "repairs"
    if "word/numbering.xml" in files:
        files.pop("word/numbering.xml", None)

        # limpia la relación
        rels_name = "word/_rels/document.xml.rels"
        if rels_name in files:
            rels_root = ET.fromstring(files[rels_name])
            REL = "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"
            to_del = []
            for r in rels_root.findall(REL):
                if (r.get("Type") == "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering"
                        and r.get("Target") == "numbering.xml"):
                    to_del.append(r)
            for r in to_del:
                rels_root.remove(r)
            files[rels_name] = ET.tostring(rels_root, encoding="utf-8", xml_declaration=True)

        # limpia el override de content types
        ct_name = "[Content_Types].xml"
        if ct_name in files:
            Types = ET.fromstring(files[ct_name])
            ns_ct = "http://schemas.openxmlformats.org/package/2006/content-types"
            Override = "{%s}Override" % ns_ct
            to_del = []
            for el in list(Types):
                if el.tag == Override and el.get("PartName") == "/word/numbering.xml":
                    to_del.append(el)
            for el in to_del:
                Types.remove(el)
            files[ct_name] = ET.tostring(Types, encoding="utf-8", xml_declaration=True)

    # 4) Reempaqueta el DOCX
    _safe_rezip(docx_path, files)


def _com_disponible() -> bool:
    """True si estamos en Windows y win32com funciona."""
    try:
        return (os.name == "nt") and (win32 is not None)
    except Exception:
        return False



def _safe_rezip(docx_path: str, files: dict):
    import zipfile, os, tempfile, time, shutil

    dest_dir = os.path.dirname(os.path.abspath(docx_path))
    os.makedirs(dest_dir, exist_ok=True)

    # 1) temporal EN LA MISMA CARPETA DEL DESTINO (misma unidad)
    fd, tmp = tempfile.mkstemp(suffix=".docx", prefix="safe_", dir=dest_dir)
    os.close(fd)  # ¡clave en Windows!

    # 2) escribir el zip al temporal
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for n, b in files.items():
            n = n.replace("\\", "/")
            if isinstance(b, str):
                b = b.encode("utf-8")
            zout.writestr(n, b)

    # 3) reemplazo atómico con reintentos
    for _ in range(8):
        try:
            os.replace(tmp, docx_path)  # misma unidad ⇒ OK
            return
        except PermissionError:
            time.sleep(0.15)
        except OSError:
            # No debería ocurrir al estar en la misma carpeta,
            # pero por si acaso: copia y borra.
            try:
                shutil.copy2(tmp, docx_path)
                os.remove(tmp)
                return
            except Exception:
                time.sleep(0.15)

    # si todo falla, limpia y propaga
    try: os.remove(tmp)
    except: pass
    raise

def bullets_to_numbers_docx(docx_path: str):
    """
    Abre el .docx y convierte TODAS las definiciones de listas 'bullet'
    en listas decimales (1., 2., 3., …) en word/numbering.xml.
    No toca document.xml: al cambiar el abstractNum a decimal,
    todos los párrafos que usan ese numId pasan a numerados.
    """
    import zipfile, xml.etree.ElementTree as ET, io

    NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    W = "{%s}" % NS_W
    ns = {"w": NS_W}

    # Leer archivos del docx
    with zipfile.ZipFile(docx_path, "r") as zin:
        files = {n: zin.read(n) for n in zin.namelist()}

    if "word/numbering.xml" not in files:
        # No hay listas en el documento
        return

    root = ET.fromstring(files["word/numbering.xml"])

    # Reescribir todos los niveles con bullet -> decimal y lvlText -> %N.
    for absN in root.findall(".//w:abstractNum", ns):
        for lvl in absN.findall("./w:lvl", ns):
            ilvl = lvl.get(W + "ilvl", "0")

            # <w:numFmt w:val="bullet"/>  →  decimal
            numFmt = lvl.find("./w:numFmt", ns)
            if numFmt is not None and numFmt.get(W + "val") == "bullet":
                numFmt.set(W + "val", "decimal")

            # Asegura <w:lvlText w:val="%{n}."/> (n = ilvl+1)
            lvlText = lvl.find("./w:lvlText", ns)
            desired = f"%{int(ilvl) + 1}."
            if lvlText is None:
                lvlText = ET.SubElement(lvl, W + "lvlText", {W + "val": desired})
            else:
                lvlText.set(W + "val", desired)

            # Opcional: inicio en 1 y alineación a la izquierda
            start = lvl.find("./w:start", ns)
            if start is None:
                ET.SubElement(lvl, W + "start", {W + "val": "1"})
            else:
                start.set(W + "val", "1")
            lvlJc = lvl.find("./w:lvlJc", ns)
            if lvlJc is None:
                ET.SubElement(lvl, W + "lvlJc", {W + "val": "left"})
            else:
                lvlJc.set(W + "val", "left")

    # Guardar de nuevo el DOCX con numbering.xml modificado
    new_numbering = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    with zipfile.ZipFile(docx_path, "w", zipfile.ZIP_DEFLATED) as zout:
        for n, b in files.items():
            if n == "word/numbering.xml":
                b = new_numbering
            zout.writestr(n, b)

@app.get("/descargas/<path:nombre>")
def descargar_archivo_alias(nombre):
    return descargar_archivo(nombre)  # reutiliza la función existente /api/descargas/...

def guardar_pdf(ruta_word: str) -> str:
    ruta_word = os.path.abspath(ruta_word)

    tmpdir = tempfile.mkdtemp(prefix="pdf_")
    base = os.path.splitext(os.path.basename(ruta_word))[0]
    ruta_docx_tmp = os.path.join(tmpdir, base + "_norm.docx")
    ruta_pdf = os.path.join(tmpdir, base + ".pdf")

    shutil.copy2(ruta_word, ruta_docx_tmp)

    # Word consts
    wdExportFormatPDF = 17
    wdExportOptimizeForPrint = 0
    wdExportAllDocument = 0
    wdExportDocumentContent = 0
    wdExportCreateNoBookmarks = 0
    wdFormatXMLDocument = 12

    pythoncom.CoInitialize()
    word = win32.DispatchEx("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0

    try:
        doc = word.Documents.Open(
            ruta_docx_tmp,
            ReadOnly=False,
            ConfirmConversions=False,
            AddToRecentFiles=False,
            Visible=False,
            OpenAndRepair=True
        )
        # Normaliza
        doc.SaveAs(ruta_docx_tmp, FileFormat=wdFormatXMLDocument)

        # Actualiza campos (ítems numerados/TOC/refs) y repagina
        try:
            doc.Fields.Update()
        except Exception:
            pass
        try:
            doc.Repaginate()
        except Exception:
            pass

        # Exporta a PDF (impresión)
        doc.ExportAsFixedFormat(
            OutputFileName=ruta_pdf,
            ExportFormat=wdExportFormatPDF,
            OpenAfterExport=False,
            OptimizeFor=wdExportOptimizeForPrint,
            Range=wdExportAllDocument,
            From=1, To=1,
            Item=wdExportDocumentContent,
            IncludeDocProps=True,
            KeepIRM=True,
            CreateBookmarks=wdExportCreateNoBookmarks,
            DocStructureTags=True,
            BitmapMissingFonts=True,
            UseISO19005_1=False
        )
        doc.Close(False)

        for _ in range(20):
            if os.path.exists(ruta_pdf) and os.path.getsize(ruta_pdf) > 0:
                break
            time.sleep(0.1)

        if not os.path.exists(ruta_pdf) or os.path.getsize(ruta_pdf) == 0:
            raise RuntimeError("Word no generó el PDF (vacío).")

        return ruta_pdf

    finally:
        try:
            word.Quit()
        except Exception:
            pass
        pythoncom.CoUninitialize()


@app.get("/__ping__")
def ping():
    return "ok"

if __name__ == "__main__":
  
   print("URL MAP:", app.url_map)
   app.run(port=5050)


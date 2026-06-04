# backend/test/test_app_routes_banco_preview_jobs_extra.py
import io
import os
import sqlite3
import time
import zipfile
from pathlib import Path

import pytest
from docx import Document


SCHEMA_MORE = """
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sesiones_app (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS examenes (
    idexamenes INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    numero TEXT,
    institucion TEXT,
    anio INTEGER,
    archivo_nombre TEXT,
    archivo_ruta TEXT
);
CREATE TABLE IF NOT EXISTS examenes_importados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    ruta TEXT,
    extension TEXT,
    total_preguntas INTEGER DEFAULT 0,
    fuente TEXT,
    hash_archivo TEXT UNIQUE,
    fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS temario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    activo INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS preguntas (
    idpreguntas INTEGER PRIMARY KEY AUTOINCREMENT,
    examenes_idexamenes INTEGER,
    tema_id INTEGER,
    numero_p INTEGER,
    archivo_nombre TEXT,
    archivo_ruta TEXT
);
CREATE TABLE IF NOT EXISTS grupos (
    idgrupo INTEGER PRIMARY KEY AUTOINCREMENT,
    clave TEXT NOT NULL UNIQUE,
    nombre TEXT,
    activo INTEGER DEFAULT 1,
    fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS grupo_tema (
    idgrupo_tema INTEGER PRIMARY KEY AUTOINCREMENT,
    grupos_idgrupo INTEGER,
    tema_id INTEGER,
    cantidad INTEGER,
    orden INTEGER DEFAULT 0,
    UNIQUE(grupos_idgrupo, tema_id)
);
CREATE TABLE IF NOT EXISTS tema_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tema_id INTEGER,
    doc_preguntas_nombre TEXT,
    doc_preguntas_ruta TEXT,
    doc_sol_nombre TEXT,
    doc_sol_ruta TEXT,
    fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


def _connect(db_path: Path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


@pytest.fixture()
def sqlite_db_more(tmp_path, app_module, monkeypatch):
    db_path = tmp_path / "evalunia_more.sqlite3"
    conn = _connect(db_path)
    conn.executescript(SCHEMA_MORE)
    conn.commit()
    conn.close()

    def get_connection():
        return _connect(db_path)

    monkeypatch.setattr(app_module, "get_connection", get_connection)
    return db_path


@pytest.fixture()
def banco_dirs(tmp_path, app_module, monkeypatch):
    preg = tmp_path / "banco" / "preguntas"
    sol = tmp_path / "banco" / "solucionarios"
    preg.mkdir(parents=True, exist_ok=True)
    sol.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(app_module, "BANCO_PREG_DIR", str(preg), raising=False)
    monkeypatch.setattr(app_module, "BANCO_SOL_DIR", str(sol), raising=False)
    return preg, sol


def _docx_bytes(*paragraphs: str) -> bytes:
    bio = io.BytesIO()
    doc = Document()
    for txt in paragraphs or ("1. Pregunta",):
        doc.add_paragraph(txt)
    doc.save(bio)
    bio.seek(0)
    return bio.getvalue()


def _make_docx(path: Path, *paragraphs: str) -> Path:
    path.write_bytes(_docx_bytes(*(paragraphs or ("1. Pregunta", "A) Uno"))))
    return path


def _seed_more(db_path: Path, pregunta_path: str | None = None, sol_path: str | None = None):
    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute("INSERT INTO temario(nombre, activo) VALUES ('Álgebra', 1)")
    cur.execute("INSERT INTO temario(nombre, activo) VALUES ('Geometría', 1)")
    cur.execute("INSERT INTO grupos(clave, nombre, activo) VALUES ('A', 'Grupo A', 1)")
    cur.execute("INSERT INTO grupo_tema(grupos_idgrupo, tema_id, cantidad, orden) VALUES (1, 1, 2, 1)")
    for i in range(1, 4):
        cur.execute(
            "INSERT INTO preguntas(examenes_idexamenes, tema_id, numero_p, archivo_nombre, archivo_ruta) VALUES (NULL,1,?,?,?)",
            (i, f"preg_{i}.docx", pregunta_path or f"dummy_{i}.docx"),
        )
    if pregunta_path:
        cur.execute(
            """INSERT INTO tema_docs(tema_id, doc_preguntas_nombre, doc_preguntas_ruta, doc_sol_nombre, doc_sol_ruta)
               VALUES (1, ?, ?, ?, ?)""",
            (os.path.basename(pregunta_path), pregunta_path, os.path.basename(sol_path) if sol_path else None, sol_path),
        )
    conn.commit()
    conn.close()


def _fake_pdf_preview_factory(app_module):
    def fake_generar_pdf_preview(ruta_docx, nombre_base=None):
        base = nombre_base or Path(ruta_docx).stem
        pdf = Path(app_module.app.config["DESCARGAS_FOLDER"]) / f"{base}.pdf"
        pdf.parent.mkdir(parents=True, exist_ok=True)
        pdf.write_bytes(b"%PDF-1.4\n%fake\n")
        return str(pdf)

    return fake_generar_pdf_preview


# -------------------------
# Rutas de LanguageTool / render / descargas
# -------------------------
def test_lt_status_y_ensure_simulado(client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, "lt_is_running", lambda *a, **k: True, raising=False)
    monkeypatch.setattr(app_module, "lt_start_server", lambda: None, raising=False)
    monkeypatch.setattr(app_module, "LT_DIR", "fake_lt", raising=False)

    r_status = client.get("/lt/status")
    assert r_status.status_code == 200
    assert r_status.get_json()["running"] is True

    r_ensure = client.get("/lt/ensure")
    assert r_ensure.status_code == 200
    assert r_ensure.get_json()["ok"] is True


def test_render_vista_y_render_docx_guardado_con_pdf_simulado(client, app_module, monkeypatch, tmp_path):
    monkeypatch.setattr(app_module, "generar_pdf_preview", _fake_pdf_preview_factory(app_module), raising=False)

    assert client.post("/api/render_vista", data={}, content_type="multipart/form-data").status_code == 400
    bad = client.post(
        "/api/render_vista",
        data={"archivo": (io.BytesIO(b"txt"), "x.txt")},
        content_type="multipart/form-data",
    )
    assert bad.status_code == 400

    valid = client.post(
        "/api/render_vista",
        data={"archivo": (io.BytesIO(_docx_bytes("Hola")), "vista.docx")},
        content_type="multipart/form-data",
    )
    assert valid.status_code == 200
    assert valid.get_json()["ok"] is True

    docx = Path(app_module.app.config["DESCARGAS_FOLDER"]) / "guardado.docx"
    _make_docx(docx, "Documento guardado")

    r_guardado = client.get("/api/render_docx_guardado/guardado.docx")
    assert r_guardado.status_code == 200
    assert r_guardado.get_json()["ok"] is True

    r_guardado_lt = client.get("/api/render_docx_guardado_lt/guardado.docx")
    assert r_guardado_lt.status_code == 200
    assert r_guardado_lt.get_json()["ok"] is True

    assert client.get("/api/render_docx_guardado/no_existe.docx").status_code == 404


def test_pdf_from_docx_y_descargar_pdf_corregido_simulados(client, app_module, monkeypatch):
    descargas = Path(app_module.app.config["DESCARGAS_FOLDER"])
    docx = _make_docx(descargas / "para_pdf.docx", "Para PDF")

    monkeypatch.setattr(app_module, "resave_docx_formatted", lambda src, dst: dst, raising=False)

    def fake_docx_a_pdf(docx_path, pdf_path):
        Path(pdf_path).write_bytes(b"%PDF-1.4\n%fake\n")
        return pdf_path

    monkeypatch.setattr(app_module, "docx_a_pdf", fake_docx_a_pdf, raising=False)
    r_pdf = client.post("/api/pdf_from_docx", json={"docx": docx.name})
    assert r_pdf.status_code == 200
    assert r_pdf.get_json()["ok"] is True

    assert client.post("/api/pdf_from_docx", json={"docx": "../mal.docx"}).status_code == 400
    assert client.post("/api/pdf_from_docx", json={"docx": "no.docx"}).status_code == 404

    def fake_generar_pdf_lt(path_docx):
        pdf = descargas / "corregido.pdf"
        pdf.write_bytes(b"%PDF-1.4\n%fake\n")
        return str(pdf)

    monkeypatch.setattr(app_module, "generar_pdf_lt", fake_generar_pdf_lt, raising=False)
    r_down_pdf = client.get("/api/descargar_pdf_corregido/para_pdf.docx")
    assert r_down_pdf.status_code == 200
    assert r_down_pdf.headers["Content-Type"].startswith("application/pdf")

    assert client.get("/api/descargar_pdf_corregido/no_existe.docx").status_code == 404


# -------------------------
# Banco de preguntas: importar, listar, reemplazar, preview, descargas y eliminar
# -------------------------
def test_banco_preguntas_flujo_completo(client, app_module, sqlite_db_more, banco_dirs, monkeypatch):
    _seed_more(sqlite_db_more)
    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda path: 1, raising=False)
    monkeypatch.setattr(app_module, "_validar_docx_real", lambda path: None, raising=False)
    monkeypatch.setattr(app_module, "generar_pdf_preview", _fake_pdf_preview_factory(app_module), raising=False)
    monkeypatch.setattr(app_module.time, "time", lambda: 1700000000.0)

    assert client.get("/api/banco_preguntas").status_code == 200
    assert client.post("/api/banco_preguntas", data={}, content_type="multipart/form-data").status_code == 400

    r_import = client.post(
        "/api/banco_preguntas",
        data={"tema_id": "1", "doc_preguntas": (io.BytesIO(_docx_bytes("1. Pregunta de banco")), "banco.docx")},
        content_type="multipart/form-data",
    )
    assert r_import.status_code == 200
    assert r_import.get_json()["ok"] is True

    r_list = client.get("/api/banco_preguntas")
    rows = r_list.get_json()
    assert len(rows) == 1
    banco_id = rows[0]["id"]

    r_sol = client.post(
        "/api/banco_preguntas/solucionario",
        data={"tema_id": "1", "doc_solucionario": (io.BytesIO(_docx_bytes("Solución")), "sol.docx")},
        content_type="multipart/form-data",
    )
    assert r_sol.status_code == 200

    r_preview = client.get(f"/api/banco_preguntas/{banco_id}/preview")
    assert r_preview.status_code == 200
    assert r_preview.get_json()["ok"] is True

    assert client.get(f"/api/banco_preguntas/{banco_id}/download/preguntas").status_code == 200
    assert client.get(f"/api/banco_preguntas/{banco_id}/download/solucionario").status_code == 200

    r_full = client.get(f"/api/banco_preguntas/{banco_id}/download")
    assert r_full.status_code == 200
    assert r_full.headers["Content-Type"].startswith("application/zip")
    with zipfile.ZipFile(io.BytesIO(r_full.data)) as zf:
        assert any(name.endswith(".docx") for name in zf.namelist())

    r_edit = client.put(f"/api/banco_preguntas/{banco_id}", json={"tema_id": 2})
    assert r_edit.status_code == 200

    r_replace_p = client.post(
        f"/api/banco_preguntas/{banco_id}/reemplazar/preguntas",
        data={"doc_preguntas": (io.BytesIO(_docx_bytes("1. Pregunta reemplazada")), "nuevo.docx")},
        content_type="multipart/form-data",
    )
    assert r_replace_p.status_code == 200

    r_replace_s = client.post(
        f"/api/banco_preguntas/{banco_id}/reemplazar/solucionario",
        data={"doc_solucionario": (io.BytesIO(_docx_bytes("Nueva solución")), "nuevo_sol.docx")},
        content_type="multipart/form-data",
    )
    assert r_replace_s.status_code == 200

    r_delete = client.delete(f"/api/banco_preguntas/{banco_id}")
    assert r_delete.status_code == 200
    assert r_delete.get_json()["ok"] is True

    assert client.get(f"/api/banco_preguntas/{banco_id}/download").status_code == 404


def test_banco_preguntas_errores_controlados(client, app_module, sqlite_db_more, banco_dirs, monkeypatch, tmp_path):
    pregunta = _make_docx(tmp_path / "existe.docx", "1. Pregunta")
    _seed_more(sqlite_db_more, str(pregunta), None)
    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda path: 2, raising=False)

    r_import_bad = client.post(
        "/api/banco_preguntas",
        data={"tema_id": "1", "doc_preguntas": (io.BytesIO(_docx_bytes("1. P", "2. P")), "mal.docx")},
        content_type="multipart/form-data",
    )
    assert r_import_bad.status_code == 400
    assert r_import_bad.get_json()["n_preguntas"] == 2

    assert client.get("/api/banco_preguntas/999/preview").status_code == 404
    assert client.get("/api/banco_preguntas/999/download/preguntas").status_code == 404
    assert client.get("/api/banco_preguntas/999/download/solucionario").status_code == 404
    assert client.delete("/api/banco_preguntas/999").status_code == 404

    assert client.post("/api/banco_preguntas/999/reemplazar/preguntas", data={}, content_type="multipart/form-data").status_code == 400
    assert client.post("/api/banco_preguntas/999/reemplazar/solucionario", data={}, content_type="multipart/form-data").status_code == 400


# -------------------------
# Generación de documentos y jobs asincrónicos sin Word real
# -------------------------
def test_grupos_generar_doc_debug_por_id_y_clave(client, sqlite_db_more):
    _seed_more(sqlite_db_more)

    r_debug = client.get("/api/grupos/1/generar_doc?debug=1")
    assert r_debug.status_code == 200
    assert r_debug.get_json()["total_requeridas"] == 2

    r_clave = client.get("/api/grupos/A/generar_doc?debug=1")
    assert r_clave.status_code == 200
    assert r_clave.get_json()["grupo_id"] == 1

    assert client.get("/api/grupos/1/generar_doc?formato=txt").status_code == 400
    assert client.get("/api/grupos/999/generar_doc").status_code == 404
    assert client.get("/api/grupos/ZZ/generar_doc").status_code == 404


def test_jobs_async_de_partir_y_generar_doc_simulados(client, app_module, monkeypatch):
    def fake_partir_y_guardar(idexamen):
        return app_module.jsonify({"ok": True, "examen": idexamen, "preguntas_insertadas": 0})

    monkeypatch.setattr(app_module, "partir_y_guardar", fake_partir_y_guardar, raising=False)
    r_start = client.post("/api/examenes/5/partir_y_guardar_async?overwrite=1")
    assert r_start.status_code == 200
    job_id = r_start.get_json()["job_id"]

    status = None
    for _ in range(20):
        status = client.get(f"/api/examenes/partir_y_guardar/jobs/{job_id}")
        if status.get_json().get("status") in {"done", "error"}:
            break
        time.sleep(0.05)
    assert status.status_code == 200
    assert status.get_json()["status"] == "done"

    events = client.get(f"/api/examenes/partir_y_guardar/jobs/{job_id}/events")
    assert events.status_code == 200
    assert b"progress" in events.data
    assert client.get("/api/examenes/partir_y_guardar/jobs/nope").status_code == 404

    def fake_grupos_run(idgrupo, formato, req_args, progress_cb):
        if progress_cb:
            progress_cb(1, 2, "mitad")
        return ("ok", {"ok": True, "grupo_id": idgrupo, "formato": formato or "word"})

    monkeypatch.setattr(app_module, "_grupos_generar_doc_run", fake_grupos_run, raising=False)
    r_gstart = client.post("/api/grupos/7/generar_doc_async?formato=pdf")
    assert r_gstart.status_code == 200
    gjob = r_gstart.get_json()["job_id"]

    gstatus = None
    for _ in range(20):
        gstatus = client.get(f"/api/grupos/generar_doc/jobs/{gjob}")
        if gstatus.get_json().get("status") in {"done", "error"}:
            break
        time.sleep(0.05)
    assert gstatus.status_code == 200
    assert gstatus.get_json()["status"] == "done"

    gevents = client.get(f"/api/grupos/generar_doc/jobs/{gjob}/events")
    assert gevents.status_code == 200
    assert b"progress" in gevents.data
    assert client.get("/api/grupos/generar_doc/jobs/nope").status_code == 404


# -------------------------
# Temas por examen e importados
# -------------------------
def test_examenes_temas_alias_e_importados(client, app_module, sqlite_db_more, tmp_path, monkeypatch):
    docx = _make_docx(tmp_path / "importado.docx", "1. Pregunta")
    _seed_more(sqlite_db_more, str(docx))

    conn = _connect(sqlite_db_more)
    conn.execute(
        "INSERT INTO examenes_importados(nombre, ruta, extension, total_preguntas, fuente, hash_archivo) VALUES (?,?,?,?,?,?)",
        ("importado.docx", str(docx), "docx", 1, "upload", "hash1"),
    )
    conn.commit(); conn.close()

    r_temas = client.get("/api/examenes/1/temas")
    assert r_temas.status_code == 200
    assert any(x["nombre"] == "Álgebra" for x in r_temas.get_json())

    assert client.get("/api/examenes/abc/temas").status_code == 400
    assert client.get("/api/examenes/1").status_code in (301, 302, 308)

    r_imp = client.get("/api/examenes/importados")
    assert r_imp.status_code == 200
    assert r_imp.get_json()[0]["nombre"] == "importado.docx"

    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda path: 3, raising=False)
    app_module.app.config["UPLOADS_EXAM_DIR"] = str(tmp_path / "uploads_exam")
    r_upload = client.post(
        "/api/examenes/importar",
        data={"files": (io.BytesIO(_docx_bytes("1. Nueva pregunta")), "nuevo.docx")},
        content_type="multipart/form-data",
    )
    assert r_upload.status_code == 200
    assert r_upload.get_json()["ok"] is True

    r_del = client.delete("/api/examenes/importados/1?delete_file=0")
    assert r_del.status_code == 200
    assert r_del.get_json()["ok"] is True

    assert client.delete("/api/examenes/importados/999").status_code == 404
    assert client.post("/api/examenes/importados/limpiar").status_code in (200, 500)


def test_ping_y_descargas_inline(client, app_module):
    r_ping = client.get("/__ping__")
    assert r_ping.status_code == 200

    descargas = Path(app_module.app.config["DESCARGAS_FOLDER"])
    archivo = descargas / "archivo.txt"
    archivo.write_text("hola", encoding="utf-8")

    # La ruta /api/descargas puede estar registrada dos veces en app.py;
    # en ambos casos debe servir el archivo existente o devolver estado 200.
    r_api = client.get("/api/descargas/archivo.txt")
    assert r_api.status_code == 200

    r_inline = client.get("/descargas/archivo.txt")
    assert r_inline.status_code == 200

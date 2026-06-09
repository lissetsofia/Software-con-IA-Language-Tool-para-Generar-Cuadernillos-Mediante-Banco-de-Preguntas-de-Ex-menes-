import io
import os
import sqlite3
from pathlib import Path

from docx import Document


def _connect(db_path):
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _make_docx(path, text="Documento"):
    doc = Document()
    doc.add_paragraph(text)
    doc.save(path)
    return path


def test_pdf_from_docx_render_guardado_y_descargas(client, app_module, tmp_path, monkeypatch):
    desc = tmp_path / "descargas"; desc.mkdir(exist_ok=True)
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(desc))
    monkeypatch.setattr(app_module, "DESCARGAS_DIR", str(desc), raising=False)

    docx = _make_docx(desc / "salida.docx", "Documento para convertir")

    assert client.post("/api/pdf_from_docx", json={}).status_code == 400
    assert client.post("/api/pdf_from_docx", json={"docx": "../salida.docx"}).status_code == 400
    assert client.post("/api/pdf_from_docx", json={"docx": "no.docx"}).status_code == 404

    monkeypatch.setattr(app_module, "resave_docx_formatted", lambda src, dst: Path(dst).write_bytes(Path(src).read_bytes()) or dst, raising=False)

    def fake_docx_a_pdf(src, dst):
        Path(dst).write_bytes(b"%PDF-1.4\nPDF COV16\n")
        return dst

    monkeypatch.setattr(app_module, "docx_a_pdf", fake_docx_a_pdf, raising=False)
    r_ok = client.post("/api/pdf_from_docx", json={"docx": "salida.docx"})
    assert r_ok.status_code == 200
    assert r_ok.get_json()["ruta_rel_pdf"] == "/api/descargas/salida.pdf"

    monkeypatch.setattr(app_module, "generar_pdf_preview", lambda path, nombre_base=None: fake_docx_a_pdf(path, str(desc / f"{nombre_base}.pdf")), raising=False)
    r_render = client.get("/api/render_docx_guardado/salida.docx")
    assert r_render.status_code == 200
    assert r_render.get_json()["ok"] is True

    r_dl = client.get("/api/descargas/salida.pdf")
    assert r_dl.status_code == 200
    assert r_dl.data.startswith(b"%PDF")

    r_invalid_name = client.get("/api/descargas/carpeta/archivo.pdf")
    assert r_invalid_name.status_code in (400, 404)


def test_banco_routes_extra_preview_downloads_y_reemplazos(client, app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov16_banco.sqlite3"
    preg_dir = tmp_path / "banco_preg"; preg_dir.mkdir()
    sol_dir = tmp_path / "banco_sol"; sol_dir.mkdir()
    pregunta = _make_docx(preg_dir / "pregunta.docx", "1. Pregunta única")
    sol = _make_docx(sol_dir / "sol.docx", "Solución")
    conn = _connect(db_path)
    conn.executescript(
        """
        CREATE TABLE temario(id INTEGER PRIMARY KEY, nombre TEXT, activo INTEGER DEFAULT 1);
        CREATE TABLE tema_docs(id INTEGER PRIMARY KEY AUTOINCREMENT, tema_id INTEGER, doc_preguntas_nombre TEXT, doc_preguntas_ruta TEXT, doc_sol_nombre TEXT, doc_sol_ruta TEXT, fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE preguntas(idpreguntas INTEGER PRIMARY KEY AUTOINCREMENT, examenes_idexamenes INTEGER, tema_id INTEGER, numero_p INTEGER, archivo_nombre TEXT, archivo_ruta TEXT);
        """
    )
    conn.execute("INSERT INTO temario(id,nombre,activo) VALUES(1,'Álgebra',1)")
    conn.execute("INSERT INTO tema_docs(id,tema_id,doc_preguntas_nombre,doc_preguntas_ruta,doc_sol_nombre,doc_sol_ruta) VALUES(1,1,'pregunta.docx',?,?,?)", (str(pregunta), "sol.docx", str(sol)))
    conn.execute("INSERT INTO preguntas(examenes_idexamenes,tema_id,numero_p,archivo_nombre,archivo_ruta) VALUES(NULL,1,1,'pregunta.docx',?)", (str(pregunta),))
    conn.commit(); conn.close()

    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path), raising=False)
    monkeypatch.setattr(app_module, "BANCO_PREG_DIR", str(preg_dir), raising=False)
    monkeypatch.setattr(app_module, "BANCO_SOL_DIR", str(sol_dir), raising=False)
    desc = tmp_path / "desc"; desc.mkdir()
    monkeypatch.setattr(app_module, "DESCARGAS_DIR", str(desc), raising=False)
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(desc))
    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda p: 1, raising=False)
    monkeypatch.setattr(app_module, "_validar_docx_real", lambda p: None, raising=False)

    def fake_preview(src, nombre_base=None):
        pdf = desc / f"{nombre_base or 'preview'}.pdf"
        pdf.write_bytes(b"%PDF-1.4\npreview")
        return str(pdf)

    monkeypatch.setattr(app_module, "generar_pdf_preview", fake_preview, raising=False)

    assert client.get("/api/banco_preguntas").status_code == 200
    prev = client.get("/api/banco_preguntas/1/preview")
    assert prev.status_code == 200
    assert prev.get_json()["tiene_solucionario"] is True
    assert client.get("/api/banco_preguntas/999/preview").status_code == 404

    assert client.get("/api/banco_preguntas/1/download/preguntas").status_code == 200
    assert client.get("/api/banco_preguntas/1/download/solucionario").status_code == 200
    full = client.get("/api/banco_preguntas/1/download")
    assert full.status_code == 200
    assert full.headers["Content-Type"].startswith("application/zip")

    # Editar tema, reemplazar solucionario y eliminar registro con borrado físico.
    assert client.put("/api/banco_preguntas/1", json={"tema_id": 1}).status_code == 200
    repl_sol = client.post(
        "/api/banco_preguntas/1/reemplazar/solucionario",
        data={"doc_solucionario": (io.BytesIO(sol.read_bytes()), "nuevo_sol.docx")},
        content_type="multipart/form-data",
    )
    assert repl_sol.status_code == 200

    delete = client.delete("/api/banco_preguntas/1")
    assert delete.status_code == 200
    assert delete.get_json()["ok"] is True
    assert client.delete("/api/banco_preguntas/999").status_code == 404

# backend/test/test_app_html_importados_cov7.py
import io
import os
import sqlite3
from pathlib import Path

from docx import Document as DocxDocument


def _connect(db_path: Path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov7_importados.sqlite3"

    def get_connection():
        return _connect(db_path)

    monkeypatch.setattr(app_module, "get_connection", get_connection)
    return db_path


def _schema(app_module):
    conn = app_module.get_connection(); cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS examenes_importados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            ruta TEXT,
            extension TEXT,
            total_preguntas INTEGER DEFAULT 0,
            fuente TEXT,
            hash_archivo TEXT UNIQUE,
            fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit(); cur.close(); conn.close()


def _make_docx(path: Path, text="Hola mundo"):
    doc = DocxDocument()
    doc.add_paragraph(text)
    doc.save(path)
    return path


def test_html_helpers_mammoth_utf8_y_wait(app_module, tmp_path, monkeypatch):
    html = tmp_path / "word.htm"
    html.write_bytes('<html><head><meta charset=windows-1252></head><body>á</body></html>'.encode("cp1252"))
    app_module._force_utf8_html(str(html))
    txt = html.read_text(encoding="utf-8")
    assert "charset=utf-8" in txt.lower() or 'charset="utf-8"' in txt.lower()

    app_module._postprocess_word_html(str(html))
    txt2 = html.read_text(encoding="utf-8")
    assert "img" in txt2 and "body" in txt2

    assert app_module._wait_exists_nonzero(str(html), tries=1, delay=0) is True
    assert app_module._wait_exists_nonzero(str(tmp_path / "missing.htm"), tries=1, delay=0) is False

    docx = _make_docx(tmp_path / "mammoth.docx", "Texto para mammoth")
    down = tmp_path / "descargas"
    down.mkdir()
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(down))
    html_out = app_module._preview_with_mammoth(str(docx), "preview_cov7")
    assert os.path.exists(html_out)
    assert "Texto para mammoth" in Path(html_out).read_text(encoding="utf-8")

    previews = tmp_path / "previews"
    previews.mkdir()
    monkeypatch.setattr(app_module, "PREVIEWS_DIR", str(previews), raising=False)
    html2, warnings = app_module._exportar_html_con_mammoth(str(docx), "base cov7")
    assert os.path.exists(html2)
    assert isinstance(warnings, list)


def test_docx_a_html_filtrado_error_y_serve_static_descargas(client, app_module, tmp_path, monkeypatch):
    docx = _make_docx(tmp_path / "html.docx")
    monkeypatch.setattr(app_module.win32, "DispatchEx", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("sin word")))
    html_abs, html_rel = app_module.docx_a_html_filtrado(str(docx), str(tmp_path / "out_html"))
    assert html_abs is None and html_rel is None

    static_dir = tmp_path / "static_cov7"
    static_dir.mkdir()
    (static_dir / "ok.txt").write_text("static", encoding="utf-8")
    monkeypatch.setattr(app_module, "STATIC_DIR", str(static_dir), raising=False)
    # Flask sirve /static desde app.static_folder, no desde la variable STATIC_DIR
    monkeypatch.setattr(app_module.app, "static_folder", str(static_dir), raising=False)
    assert client.get("/static/ok.txt").status_code == 200

    down = tmp_path / "down_cov7"
    down.mkdir()
    (down / "a.pdf").write_bytes(b"%PDF-1.4\n%%EOF")
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(down))
    assert client.get("/descargas/a.pdf").status_code == 200


def test_examenes_importados_crud_extra(client, app_module, tmp_path, monkeypatch):
    _patch_db(app_module, tmp_path, monkeypatch)
    _schema(app_module)
    upload_dir = tmp_path / "uploads_examenes"
    upload_dir.mkdir()
    monkeypatch.setitem(app_module.app.config, "UPLOADS_EXAM_DIR", str(upload_dir))
    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda *_a, **_k: 7)

    assert client.open("/api/examenes/importar", method="OPTIONS").status_code == 204
    assert client.post("/api/examenes/importar", data={}, content_type="multipart/form-data").status_code == 400

    r_bad = client.post(
        "/api/examenes/importar",
        data={"files": (io.BytesIO(b"bad"), "mal.exe")},
        content_type="multipart/form-data",
    )
    assert r_bad.status_code == 415

    docx = _make_docx(tmp_path / "examen.docx")
    r_ok = client.post(
        "/api/examenes/importar",
        data={"files": (io.BytesIO(docx.read_bytes()), "examen.docx")},
        content_type="multipart/form-data",
    )
    assert r_ok.status_code == 200
    data = r_ok.get_json()
    assert data["ok"] is True
    exam_id = data["items"][0]["id"]

    listado = client.get("/api/examenes/importados")
    assert listado.status_code == 200
    assert any(x["id"] == exam_id for x in listado.get_json())

    assert client.delete("/api/examenes/importados/999999").status_code == 404
    assert client.delete(f"/api/examenes/importados/{exam_id}?delete_file=0").status_code == 200

    # Inserta uno con archivo físico para cubrir borrado de archivo.
    archivo = upload_dir / "borrar.pdf"
    archivo.write_bytes(b"%PDF-1.4\n%%EOF")
    conn = app_module.get_connection(); cur = conn.cursor()
    cur.execute(
        "INSERT INTO examenes_importados (nombre, ruta, extension, total_preguntas, fuente, hash_archivo) VALUES (?, ?, ?, ?, ?, ?)",
        ("borrar.pdf", str(archivo), "pdf", 0, "upload", "hash_cov7_delete"),
    )
    delete_id = int(cur.lastrowid)
    conn.commit(); cur.close(); conn.close()

    assert client.delete(f"/api/examenes/importados/{delete_id}").status_code == 200
    assert not archivo.exists()


def test_ext_hash_short_and_ping(client, app_module, tmp_path):
    f = tmp_path / "hash.txt"
    f.write_text("abc", encoding="utf-8")
    assert app_module.sha256sum(str(f))
    assert app_module._ext_ok("a.docx") is True
    assert app_module._ext_ok("a.exe") is False
    assert os.path.isabs(app_module._short83(str(f)))
    assert client.get("/__ping__").status_code == 200

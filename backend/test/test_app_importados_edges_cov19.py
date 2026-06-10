import io
import os
import sqlite3
import zipfile
from pathlib import Path

from docx import Document


def _connect(db_path):
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov19_importados.sqlite3"
    if db_path.exists():
        db_path.unlink()
    conn = _connect(db_path)
    conn.executescript("""
        CREATE TABLE examenes_importados(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            ruta TEXT,
            extension TEXT,
            total_preguntas INTEGER,
            fuente TEXT,
            hash_archivo TEXT UNIQUE,
            fecha_creacion TEXT DEFAULT '2025-01-01'
        );
    """)
    conn.commit(); conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path), raising=False)
    up = tmp_path / "uploads_importados"
    up.mkdir(exist_ok=True)
    monkeypatch.setitem(app_module.app.config, "UPLOADS_EXAM_DIR", str(up))
    return db_path, up


def _docx_bytes(text="1. Pregunta"):
    bio = io.BytesIO()
    doc = Document(); doc.add_paragraph(text); doc.save(bio); bio.seek(0)
    return bio


def test_api_examenes_importar_options_validaciones_y_sin_db(client, app_module, tmp_path, monkeypatch):
    r_opt = client.open("/api/examenes/importar", method="OPTIONS")
    assert r_opt.status_code == 204

    r_empty = client.post("/api/examenes/importar", data={}, content_type="multipart/form-data")
    assert r_empty.status_code == 400

    monkeypatch.setitem(app_module.app.config, "UPLOADS_EXAM_DIR", "")
    r_no_cfg = client.post(
        "/api/examenes/importar",
        data={"files": (io.BytesIO(b"x"), "a.docx")},
        content_type="multipart/form-data",
    )
    assert r_no_cfg.status_code == 500

    _patch_db(app_module, tmp_path, monkeypatch)
    r_ext = client.post(
        "/api/examenes/importar",
        data={"files": (io.BytesIO(b"x"), "a.txt")},
        content_type="multipart/form-data",
    )
    assert r_ext.status_code == 415

    # Rama sin conexión DB: debe guardar y devolver item con id None.
    monkeypatch.setattr(app_module, "get_connection", lambda: (_ for _ in ()).throw(RuntimeError("db off")), raising=False)
    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda *_a, **_k: 7, raising=False)
    r_sin_db = client.post(
        "/api/examenes/importar",
        data={"files": (_docx_bytes(), "sin_db.docx")},
        content_type="multipart/form-data",
    )
    assert r_sin_db.status_code == 200
    assert r_sin_db.get_json()["items"][0]["id"] is None


def test_api_examenes_importar_count_error_y_listar_db_error(client, app_module, tmp_path, monkeypatch):
    db_path, _ = _patch_db(app_module, tmp_path, monkeypatch)
    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("contador falla")), raising=False)
    r = client.post(
        "/api/examenes/importar",
        data={"files": (_docx_bytes(), "contador.docx")},
        content_type="multipart/form-data",
    )
    assert r.status_code == 200
    assert r.get_json()["items"][0]["total_preguntas"] == 0

    r_list = client.get("/api/examenes/importados")
    assert r_list.status_code == 200
    assert isinstance(r_list.get_json(), list)

    monkeypatch.setattr(app_module, "get_connection", lambda: (_ for _ in ()).throw(RuntimeError("db rota")), raising=False)
    r_err = client.get("/api/examenes/importados")
    assert r_err.status_code == 500
    assert r_err.get_json()["ok"] is False


def test_contar_preguntas_docx_errores_y_sha_helpers(app_module, tmp_path):
    nozip = tmp_path / "nozip.docx"
    nozip.write_text("x", encoding="utf-8")
    assert app_module._contar_preguntas_docx(str(nozip)) == 0

    missing = tmp_path / "missing.docx"
    with zipfile.ZipFile(missing, "w") as z:
        z.writestr("word/numbering.xml", "<bad")
    assert app_module._contar_preguntas_docx(str(missing)) == 0

    bad_numbering = tmp_path / "bad_numbering.docx"
    with zipfile.ZipFile(bad_numbering, "w") as z:
        z.writestr("word/document.xml", "<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'><w:body/></w:document>")
        z.writestr("word/numbering.xml", "<bad")
    assert app_module._contar_preguntas_docx(str(bad_numbering)) == 0

    f = tmp_path / "hash.bin"
    f.write_bytes(b"abc")
    assert len(app_module.sha256sum(str(f))) == 64
    assert app_module._ext_ok("x.docx") is True
    assert app_module._ext_ok("x.exe") is False
    assert os.path.isabs(app_module._short_path(str(f)))

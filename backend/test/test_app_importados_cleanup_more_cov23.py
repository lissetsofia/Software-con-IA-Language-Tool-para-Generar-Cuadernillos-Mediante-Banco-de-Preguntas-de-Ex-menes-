import io
import os
import sqlite3


def _connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _patch_cleanup_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov23_importados.sqlite3"
    if db_path.exists():
        db_path.unlink()
    base = tmp_path / "imports"
    base.mkdir()
    saved = base / "guardado.docx"
    saved.write_bytes(b"docx")
    loose = base / "suelto.pdf"
    loose.write_bytes(b"pdf")
    conn = _connect(db_path)
    conn.executescript("""
        CREATE TABLE examenes_importados(id INTEGER PRIMARY KEY, nombre TEXT, ruta TEXT, extension TEXT, total_preguntas INTEGER, fuente TEXT, hash_archivo TEXT, fecha_creacion TEXT DEFAULT '2025');
        CREATE TABLE claves_respuesta(id INTEGER PRIMARY KEY, examen_id INTEGER);
        CREATE TABLE claves_respuesta_detalle(id INTEGER PRIMARY KEY, claves_respuesta_id INTEGER);
        CREATE TABLE claves_tipo(id INTEGER PRIMARY KEY, examen_id INTEGER);
    """)
    conn.execute("INSERT INTO examenes_importados(id,nombre,ruta,extension,total_preguntas,fuente,hash_archivo) VALUES(1,'guardado.docx',?,'docx',1,'upload','h')", (str(saved),))
    conn.execute("INSERT INTO claves_respuesta(id,examen_id) VALUES(10,1)")
    conn.execute("INSERT INTO claves_respuesta_detalle(id,claves_respuesta_id) VALUES(20,10)")
    conn.execute("INSERT INTO claves_tipo(id,examen_id) VALUES(30,1)")
    conn.commit(); conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path))
    monkeypatch.setitem(app_module.app.config, "UPLOADS_EXAM_DIR", str(base))
    return db_path, base, saved, loose


def test_api_examenes_importar_fallback_sin_db_y_validaciones(client, app_module, tmp_path, monkeypatch):
    base = tmp_path / "uploads_importados"
    base.mkdir()
    monkeypatch.setitem(app_module.app.config, "UPLOADS_EXAM_DIR", str(base))

    assert client.open("/api/examenes/importar", method="OPTIONS").status_code == 204
    assert client.post("/api/examenes/importar", data={}, content_type="multipart/form-data").status_code == 400

    monkeypatch.setattr(app_module, "get_connection", lambda: (_ for _ in ()).throw(RuntimeError("sin db")))
    bad = client.post(
        "/api/examenes/importar",
        data={"files": (io.BytesIO(b"x"), "mal.exe")},
        content_type="multipart/form-data",
    )
    assert bad.status_code == 415

    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda _p: (_ for _ in ()).throw(RuntimeError("no contar")))
    ok = client.post(
        "/api/examenes/importar",
        data={"files": (io.BytesIO(b"docx"), "examen.docx")},
        content_type="multipart/form-data",
    )
    assert ok.status_code == 200
    item = ok.get_json()["items"][0]
    assert item["id"] is None
    assert item["total_preguntas"] == 0


def test_limpiar_examenes_importados_borra_db_y_archivos(client, app_module, tmp_path, monkeypatch):
    db_path, base, saved, loose = _patch_cleanup_db(app_module, tmp_path, monkeypatch)

    app_module._CLEANUP_IMPORTADOS_RUNNING = True
    assert app_module.limpiar_examenes_importados(force=False) is True
    app_module._CLEANUP_IMPORTADOS_RUNNING = False

    assert app_module.limpiar_examenes_importados(force=True) is True
    assert not saved.exists()
    assert not loose.exists()
    conn = _connect(db_path)
    assert conn.execute("SELECT COUNT(*) FROM examenes_importados").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM claves_respuesta").fetchone()[0] == 0
    conn.close()

    assert client.post("/api/examenes/importados/limpiar").status_code == 200

    monkeypatch.setattr(app_module, "limpiar_examenes_importados", lambda force=False: (_ for _ in ()).throw(RuntimeError("boom")))
    assert client.post("/api/examenes/importados/limpiar").status_code == 500

import os
import sqlite3


def _db(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.executescript("""
    CREATE TABLE IF NOT EXISTS examenes_importados(id INTEGER PRIMARY KEY, ruta TEXT);
    CREATE TABLE IF NOT EXISTS claves_respuesta(id INTEGER PRIMARY KEY, examen_id INTEGER);
    CREATE TABLE IF NOT EXISTS claves_respuesta_detalle(id INTEGER PRIMARY KEY, claves_respuesta_id INTEGER);
    CREATE TABLE IF NOT EXISTS claves_tipo(id INTEGER PRIMARY KEY, examen_id INTEGER);
    """)
    conn.commit()
    return conn


def test_limpiar_examenes_importados_borra_bd_y_archivos(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "imp.db"
    upload_dir = tmp_path / "uploads"; upload_dir.mkdir()
    f1 = upload_dir / "uno.docx"; f1.write_text("x", encoding="utf-8")
    f2 = upload_dir / "dos.docx"; f2.write_text("x", encoding="utf-8")

    conn = _db(db_path)
    cur = conn.cursor()
    cur.execute("INSERT INTO examenes_importados(id, ruta) VALUES(?,?)", (1, str(f1)))
    cur.execute("INSERT INTO claves_respuesta(id, examen_id) VALUES(?,?)", (10, 1))
    cur.execute("INSERT INTO claves_respuesta_detalle(id, claves_respuesta_id) VALUES(?,?)", (100, 10))
    cur.execute("INSERT INTO claves_tipo(id, examen_id) VALUES(?,?)", (20, 1))
    conn.commit(); conn.close()

    monkeypatch.setattr(app_module, "get_connection", lambda: _db(db_path))
    monkeypatch.setitem(app_module.app.config, "UPLOADS_EXAM_DIR", str(upload_dir))
    app_module._CLEANUP_IMPORTADOS_RUNNING = False

    assert app_module.limpiar_examenes_importados(force=True) is True
    assert not f1.exists() and not f2.exists()
    conn = _db(db_path)
    assert conn.execute("SELECT COUNT(*) FROM examenes_importados").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM claves_respuesta").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM claves_tipo").fetchone()[0] == 0
    conn.close()

    app_module._CLEANUP_IMPORTADOS_RUNNING = True
    assert app_module.limpiar_examenes_importados(force=False) is True
    app_module._CLEANUP_IMPORTADOS_RUNNING = False


def test_limpiar_examenes_importados_ramas_error_y_signal(app_module, tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "get_connection", lambda: (_ for _ in ()).throw(RuntimeError("db rota")))
    monkeypatch.setitem(app_module.app.config, "UPLOADS_EXAM_DIR", str(tmp_path / "no_existe"))
    app_module._CLEANUP_IMPORTADOS_RUNNING = False
    assert app_module.limpiar_examenes_importados(force=True) is True

    calls = []
    monkeypatch.setattr(app_module, "limpiar_examenes_importados", lambda force=False: calls.append(force) or True)
    app_module._cleanup_importados_on_exit()
    assert calls[-1] is True

    try:
        app_module._cleanup_importados_on_signal(2, None)
    except SystemExit:
        pass
    assert calls[-1] is True

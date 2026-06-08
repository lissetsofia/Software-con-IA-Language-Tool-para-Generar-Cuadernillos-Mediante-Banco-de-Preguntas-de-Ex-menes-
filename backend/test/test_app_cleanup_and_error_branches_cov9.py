# backend/test/test_app_cleanup_and_error_branches_cov9.py
import os
import sqlite3
from pathlib import Path


def _connect(db_path: Path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov9_cleanup.sqlite3"

    def get_connection():
        return _connect(db_path)

    monkeypatch.setattr(app_module, "get_connection", get_connection)
    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute("CREATE TABLE IF NOT EXISTS examenes_importados (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, ruta TEXT)")
    cur.execute("CREATE TABLE IF NOT EXISTS claves_tipo (id INTEGER PRIMARY KEY AUTOINCREMENT, examen_id INTEGER)")
    cur.execute("CREATE TABLE IF NOT EXISTS claves_respuesta (id INTEGER PRIMARY KEY AUTOINCREMENT, examen_id INTEGER)")
    cur.execute("CREATE TABLE IF NOT EXISTS claves_respuesta_detalle (id INTEGER PRIMARY KEY AUTOINCREMENT, claves_respuesta_id INTEGER)")
    conn.commit(); cur.close(); conn.close()
    return db_path


def test_limpiar_examenes_importados_borra_bd_archivos_y_carpeta(client, app_module, tmp_path, monkeypatch):
    db_path = _patch_db(app_module, tmp_path, monkeypatch)

    upload_dir = tmp_path / "uploads_examenes"
    upload_dir.mkdir()
    extra = upload_dir / "extra.docx"
    extra.write_bytes(b"x")
    monkeypatch.setitem(app_module.app.config, "UPLOADS_EXAM_DIR", str(upload_dir))

    f1 = tmp_path / "ex1.docx"; f1.write_bytes(b"1")
    f2 = tmp_path / "ex2.pdf"; f2.write_bytes(b"2")

    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute("INSERT INTO examenes_importados (nombre, ruta) VALUES ('ex1', ?)", (str(f1),))
    ex1 = int(cur.lastrowid)
    cur.execute("INSERT INTO examenes_importados (nombre, ruta) VALUES ('ex2', ?)", (str(f2),))
    ex2 = int(cur.lastrowid)
    cur.execute("INSERT INTO claves_tipo (examen_id) VALUES (?)", (ex1,))
    cur.execute("INSERT INTO claves_respuesta (examen_id) VALUES (?)", (ex1,))
    cr = int(cur.lastrowid)
    cur.execute("INSERT INTO claves_respuesta_detalle (claves_respuesta_id) VALUES (?)", (cr,))
    conn.commit(); cur.close(); conn.close()

    assert app_module.limpiar_examenes_importados(force=True) is True
    assert not f1.exists() and not f2.exists() and not extra.exists()

    conn = _connect(db_path)
    assert conn.execute("SELECT COUNT(*) FROM examenes_importados").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM claves_tipo").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM claves_respuesta").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM claves_respuesta_detalle").fetchone()[0] == 0
    conn.close()

    r = client.post("/api/examenes/importados/limpiar")
    assert r.status_code == 200
    assert r.get_json()["ok"] is True


def test_limpiar_examenes_importados_guardas_y_errores(client, app_module, tmp_path, monkeypatch):
    # Rama de proceso ya corriendo.
    monkeypatch.setattr(app_module, "_CLEANUP_IMPORTADOS_RUNNING", True, raising=False)
    assert app_module.limpiar_examenes_importados(force=False) is True
    monkeypatch.setattr(app_module, "_CLEANUP_IMPORTADOS_RUNNING", False, raising=False)

    # _safe_remove_file no propaga errores.
    f = tmp_path / "no_borra.txt"
    f.write_text("x", encoding="utf-8")
    monkeypatch.setattr(app_module.os, "remove", lambda *_a, **_k: (_ for _ in ()).throw(PermissionError("bloqueado")))
    app_module._safe_remove_file(str(f))

    # Error de BD dentro de limpiar_examenes_importados queda controlado.
    monkeypatch.setattr(app_module, "get_connection", lambda: (_ for _ in ()).throw(RuntimeError("db caída")), raising=False)
    assert app_module.limpiar_examenes_importados(force=True) is True

    # Ruta con excepción controlada.
    monkeypatch.setattr(app_module, "limpiar_examenes_importados", lambda force=True: (_ for _ in ()).throw(RuntimeError("limpieza rota")), raising=False)
    r = client.post("/api/examenes/importados/limpiar")
    assert r.status_code == 500
    assert "limpieza rota" in r.get_json()["error"]


def test_cleanup_signal_exit(app_module, monkeypatch):
    called = {"n": 0}

    def fake_clean(force=True):
        called["n"] += 1
        return True

    monkeypatch.setattr(app_module, "limpiar_examenes_importados", fake_clean, raising=False)
    app_module._cleanup_importados_on_exit()
    assert called["n"] == 1

    try:
        app_module._cleanup_importados_on_signal(15, None)
        assert False, "Debió lanzar SystemExit"
    except SystemExit:
        pass
    assert called["n"] == 2

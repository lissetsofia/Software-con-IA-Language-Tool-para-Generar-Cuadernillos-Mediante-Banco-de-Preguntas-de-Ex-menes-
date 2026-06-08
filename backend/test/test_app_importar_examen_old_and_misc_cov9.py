# backend/test/test_app_importar_examen_old_and_misc_cov9.py
import io
import os
import sqlite3
from pathlib import Path


def _connect(db_path: Path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov9_importar_old.sqlite3"

    def get_connection():
        return _connect(db_path)

    monkeypatch.setattr(app_module, "get_connection", get_connection)
    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS examenes (
            idexamenes INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            numero TEXT,
            institucion TEXT,
            anio INTEGER,
            archivo_nombre TEXT,
            archivo_ruta TEXT
        )
    """)
    cur.execute("CREATE TABLE IF NOT EXISTS sesiones_app (token TEXT PRIMARY KEY, username TEXT)")
    conn.commit()
    cur.close()
    conn.close()
    return db_path


def test_importar_examen_antiguo_validaciones_exito_y_duplicado(client, app_module, tmp_path, monkeypatch):
    db_path = _patch_db(app_module, tmp_path, monkeypatch)
    upload = tmp_path / "uploads_old"
    upload.mkdir()
    monkeypatch.setitem(app_module.app.config, "UPLOAD_FOLDER", str(upload))

    assert client.post("/api/importar_examen", data={}, content_type="multipart/form-data").status_code == 400

    r_bad_name = client.post(
        "/api/importar_examen",
        data={"archivo": (io.BytesIO(b"docx"), "nombre_malo.docx")},
        content_type="multipart/form-data",
    )
    assert r_bad_name.status_code == 400

    r_ok = client.post(
        "/api/importar_examen",
        data={"archivo": (io.BytesIO(b"docx"), "examen ordinario I UNAMBA 2025.docx")},
        content_type="multipart/form-data",
    )
    assert r_ok.status_code == 200
    assert r_ok.get_json()["exito"] is True

    # El mismo nombre debe activar la rama de duplicado.
    r_dup = client.post(
        "/api/importar_examen",
        data={"archivo": (io.BytesIO(b"docx"), "examen ordinario I UNAMBA 2025.docx")},
        content_type="multipart/form-data",
    )
    assert r_dup.status_code == 400
    assert "Ya se ha importado" in r_dup.get_json()["error"]

    conn = _connect(db_path)
    count = conn.execute("SELECT COUNT(*) FROM examenes").fetchone()[0]
    conn.close()
    assert count == 1


def test_importar_examen_antiguo_error_bd_y_probar_conexion(client, app_module, tmp_path, monkeypatch):
    upload = tmp_path / "uploads_old_error"
    upload.mkdir()
    monkeypatch.setitem(app_module.app.config, "UPLOAD_FOLDER", str(upload))

    monkeypatch.setattr(app_module, "get_connection", lambda: (_ for _ in ()).throw(RuntimeError("db mala")))
    r = client.post(
        "/api/importar_examen",
        data={"archivo": (io.BytesIO(b"docx"), "examen ordinario II UNAMBA 2024.docx")},
        content_type="multipart/form-data",
    )
    assert r.status_code == 500
    assert "db mala" in r.get_json()["error"]

    r_conn = client.get("/probar-conexion")
    assert r_conn.status_code == 200
    assert r_conn.get_json()["conexion"] == "error"


def test_api_examenes_importar_sin_bd_y_helpers_hash_ext(client, app_module, tmp_path, monkeypatch):
    upload = tmp_path / "uploads_importados_sin_bd"
    upload.mkdir()
    monkeypatch.setitem(app_module.app.config, "UPLOADS_EXAM_DIR", str(upload))
    monkeypatch.setattr(app_module, "get_connection", lambda: (_ for _ in ()).throw(RuntimeError("sin bd")), raising=False)
    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda path: 3, raising=False)

    assert app_module._ext_ok("a.docx") is True
    assert app_module._ext_ok("a.exe") is False

    r = client.post(
        "/api/examenes/importar",
        data={"files": (io.BytesIO(b"contenido"), "sin_bd.docx")},
        content_type="multipart/form-data",
    )
    assert r.status_code == 200
    data = r.get_json()
    assert data["ok"] is True
    assert data["items"][0]["id"] is None
    assert data["items"][0]["total_preguntas"] == 3

    saved = upload / "sin_bd.docx"
    assert saved.exists()
    assert app_module.sha256sum(str(saved)) == app_module.hashlib.sha256(b"contenido").hexdigest()

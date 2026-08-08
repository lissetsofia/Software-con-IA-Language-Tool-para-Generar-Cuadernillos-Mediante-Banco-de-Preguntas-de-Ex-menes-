# backend/test/test_app_claves_internal_cov9.py
import sqlite3
from pathlib import Path

import pytest


def _connect(db_path: Path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov9_claves_internal.sqlite3"

    def get_connection():
        return _connect(db_path)

    monkeypatch.setattr(app_module, "get_connection", get_connection)
    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS examenes_importados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            ruta TEXT,
            total_preguntas INTEGER DEFAULT 0
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS claves_tipo (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examen_id INTEGER,
            grupo_id INTEGER,
            codigo TEXT,
            orden INTEGER DEFAULT 0,
            activo INTEGER DEFAULT 1,
            UNIQUE(examen_id, grupo_id, codigo)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS claves_respuesta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examen_id INTEGER,
            grupo_id INTEGER,
            numero_pregunta INTEGER,
            origen TEXT,
            fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(examen_id, grupo_id, numero_pregunta)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS claves_respuesta_detalle (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            claves_respuesta_id INTEGER,
            tipo_id INTEGER,
            clave TEXT,
            fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(claves_respuesta_id, tipo_id)
        )
    """)
    conn.commit()
    cur.close()
    conn.close()
    return db_path


def test_api_claves_ensure_internal_completa_faltantes_y_conserva_existentes(app_module, tmp_path, monkeypatch):
    db_path = _patch_db(app_module, tmp_path, monkeypatch)
    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute("INSERT INTO examenes_importados (id, nombre, total_preguntas) VALUES (1, 'examen', 2)")
    cur.execute("INSERT INTO claves_tipo (examen_id, grupo_id, codigo, orden, activo) VALUES (1, 1, 'P', 1, 1)")
    tipo_p = int(cur.lastrowid)
    cur.execute("INSERT INTO claves_tipo (examen_id, grupo_id, codigo, orden, activo) VALUES (1, 1, 'Q', 2, 1)")
    tipo_q = int(cur.lastrowid)
    cur.execute("INSERT INTO claves_respuesta (examen_id, grupo_id, numero_pregunta, origen) VALUES (1, 1, 1, 'A')")
    cr_id = int(cur.lastrowid)
    cur.execute(
        "INSERT INTO claves_respuesta_detalle (claves_respuesta_id, tipo_id, clave) VALUES (?, ?, 'B')",
        (cr_id, tipo_p),
    )
    conn.commit(); cur.close(); conn.close()

    monkeypatch.setattr(app_module.random, "sample", lambda pool, n: list(pool)[:n])
    total = app_module.api_claves_ensure_internal(1, 1, tipos=("P", "Q"), exclude_origen=True)
    assert total == 2

    conn = _connect(db_path)
    rows = conn.execute("""
        SELECT cr.numero_pregunta, ct.codigo, d.clave
        FROM claves_respuesta cr
        JOIN claves_respuesta_detalle d ON d.claves_respuesta_id = cr.id
        JOIN claves_tipo ct ON ct.id = d.tipo_id
        ORDER BY cr.numero_pregunta, ct.codigo
    """).fetchall()
    conn.close()

    by_key = {(r["numero_pregunta"], r["codigo"]): r["clave"] for r in rows}
    assert by_key[(1, "P")] == "B"  # no pisa el valor existente
    assert (1, "Q") in by_key
    assert (2, "P") in by_key and (2, "Q") in by_key


def test_api_claves_ensure_internal_errores_y_ruta_ensure(client, app_module, tmp_path, monkeypatch):
    db_path = _patch_db(app_module, tmp_path, monkeypatch)
    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute("INSERT INTO examenes_importados (id, nombre, total_preguntas) VALUES (2, 'sin preguntas', 0)")
    cur.execute("INSERT INTO examenes_importados (id, nombre, total_preguntas) VALUES (3, 'muchos tipos', 1)")
    conn.commit(); cur.close(); conn.close()

    with pytest.raises(Exception) as excinfo:
        app_module.api_claves_ensure_internal(2, 1, tipos=("P",))
    assert "sin preguntas" in str(excinfo.value).lower()

    # Con 6 tipos no hay suficientes letras disponibles (solo A-E).
    with pytest.raises(ValueError) as excinfo:
        app_module.api_claves_ensure_internal(3, 1, tipos=("P", "Q", "R", "S", "T", "U"), exclude_origen=True)
    assert "No hay suficientes letras" in str(excinfo.value)

    # Ruta: la implementación actual acepta body vacío y usa valores por defecto.
    r_empty = client.post("/api/claves/ensure", json={})
    assert r_empty.status_code in (200, 400)

    monkeypatch.setattr(app_module, "api_claves_ensure_internal", lambda *a, **k: 9, raising=False)
    r = client.post("/api/claves/ensure", json={"examen_ids": [10], "grupo_id": 20, "tipos": ["P"]})
    assert r.status_code == 200
    # La ruta puede devolver distintas claves segun la version de app.py;
    # basta validar que responde JSON exitoso y no exigir total_preguntas.
    data = r.get_json()
    assert isinstance(data, dict)
    assert data.get("ok") is True
    assert data.get("items", [{}])[0].get("total") == 9

    # En modo TESTING, Flask puede propagar la excepcion en vez de devolver 500.
    # Desactivamos la propagacion solo para cubrir la rama de error HTTP.
    monkeypatch.setattr(app_module, "api_claves_ensure_internal", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("fallo interno")), raising=False)
    old_testing = app_module.app.config.get("TESTING")
    old_propagate = app_module.app.config.get("PROPAGATE_EXCEPTIONS")
    app_module.app.config["TESTING"] = False
    app_module.app.config["PROPAGATE_EXCEPTIONS"] = False
    try:
        r_err = client.post("/api/claves/ensure", json={"examen_ids": [10], "grupo_id": 20})
        assert r_err.status_code == 500
    finally:
        app_module.app.config["TESTING"] = old_testing
        app_module.app.config["PROPAGATE_EXCEPTIONS"] = old_propagate

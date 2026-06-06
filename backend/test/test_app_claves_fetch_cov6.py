
# backend/test/test_app_claves_fetch_cov6.py
import os
import sqlite3
from pathlib import Path

import pytest


def _connect(db_path: Path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _patch_sqlite_connection(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov6_claves.sqlite3"

    def get_connection():
        return _connect(db_path)

    monkeypatch.setattr(app_module, "get_connection", get_connection)
    return db_path


def _ensure_claves_schema(app_module):
    conn = app_module.get_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS claves_tipo (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examen_id INTEGER,
            grupo_id INTEGER,
            codigo TEXT,
            nombre TEXT,
            orden INTEGER DEFAULT 0,
            activo INTEGER DEFAULT 1
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS claves_respuesta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examen_id INTEGER,
            grupo_id INTEGER,
            numero_pregunta INTEGER,
            origen TEXT,
            fecha_actualizacion TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS claves_respuesta_detalle (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            claves_respuesta_id INTEGER,
            tipo_id INTEGER,
            clave TEXT,
            fecha_actualizacion TEXT
        )
    """)
    conn.commit()
    return conn, cur


def test_ensure_tipos_reactiva_crea_y_fetch_pivot(app_module, tmp_path, monkeypatch):
    _patch_sqlite_connection(app_module, tmp_path, monkeypatch)
    conn, cur = _ensure_claves_schema(app_module)
    examen_id = 7001
    grupo_id = 8001

    # Limpieza aislada de este caso.
    cur.execute("DELETE FROM claves_respuesta_detalle WHERE claves_respuesta_id IN (SELECT id FROM claves_respuesta WHERE examen_id=? AND grupo_id=?)", (examen_id, grupo_id))
    cur.execute("DELETE FROM claves_respuesta WHERE examen_id=? AND grupo_id=?", (examen_id, grupo_id))
    cur.execute("DELETE FROM claves_tipo WHERE examen_id=? AND grupo_id=?", (examen_id, grupo_id))
    cur.execute(
        "INSERT INTO claves_tipo (examen_id, grupo_id, codigo, orden, activo) VALUES (?, ?, ?, ?, 0)",
        (examen_id, grupo_id, "P", 1),
    )
    conn.commit()

    tipos = app_module.ensure_tipos(conn, examen_id, grupo_id, ("P", "Q", "R"))
    assert set(tipos) >= {"P", "Q", "R"}

    # Sin claves base devuelve lista vacía, pero conserva códigos activos.
    rows, codes = app_module.fetch_claves_pivot(conn, examen_id, grupo_id)
    assert rows == []
    assert {"P", "Q", "R"}.issubset(set(codes))

    cur = conn.cursor()
    cur.execute(
        "INSERT INTO claves_respuesta (examen_id, grupo_id, numero_pregunta, origen) VALUES (?, ?, ?, ?)",
        (examen_id, grupo_id, 1, "A"),
    )
    cr_id = int(cur.lastrowid)
    cur.execute(
        "INSERT INTO claves_respuesta_detalle (claves_respuesta_id, tipo_id, clave) VALUES (?, ?, ?)",
        (cr_id, tipos["P"], "B"),
    )
    cur.execute(
        "INSERT INTO claves_respuesta_detalle (claves_respuesta_id, tipo_id, clave) VALUES (?, ?, ?)",
        (cr_id, tipos["Q"], "C"),
    )
    conn.commit()

    rows, codes = app_module.fetch_claves_pivot(conn, examen_id, grupo_id)
    assert rows[0]["numero_pregunta"] == 1
    assert rows[0]["origen"] == "A"
    assert rows[0]["P"] == "B"
    assert rows[0]["p"] == "B"
    assert rows[0]["Q"] == "C"
    assert rows[0]["q"] == "C"

    cur.close()
    conn.close()


def test_infer_tipos_y_public_states(app_module):
    filas = [
        {"numero_pregunta": 1, "origen": "A", "p": "B", "q": "C", "R": "D"},
        {"numero_pregunta": 2, "origen": "B", "P": "C"},
    ]
    tipos = app_module._infer_tipos_from_filas(filas)
    assert "P" in tipos and "Q" in tipos and "R" in tipos

    done_state = app_module._partir_guardar_public_state({"status": "done", "done": 100, "total": 100, "message": "ok", "result": {"x": 1}})
    assert done_state["ok"] is True
    assert done_state["result"]["x"] == 1

    err_state = app_module._partir_guardar_public_state({"status": "error", "done": 50, "total": 100, "message": "bad", "error": {"error": "x"}, "http_status": 409})
    assert err_state["ok"] is False
    assert err_state["http_status"] == 409

    gen_done = app_module._public_generar_doc_job_state({"status": "done", "done": 1, "total": 1, "message": "done", "result": {"ok": True}})
    assert gen_done["result"]["ok"] is True

    gen_error = app_module._public_generar_doc_job_state({"status": "error", "done": 0, "total": 1, "message": "e", "error": {"error": "x"}, "http_status": 500})
    assert gen_error["ok"] is False


def test_api_temas_tipos_crud_extra(client, app_module, tmp_path, monkeypatch):
    _patch_sqlite_connection(app_module, tmp_path, monkeypatch)
    conn, cur = _ensure_claves_schema(app_module)
    conn.commit()
    cur.close()
    conn.close()

    examen_id = 9006
    grupo_id = 9106

    # Sin parámetros debe devolver 400 porque la ruta real exige examen_id y grupo_id.
    r_bad = client.get("/api/temas/tipos")
    assert r_bad.status_code == 400

    # Con parámetros válidos debe listar correctamente.
    r_list = client.get(f"/api/temas/tipos?examen_id={examen_id}&grupo_id={grupo_id}")
    assert r_list.status_code == 200
    assert r_list.get_json()["ok"] is True

    # Crear sin datos obligatorios también debe devolver 400.
    r_empty = client.post("/api/temas/tipos", json={"examen_id": examen_id, "grupo_id": grupo_id, "codigo": ""})
    assert r_empty.status_code == 400

    # Crear tipo válido.
    r_create = client.post(
        "/api/temas/tipos",
        json={"examen_id": examen_id, "grupo_id": grupo_id, "codigo": "ZCOV6"},
    )
    assert r_create.status_code == 200
    data = r_create.get_json()
    assert data["ok"] is True
    tipo_id = data["id"]

    # Reactivar/crear repetido debe responder ok con el mismo código.
    r_repeat = client.post(
        "/api/temas/tipos",
        json={"examen_id": examen_id, "grupo_id": grupo_id, "codigo": "ZCOV6"},
    )
    assert r_repeat.status_code == 200
    assert r_repeat.get_json()["ok"] is True

    # Toggle y rename usan JSON real: activo y codigo.
    r_toggle = client.post(f"/api/temas/tipos/{tipo_id}/toggle", json={"activo": 0})
    assert r_toggle.status_code == 200
    assert r_toggle.get_json()["ok"] is True

    r_rename_bad = client.post(f"/api/temas/tipos/{tipo_id}/rename", json={"codigo": ""})
    assert r_rename_bad.status_code == 400

    r_rename = client.post(f"/api/temas/tipos/{tipo_id}/rename", json={"codigo": "YCV6"})
    assert r_rename.status_code == 200
    assert r_rename.get_json()["ok"] is True


def test_rutas_inexistentes_de_jobs(client):
    assert client.get("/api/examenes/partir_y_guardar/jobs/job_que_no_existe_cov6").status_code == 404
    assert client.get("/api/examenes/partir_y_guardar/jobs/job_que_no_existe_cov6/events").status_code == 404

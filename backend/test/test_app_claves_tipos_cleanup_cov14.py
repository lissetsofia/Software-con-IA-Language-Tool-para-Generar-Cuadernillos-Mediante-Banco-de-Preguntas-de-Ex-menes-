import os
import random
import sqlite3
from pathlib import Path


def _connect(db_path):
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov14_claves.sqlite3"
    conn = _connect(db_path)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS claves_tipo (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examen_id INTEGER NOT NULL,
            grupo_id INTEGER NOT NULL,
            codigo TEXT NOT NULL,
            orden INTEGER DEFAULT 0,
            activo INTEGER DEFAULT 1,
            UNIQUE(examen_id, grupo_id, codigo)
        );
        CREATE TABLE IF NOT EXISTS claves_respuesta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examen_id INTEGER NOT NULL,
            grupo_id INTEGER NOT NULL,
            numero_pregunta INTEGER NOT NULL,
            origen TEXT DEFAULT 'A',
            fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(examen_id, grupo_id, numero_pregunta)
        );
        CREATE TABLE IF NOT EXISTS claves_respuesta_detalle (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            claves_respuesta_id INTEGER NOT NULL,
            tipo_id INTEGER NOT NULL,
            clave TEXT,
            fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(claves_respuesta_id, tipo_id)
        );
        CREATE TABLE IF NOT EXISTS examenes_importados (
            id INTEGER PRIMARY KEY,
            nombre TEXT,
            ruta TEXT,
            total_preguntas INTEGER DEFAULT 0
        );
        """
    )
    conn.commit()
    conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path), raising=False)
    upload_dir = tmp_path / "uploads_importados"
    upload_dir.mkdir(exist_ok=True)
    monkeypatch.setitem(app_module.app.config, "UPLOADS_EXAM_DIR", str(upload_dir))
    return db_path, upload_dir


def test_claves_tipos_guardar_origen_y_helpers(client, app_module, tmp_path, monkeypatch):
    db_path, _upload_dir = _patch_db(app_module, tmp_path, monkeypatch)

    assert client.get("/api/temas/tipos").status_code == 400
    assert client.post("/api/temas/tipos", json={"examen_id": 1}).status_code == 400

    r1 = client.post("/api/temas/tipos", json={"examen_id": 1, "grupo_id": 2, "codigo": " r "})
    assert r1.status_code == 200
    assert r1.get_json()["codigo"] == "R"

    # Si existe pero está inactivo, el endpoint debe reactivarlo.
    conn = _connect(db_path)
    conn.execute("UPDATE claves_tipo SET activo=0 WHERE codigo='R'")
    conn.commit(); conn.close()
    r2 = client.post("/api/temas/tipos", json={"examen_id": 1, "grupo_id": 2, "codigo": "R"})
    assert r2.status_code == 200

    listado = client.get("/api/temas/tipos?examen_id=1&grupo_id=2")
    assert listado.status_code == 200
    assert listado.get_json()["tipos"][0]["codigo"] == "R"

    tipo_id = listado.get_json()["tipos"][0]["id"]
    assert client.post(f"/api/temas/tipos/{tipo_id}/toggle", json={"activo": 0}).status_code == 200
    assert client.post(f"/api/temas/tipos/{tipo_id}/rename", json={"codigo": "@@"}).status_code == 400
    renamed = client.post(f"/api/temas/tipos/{tipo_id}/rename", json={"codigo": "s1"})
    assert renamed.status_code == 200
    assert renamed.get_json()["codigo"] == "S1"

    # Guardado dinámico: crea tipos, cabeceras y detalles, incluyendo compatibilidad p/q.
    ok = client.post("/api/claves/guardar", json={
        "examen_id": 1,
        "grupo_id": 2,
        "filas": [
            {"numero_pregunta": 1, "origen": "Z", "p": "b", "q": "c", "R": "D"},
            {"numero_pregunta": 2, "origen": "A", "P": "", "Q": "E", "R": "X"},
            {"numero_pregunta": 0, "origen": "A", "P": "B"},
        ],
    })
    assert ok.status_code == 200
    assert set(ok.get_json()["tipos"]) >= {"P", "Q", "R"}

    origen = client.get("/api/claves/origen?examen_id=1&grupo_id=2")
    assert origen.status_code == 200
    body = origen.get_json()
    assert body["ok"] is True
    assert body["filas"][0]["origen"] == "A"  # Z no es letra válida, cae a A
    assert body["filas"][0]["p"] == "B"
    assert body["filas"][0]["q"] == "C"

    # Helpers puros de códigos/tipos y selección de letras.
    assert app_module._norm_code(" pq_1 ") == "PQ_1"
    assert app_module._norm_code("con guion-") is None
    assert app_module._infer_tipos_from_filas([{"numero_pregunta": 1, "p": "B", "q": "C", "R": "D", "id": 9}]) == ["P", "Q", "R"]
    assert len(app_module.pick_distinct_for_tipos(2, exclude_origen="A")) == 2
    try:
        app_module.pick_distinct_for_tipos(6)
        assert False, "debió fallar con más tipos que letras A-E"
    except ValueError:
        pass


def test_limpiar_examenes_importados_borra_registros_archivos_y_relaciones(client, app_module, tmp_path, monkeypatch):
    db_path, upload_dir = _patch_db(app_module, tmp_path, monkeypatch)
    f1 = upload_dir / "uno.docx"; f1.write_bytes(b"uno")
    f2 = upload_dir / "dos.docx"; f2.write_bytes(b"dos")
    extra = upload_dir / "basura.tmp"; extra.write_bytes(b"x")

    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute("INSERT INTO examenes_importados(id,nombre,ruta,total_preguntas) VALUES(10,'uno',?,2)", (str(f1),))
    cur.execute("INSERT INTO examenes_importados(id,nombre,ruta,total_preguntas) VALUES(11,'dos',?,2)", (str(f2),))
    cur.execute("INSERT INTO claves_tipo(examen_id,grupo_id,codigo,orden,activo) VALUES(10,1,'P',1,1)")
    cur.execute("INSERT INTO claves_respuesta(examen_id,grupo_id,numero_pregunta,origen) VALUES(10,1,1,'A')")
    cr_id = cur.lastrowid
    cur.execute("INSERT INTO claves_respuesta_detalle(claves_respuesta_id,tipo_id,clave) VALUES(?,1,'B')", (cr_id,))
    conn.commit(); cur.close(); conn.close()

    assert app_module.limpiar_examenes_importados(force=True) is True
    assert not f1.exists() and not f2.exists() and not extra.exists()

    conn = _connect(db_path)
    for tabla in ["examenes_importados", "claves_tipo", "claves_respuesta", "claves_respuesta_detalle"]:
        assert conn.execute(f"SELECT COUNT(*) FROM {tabla}").fetchone()[0] == 0
    conn.close()

    # Rama de bloqueo por bandera interna y ruta HTTP.
    app_module._CLEANUP_IMPORTADOS_RUNNING = True
    assert app_module.limpiar_examenes_importados(force=False) is True
    app_module._CLEANUP_IMPORTADOS_RUNNING = False
    assert client.post("/api/examenes/importados/limpiar").status_code == 200
    assert client.get("/__ping__").data == b"ok"

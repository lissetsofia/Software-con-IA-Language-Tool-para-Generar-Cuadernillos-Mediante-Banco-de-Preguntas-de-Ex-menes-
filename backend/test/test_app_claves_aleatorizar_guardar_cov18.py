import sqlite3


def _connect(db_path):
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov18_claves.sqlite3"
    conn = _connect(db_path)
    conn.executescript("""
        CREATE TABLE examenes_importados(id INTEGER PRIMARY KEY, nombre TEXT, ruta TEXT, total_preguntas INTEGER);
        CREATE TABLE claves_tipo(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examen_id INTEGER, grupo_id INTEGER, codigo TEXT, orden INTEGER, activo INTEGER DEFAULT 1
        );
        CREATE TABLE claves_respuesta(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examen_id INTEGER, grupo_id INTEGER, numero_pregunta INTEGER, origen TEXT, fecha_actualizacion TEXT,
            UNIQUE(examen_id, grupo_id, numero_pregunta)
        );
        CREATE TABLE claves_respuesta_detalle(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            claves_respuesta_id INTEGER, tipo_id INTEGER, clave TEXT, fecha_actualizacion TEXT,
            UNIQUE(claves_respuesta_id, tipo_id)
        );
    """)
    conn.execute("INSERT INTO examenes_importados(id,nombre,total_preguntas) VALUES(1,'Examen claves',3)")
    conn.commit(); conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path), raising=False)
    return db_path


def test_claves_guardar_inferir_tipos_y_fetch_pivot(client, app_module, tmp_path, monkeypatch):
    db_path = _patch_db(app_module, tmp_path, monkeypatch)

    assert app_module._norm_code(" p ") == "P"
    assert app_module._norm_code("muy-largo?") is None
    assert app_module._infer_tipos_from_filas([{"p": "B", "q": "C", "R": "D", "origen": "A"}]) == ["P", "Q", "R"]

    r_missing = client.post("/api/claves/guardar", json={})
    assert r_missing.status_code == 400

    filas = [
        {"numero_pregunta": 1, "origen": "Z", "p": "B", "q": "C", "R": "D"},
        {"numero_pregunta": 2, "origen": "A", "P": "", "Q": "E", "R": "X"},
        {"numero_pregunta": 0, "origen": "A", "P": "B"},
    ]
    r = client.post("/api/claves/guardar", json={"examen_id": 1, "grupo_id": 7, "filas": filas})
    assert r.status_code == 200
    assert r.get_json()["ok"] is True
    # La ruta puede devolver los tipos en distinto orden según cómo los cree en BD.
    assert set(r.get_json()["tipos"]) == {"P", "Q", "R"}

    conn = _connect(db_path)
    rows, tipos = app_module.fetch_claves_pivot(conn, 1, 7)
    conn.close()
    assert set(tipos) == {"P", "Q", "R"}
    assert rows[0]["origen"] == "A"  # origen inválido se normaliza a A
    assert rows[0]["P"] == "B"
    assert rows[0]["Q"] == "C"
    assert rows[0]["R"] == "D"
    assert rows[1]["Q"] == "E"
    assert "R" not in rows[1]  # X no es letra válida

    r_origen = client.get("/api/claves/origen?examen_id=1&grupo_id=7")
    assert r_origen.status_code == 200
    assert r_origen.get_json()["ok"] is True

    r_dummy = client.get("/api/claves/origen?examen_id=999&grupo_id=7")
    assert r_dummy.status_code == 200
    assert len(r_dummy.get_json()["filas"]) == 10


def test_aleatorizar_tipos_success_y_error(client, app_module, tmp_path, monkeypatch):
    _patch_db(app_module, tmp_path, monkeypatch)

    assert client.post("/api/claves/aleatorizar", json={}).status_code == 400

    # Determinístico: siempre devuelve las primeras letras solicitadas.
    monkeypatch.setattr(app_module.random, "sample", lambda pool, n: list(pool)[:n], raising=False)
    r = client.post("/api/claves/aleatorizar", json={"examen_id": 1, "grupo_id": 3, "tipos": ["P", "Q", "R"]})
    assert r.status_code == 200
    assert r.get_json()["ok"] is True
    # La ruta puede devolver los tipos en distinto orden según cómo los cree en BD.
    assert set(r.get_json()["tipos"]) == {"P", "Q", "R"}

    conn = app_module.get_connection()
    rows, tipos = app_module.fetch_claves_pivot(conn, 1, 3)
    conn.close()
    assert len(rows) == 3
    assert set(tipos) == {"P", "Q", "R"}
    assert all(row.get("P") for row in rows)

    monkeypatch.setattr(app_module, "pick_distinct_for_tipos", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("aleatorio falla")), raising=False)
    r_err = client.post("/api/claves/aleatorizar", json={"examen_id": 1, "grupo_id": 4, "tipos": ["P"]})
    assert r_err.status_code == 500
    assert r_err.get_json()["ok"] is False

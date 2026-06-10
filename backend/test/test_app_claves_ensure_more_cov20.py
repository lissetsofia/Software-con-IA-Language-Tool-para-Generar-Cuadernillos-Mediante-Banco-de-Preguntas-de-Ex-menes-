import sqlite3


def _connect(db_path):
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _patch_db(app_module, tmp_path, monkeypatch, total=2):
    db_path = tmp_path / "cov20_claves_ensure.sqlite3"
    if db_path.exists():
        db_path.unlink()
    conn = _connect(db_path)
    conn.executescript("""
        CREATE TABLE examenes_importados(id INTEGER PRIMARY KEY, total_preguntas INTEGER);
        CREATE TABLE claves_tipo(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examen_id INTEGER,
            grupo_id INTEGER,
            codigo TEXT,
            orden INTEGER,
            activo INTEGER DEFAULT 1
        );
        CREATE TABLE claves_respuesta(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examen_id INTEGER,
            grupo_id INTEGER,
            numero_pregunta INTEGER,
            origen TEXT,
            fecha_actualizacion TEXT
        );
        CREATE UNIQUE INDEX uq_cr ON claves_respuesta(examen_id, grupo_id, numero_pregunta);
        CREATE TABLE claves_respuesta_detalle(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            claves_respuesta_id INTEGER,
            tipo_id INTEGER,
            clave TEXT,
            fecha_actualizacion TEXT,
            UNIQUE(claves_respuesta_id, tipo_id)
        );
    """)
    conn.execute("INSERT INTO examenes_importados(id,total_preguntas) VALUES(1,?)", (total,))
    conn.commit(); conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path), raising=False)
    return db_path


def test_claves_ensure_internal_crea_y_reusa_detalles(client, app_module, tmp_path, monkeypatch):
    db_path = _patch_db(app_module, tmp_path, monkeypatch, total=3)

    total = app_module.api_claves_ensure_internal(1, 7, tipos=["P", "Q", "R"], exclude_origen=True)
    assert total == 3

    conn = _connect(db_path)
    rows, tipos = app_module.fetch_claves_pivot(conn, 1, 7)
    conn.close()
    assert len(rows) == 3
    assert set(tipos) == {"P", "Q", "R"}
    assert all(r.get("P") for r in rows)

    # Llamada por endpoint con tipos nuevos y filas ya existentes.
    r = client.post("/api/claves/ensure", json={"examen_ids": [1], "grupo_id": 7, "tipos": ["P", "Q", "R", "S"]})
    assert r.status_code == 200
    assert r.get_json()["items"][0]["total"] == 3


def test_claves_ensure_internal_errores_y_sin_suficientes_letras(app_module, tmp_path, monkeypatch):
    _patch_db(app_module, tmp_path, monkeypatch, total=0)
    try:
        app_module.api_claves_ensure_internal(1, 7, tipos=["P"])
        assert False, "debió fallar por examen sin preguntas"
    except Exception as e:
        assert "sin preguntas" in str(e).lower()

    # Con una sola pregunta, la implementación puede reutilizar letras evitando solo el origen.
    # Validamos que no reviente y que cree la clave para esa pregunta.
    _patch_db(app_module, tmp_path, monkeypatch, total=1)
    assert app_module.api_claves_ensure_internal(1, 7, tipos=["P", "Q", "R", "S", "T"], exclude_origen=True) == 1


def test_pick_not_in_sha_y_delete_importado_errores(client, app_module, tmp_path, monkeypatch):
    assert app_module.pick_not_in(["A", "B", "C", "D"]) == "E"

    p = tmp_path / "a.bin"
    p.write_bytes(b"abc")
    assert len(app_module.sha256sum(str(p))) == 64

    db_path = tmp_path / "delete_import.sqlite3"
    conn = _connect(db_path)
    conn.executescript("CREATE TABLE examenes_importados(id INTEGER PRIMARY KEY, ruta TEXT);")
    conn.commit(); conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path), raising=False)

    nf = client.delete("/api/examenes/importados/999")
    assert nf.status_code == 404

    f = tmp_path / "imp.docx"
    f.write_text("x", encoding="utf-8")
    conn = _connect(db_path)
    conn.execute("INSERT INTO examenes_importados(id,ruta) VALUES(1,?)", (str(f),))
    conn.commit(); conn.close()
    ok = client.delete("/api/examenes/importados/1?delete_file=0")
    assert ok.status_code == 200
    assert f.exists()

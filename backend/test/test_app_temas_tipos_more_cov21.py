import sqlite3


def _connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov21_tipos.sqlite3"
    if db_path.exists():
        db_path.unlink()
    conn = _connect(db_path)
    conn.executescript(
        """
        CREATE TABLE claves_tipo(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examen_id INTEGER,
            grupo_id INTEGER,
            codigo TEXT,
            orden INTEGER,
            activo INTEGER DEFAULT 1,
            UNIQUE(examen_id, grupo_id, codigo)
        );
        """
    )
    conn.commit(); conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path))
    return db_path


def test_temas_tipos_crud_reactivar_renombrar_y_errores(client, app_module, tmp_path, monkeypatch):
    db_path = _patch_db(app_module, tmp_path, monkeypatch)

    assert client.get("/api/temas/tipos").status_code == 400
    assert client.post("/api/temas/tipos", json={}).status_code == 400
    assert client.post("/api/temas/tipos", json={"examen_id": 1, "grupo_id": 7, "codigo": "bad-code"}).status_code == 400

    p = client.post("/api/temas/tipos", json={"examen_id": 1, "grupo_id": 7, "codigo": "p"})
    assert p.status_code == 200
    id_p = p.get_json()["id"]

    listado = client.get("/api/temas/tipos?examen_id=1&grupo_id=7")
    assert listado.status_code == 200
    assert listado.get_json()["tipos"][0]["codigo"] == "P"

    conn = _connect(db_path)
    conn.execute("INSERT INTO claves_tipo(examen_id,grupo_id,codigo,orden,activo) VALUES(1,7,'Q',2,0)")
    conn.commit(); conn.close()

    q = client.post("/api/temas/tipos", json={"examen_id": 1, "grupo_id": 7, "codigo": "Q"})
    assert q.status_code == 200
    q_id = q.get_json()["id"]

    same = client.post("/api/temas/tipos", json={"examen_id": 1, "grupo_id": 7, "codigo": "P"})
    assert same.status_code == 200
    assert same.get_json()["id"] == id_p

    off = client.post(f"/api/temas/tipos/{q_id}/toggle", json={"activo": 0})
    assert off.status_code == 200
    assert off.get_json()["ok"] is True

    assert client.post(f"/api/temas/tipos/{q_id}/rename", json={"codigo": ""}).status_code == 400
    ren = client.post(f"/api/temas/tipos/{q_id}/rename", json={"codigo": "R1"})
    assert ren.status_code == 200
    assert ren.get_json()["codigo"] == "R1"

    conn = _connect(db_path)
    codigos = [r["codigo"] for r in conn.execute("SELECT codigo FROM claves_tipo ORDER BY id").fetchall()]
    conn.close()
    assert codigos == ["P", "R1"]


def test_temas_tipos_ramas_db_error(client, app_module, tmp_path, monkeypatch):
    _patch_db(app_module, tmp_path, monkeypatch)

    def broken_connection():
        raise RuntimeError("db caída")

    monkeypatch.setattr(app_module, "get_connection", broken_connection)
    r = client.get("/api/temas/tipos?examen_id=1&grupo_id=7")
    assert r.status_code == 500
    assert r.get_json()["ok"] is False

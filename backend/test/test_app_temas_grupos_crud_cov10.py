import sqlite3
from pathlib import Path


def _connect(db_path: Path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov10_temas_grupos.sqlite3"

    def get_connection():
        return _connect(db_path)

    monkeypatch.setattr(app_module, "get_connection", get_connection)
    conn = _connect(db_path)
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS temario (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            activo INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS preguntas (
            idpreguntas INTEGER PRIMARY KEY AUTOINCREMENT,
            examenes_idexamenes INTEGER,
            tema_id INTEGER,
            numero_p INTEGER,
            archivo_nombre TEXT,
            archivo_ruta TEXT
        );
        CREATE TABLE IF NOT EXISTS grupos (
            idgrupo INTEGER PRIMARY KEY AUTOINCREMENT,
            clave TEXT NOT NULL UNIQUE,
            nombre TEXT,
            activo INTEGER DEFAULT 1,
            fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS grupo_tema (
            idgrupo_tema INTEGER PRIMARY KEY AUTOINCREMENT,
            grupos_idgrupo INTEGER,
            tema_id INTEGER,
            cantidad INTEGER DEFAULT 0,
            orden INTEGER DEFAULT 0,
            UNIQUE(grupos_idgrupo, tema_id)
        );
        """
    )
    cur.execute("INSERT INTO temario(nombre, activo) VALUES ('Álgebra', 1)")
    algebra_id = int(cur.lastrowid)
    cur.execute("INSERT INTO temario(nombre, activo) VALUES ('Historia', 0)")
    historia_id = int(cur.lastrowid)
    cur.execute(
        "INSERT INTO preguntas(examenes_idexamenes, tema_id, numero_p, archivo_nombre, archivo_ruta) VALUES (1, ?, 1, 'p1.docx', 'p1.docx')",
        (algebra_id,),
    )
    cur.execute("INSERT INTO grupos(clave, nombre, activo) VALUES ('A', 'Grupo A', 1)")
    grupo_a = int(cur.lastrowid)
    cur.execute(
        "INSERT INTO grupo_tema(grupos_idgrupo, tema_id, cantidad, orden) VALUES (?, ?, 2, 1)",
        (grupo_a, algebra_id),
    )
    conn.commit(); cur.close(); conn.close()
    return db_path, algebra_id, historia_id, grupo_a


def test_temas_crud_listar_preguntas_y_eliminar(client, app_module, tmp_path, monkeypatch):
    db_path, algebra_id, historia_id, _grupo_a = _patch_db(app_module, tmp_path, monkeypatch)

    activos = client.get("/api/temas")
    assert activos.status_code == 200
    assert all(x["activo"] == 1 for x in activos.get_json())

    todos = client.get("/api/temas?all=1")
    assert todos.status_code == 200
    assert len(todos.get_json()) >= 2

    assert client.post("/api/temas", json={}).status_code == 400
    assert client.post("/api/temas", json={"nombre": "X" * 101}).status_code == 400

    r_new = client.post("/api/temas", json={"nombre": "Física"})
    assert r_new.status_code == 201
    fisica_id = r_new.get_json()["id"]

    assert client.post("/api/temas", json={"nombre": "física"}).status_code == 409
    assert client.put(f"/api/temas/{fisica_id}", json={}).status_code == 400
    assert client.put(f"/api/temas/{fisica_id}", json={"nombre": "Álgebra"}).status_code == 409
    assert client.put(f"/api/temas/{fisica_id}", json={"nombre": "Física I"}).status_code == 200
    assert client.patch(f"/api/temas/{fisica_id}/toggle").status_code == 200

    preguntas = client.get(f"/api/preguntas?examen=1&tema={algebra_id}")
    assert preguntas.status_code == 200
    assert preguntas.get_json()[0]["numero_p"] == 1

    # Bloquea borrar un tema con preguntas si no se usa force.
    assert client.delete(f"/api/temas/{algebra_id}").status_code == 409
    assert client.delete(f"/api/temas/{algebra_id}?force=1").status_code == 200

    # Borrar un tema sin preguntas debe funcionar sin force.
    assert client.delete(f"/api/temas/{historia_id}").status_code == 200


def test_grupos_crud_cuotas_y_validaciones(client, app_module, tmp_path, monkeypatch):
    _db_path, algebra_id, historia_id, grupo_a = _patch_db(app_module, tmp_path, monkeypatch)

    r_list = client.get("/api/grupos")
    assert r_list.status_code == 200
    assert isinstance(r_list.get_json(), list)

    assert client.post("/api/grupos", json={"clave": ""}).status_code == 400
    assert client.post("/api/grupos", json={"clave": "LARGO", "nombre": "X" * 101}).status_code == 400
    assert client.post("/api/grupos", json={"clave": "a"}).status_code == 409

    r_new = client.post(
        "/api/grupos",
        json={
            "clave": "B",
            "nombre": "Grupo B",
            "cuotas": [
                {"tema_id": algebra_id, "cantidad": 0},
                {"tema_id": historia_id, "cantidad": 3},
            ],
        },
    )
    assert r_new.status_code == 200
    grupo_b = r_new.get_json()["idgrupo"]

    assert client.put(f"/api/grupos/{grupo_b}", json={}).status_code == 400
    assert client.put(f"/api/grupos/{grupo_b}", json={"clave": ""}).status_code == 400
    assert client.put(f"/api/grupos/{grupo_b}", json={"activo": "mal"}).status_code == 400
    assert client.put(f"/api/grupos/{grupo_b}", json={"clave": "A"}).status_code == 409
    assert client.put(f"/api/grupos/{grupo_b}", json={"clave": "C", "nombre": "Grupo C", "activo": 0}).status_code == 200
    assert client.patch(f"/api/grupos/{grupo_b}/toggle").status_code == 200

    cuotas_clave = client.get("/api/grupos/A/cuotas")
    assert cuotas_clave.status_code == 200
    assert cuotas_clave.get_json()[0]["tema_id"] == algebra_id

    cuotas_id = client.get(f"/api/grupos/{grupo_a}/cuotas")
    assert cuotas_id.status_code == 200
    assert cuotas_id.get_json()[0]["cantidad"] == 2

    r_put = client.put(
        f"/api/grupos/{grupo_a}/cuotas",
        json={"cuotas": [{"tema_id": historia_id, "cantidad": 4, "orden": 2}]},
    )
    assert r_put.status_code == 200
    after = client.get(f"/api/grupos/{grupo_a}/cuotas").get_json()
    assert after[0]["tema_id"] == historia_id
    assert after[0]["cantidad"] == 4

    assert client.delete(f"/api/grupos/{grupo_a}").status_code == 409
    assert client.delete(f"/api/grupos/{grupo_a}?force=1").status_code == 200
    assert client.delete(f"/api/grupos/{grupo_b}?force=1").status_code == 200

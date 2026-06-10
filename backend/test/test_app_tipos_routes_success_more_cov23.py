import sqlite3
import pytest


def _connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov23_tipos.sqlite3"
    if db_path.exists():
        db_path.unlink()
    conn = _connect(db_path)
    conn.executescript("""
        CREATE TABLE claves_tipo(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examen_id INTEGER,
            grupo_id INTEGER,
            codigo TEXT,
            orden INTEGER,
            activo INTEGER DEFAULT 1,
            UNIQUE(examen_id, grupo_id, codigo)
        );
    """)
    conn.commit(); conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path))
    return db_path


def test_tipos_crear_listar_reactivar_toggle_rename(client, app_module, tmp_path, monkeypatch):
    db_path = _patch_db(app_module, tmp_path, monkeypatch)

    r1 = client.post("/api/temas/tipos", json={"examen_id": 2, "grupo_id": 5, "codigo": "p"})
    assert r1.status_code == 200
    assert r1.get_json()["codigo"] == "P"

    r2 = client.post("/api/temas/tipos", json={"examen_id": 2, "grupo_id": 5, "codigo": "q"})
    assert r2.status_code == 200
    qid = r2.get_json()["id"]

    listado = client.get("/api/temas/tipos?examen_id=2&grupo_id=5")
    assert listado.status_code == 200
    assert [t["codigo"] for t in listado.get_json()["tipos"]] == ["P", "Q"]

    assert client.post(f"/api/temas/tipos/{qid}/toggle", json={"activo": 0}).status_code == 200
    reactivar = client.post("/api/temas/tipos", json={"examen_id": 2, "grupo_id": 5, "codigo": "Q"})
    assert reactivar.status_code == 200

    assert client.post(f"/api/temas/tipos/{qid}/rename", json={"codigo": "r"}).status_code == 200
    conn = _connect(db_path)
    rows = conn.execute("SELECT codigo, activo, orden FROM claves_tipo ORDER BY orden").fetchall()
    conn.close()
    assert rows[1]["codigo"] == "R"
    assert rows[1]["activo"] == 1


def test_tipos_toggle_rename_errores_db(client, app_module, tmp_path, monkeypatch):
    _patch_db(app_module, tmp_path, monkeypatch)
    monkeypatch.setattr(app_module, "get_connection", lambda: (_ for _ in ()).throw(RuntimeError("db rota")))
    assert client.post("/api/temas/tipos/1/toggle", json={"activo": 1}).status_code == 500
    assert client.post("/api/temas/tipos/1/rename", json={"codigo": "Z"}).status_code == 500
    # Esta ruta no captura el error de conexión antes del bloque try en la app,
    # y con TESTING=True Flask lo propaga. Validamos ese comportamiento real.
    with pytest.raises(RuntimeError):
        client.post("/api/temas/tipos", json={"examen_id": 1, "grupo_id": 1, "codigo": "Z"})

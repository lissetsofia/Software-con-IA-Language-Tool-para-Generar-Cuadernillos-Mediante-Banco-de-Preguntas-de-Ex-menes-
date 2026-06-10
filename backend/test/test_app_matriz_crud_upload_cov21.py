import io
import os
import sqlite3
from docx import Document


def _connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _make_docx(path, text="Pregunta de prueba"):
    doc = Document()
    doc.add_paragraph(text)
    doc.save(path)
    return path


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov21_matriz.sqlite3"
    if db_path.exists():
        db_path.unlink()
    upload = tmp_path / "uploads"
    upload.mkdir(exist_ok=True)
    conn = _connect(db_path)
    conn.executescript(
        """
        CREATE TABLE matriz(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            fecha_creacion TEXT DEFAULT '2025-01-01'
        );
        CREATE TABLE temario(id INTEGER PRIMARY KEY, nombre TEXT, activo INTEGER DEFAULT 1);
        CREATE TABLE matriz_detalle(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            matriz_id INTEGER,
            tema_id INTEGER,
            cantidad INTEGER,
            orden INTEGER,
            archivo_ruta TEXT,
            UNIQUE(matriz_id, tema_id)
        );
        INSERT INTO temario(id,nombre,activo) VALUES(1,'Álgebra',1),(2,'Geometría',1);
        """
    )
    conn.commit(); conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path))
    monkeypatch.setitem(app_module.app.config, "UPLOAD_FOLDER", str(upload))
    return db_path, upload


def test_matriz_crud_list_get_y_validaciones(client, app_module, tmp_path, monkeypatch):
    _patch_db(app_module, tmp_path, monkeypatch)

    assert client.post("/api/matriz", json={}).status_code == 400
    assert client.post("/api/matriz", json={"items": [{"tema_id": "x"}]}).status_code == 400
    assert client.post("/api/matriz", json={"items": [{"tema_id": 0, "cantidad": 2}]}).status_code == 400

    r = client.post(
        "/api/matriz",
        json={
            "nombre": "Matriz banco cov21",
            "items": [
                {"tema_id": 1, "cantidad": 3, "orden": 2},
                {"tema_id": 2, "cantidad": -5, "orden": 0},
            ],
        },
    )
    assert r.status_code == 200
    mid = r.get_json()["matriz_id"]

    listado = client.get("/api/matriz?detail=1&search=banco")
    assert listado.status_code == 200
    body = listado.get_json()
    assert len(body) == 1
    assert body[0]["n_items"] == 2
    assert len(body[0]["items"]) == 2

    by_id = client.get(f"/api/matriz/{mid}")
    assert by_id.status_code == 200
    data = by_id.get_json()
    assert data["n_items"] == 2
    assert data["n_archivos_subidos"] == 0

    assert client.get("/api/matriz/999").status_code == 404


def test_matriz_upload_crea_actualiza_y_error_validacion(client, app_module, tmp_path, monkeypatch):
    db_path, upload = _patch_db(app_module, tmp_path, monkeypatch)
    r = client.post("/api/matriz", json={"nombre": "M", "items": [{"tema_id": 1, "cantidad": 1}]})
    mid = r.get_json()["matriz_id"]

    assert client.post(f"/api/matriz/{mid}/upload", data={}).status_code == 400
    wrong = client.post(
        f"/api/matriz/{mid}/upload",
        data={"tema_id": "1", "file": (io.BytesIO(b"x"), "a.txt")},
        content_type="multipart/form-data",
    )
    assert wrong.status_code == 400

    monkeypatch.setattr(app_module, "_validar_docx_real", lambda p: None)

    ok1 = client.post(
        f"/api/matriz/{mid}/upload",
        data={"tema_id": "1", "cantidad": "5", "file": (io.BytesIO(b"PK fake"), "tema.docx")},
        content_type="multipart/form-data",
    )
    assert ok1.status_code == 200
    assert ok1.get_json()["ok"] is True

    ok2 = client.post(
        f"/api/matriz/{mid}/upload",
        data={"tema_id": "1", "file": (io.BytesIO(b"PK fake2"), "tema2.docx")},
        content_type="multipart/form-data",
    )
    assert ok2.status_code == 200

    ok_new = client.post(
        f"/api/matriz/{mid}/upload",
        data={"tema_id": "2", "file": (io.BytesIO(b"PK fake3"), "tema3.docx")},
        content_type="multipart/form-data",
    )
    assert ok_new.status_code == 200

    conn = _connect(db_path)
    rows = conn.execute("SELECT tema_id,cantidad,archivo_ruta FROM matriz_detalle ORDER BY tema_id").fetchall()
    conn.close()
    assert [r["tema_id"] for r in rows] == [1, 2]
    assert all(r["archivo_ruta"] for r in rows)

    def boom(_path):
        raise ValueError("docx inválido")
    monkeypatch.setattr(app_module, "_validar_docx_real", boom)
    bad = client.post(
        f"/api/matriz/{mid}/upload",
        data={"tema_id": "1", "file": (io.BytesIO(b"bad"), "bad.docx")},
        content_type="multipart/form-data",
    )
    assert bad.status_code == 500

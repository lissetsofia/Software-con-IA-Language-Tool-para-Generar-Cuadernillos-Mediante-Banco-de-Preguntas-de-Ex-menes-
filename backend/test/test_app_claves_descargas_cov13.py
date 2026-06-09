import io
import os
import sqlite3
import zipfile
from pathlib import Path

from docx import Document


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov13_claves.sqlite"

    def connect():
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        return conn

    monkeypatch.setattr(app_module, "get_connection", connect)
    up = tmp_path / "uploads"; desc = tmp_path / "descargas"; exdir = up / "examenes"
    for p in (up, desc, exdir):
        p.mkdir(parents=True, exist_ok=True)
    app_module.app.config["UPLOAD_FOLDER"] = str(up)
    app_module.app.config["DESCARGAS_FOLDER"] = str(desc)
    app_module.app.config["UPLOADS_EXAM_DIR"] = str(exdir)
    monkeypatch.setattr(app_module, "DESCARGAS_DIR", str(desc), raising=False)

    conn = connect(); cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS grupos(
            idgrupo INTEGER PRIMARY KEY AUTOINCREMENT,
            clave TEXT,
            nombre TEXT,
            activo INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS examenes_importados(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            ruta TEXT,
            extension TEXT,
            total_preguntas INTEGER,
            fuente TEXT,
            hash_archivo TEXT UNIQUE,
            fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS claves_tipo(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examen_id INTEGER,
            grupo_id INTEGER,
            codigo TEXT,
            orden INTEGER DEFAULT 0,
            activo INTEGER DEFAULT 1,
            UNIQUE(examen_id, grupo_id, codigo)
        );
        CREATE TABLE IF NOT EXISTS claves_respuesta(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examen_id INTEGER,
            grupo_id INTEGER,
            numero_pregunta INTEGER,
            origen TEXT DEFAULT 'A',
            fecha_actualizacion TEXT,
            UNIQUE(examen_id, grupo_id, numero_pregunta)
        );
        CREATE TABLE IF NOT EXISTS claves_respuesta_detalle(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            claves_respuesta_id INTEGER,
            tipo_id INTEGER,
            clave TEXT,
            fecha_actualizacion TEXT,
            UNIQUE(claves_respuesta_id, tipo_id)
        );
        """
    )
    conn.commit(); cur.close(); conn.close()
    return db_path


def _docx_bytes(texto="doc"):
    bio = io.BytesIO()
    doc = Document(); doc.add_paragraph(texto); doc.save(bio)
    return bio.getvalue()


def _make_docx(path: Path):
    path.write_bytes(_docx_bytes("1. Pregunta"))
    return path


def _seed_claves(app_module, tmp_path, monkeypatch):
    db_path = _patch_db(app_module, tmp_path, monkeypatch)
    docx = _make_docx(tmp_path / "examen.docx")
    conn = sqlite3.connect(db_path); conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("INSERT INTO grupos(idgrupo, clave, nombre, activo) VALUES (1,'A','Grupo A',1)")
    cur.execute(
        "INSERT INTO examenes_importados(id,nombre,ruta,extension,total_preguntas,fuente,hash_archivo) VALUES (1,'examen.docx',?,'docx',2,'upload','h1')",
        (str(docx),),
    )
    conn.commit(); cur.close(); conn.close()
    return db_path, docx


def test_claves_guardar_origen_aleatorizar_y_api_grupos(client, app_module, tmp_path, monkeypatch):
    _seed_claves(app_module, tmp_path, monkeypatch)

    # Directo para cubrir el segundo handler /api/grupos aunque Flask use el primero en la ruta duplicada.
    with app_module.app.test_request_context("/api/grupos"):
        resp = app_module.api_grupos()
        assert resp.get_json()[0]["clave"] == "A"

    assert client.post("/api/claves/guardar", json={"examen_id": 0, "grupo_id": 1}).status_code == 400

    r = client.post("/api/claves/guardar", json={
        "examen_id": 1,
        "grupo_id": 1,
        "tipos": ["P", "Q", "R"],
        "filas": [
            {"numero_pregunta": 1, "origen": "Z", "P": "B", "Q": "", "R": "E"},
            {"numero_pregunta": 2, "origen": "C", "p": "D", "q": "A"},
            {"numero_pregunta": 0, "origen": "A", "P": "B"},
        ],
    })
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()["tipos"] == ["P", "Q", "R"]

    origen = client.get("/api/claves/origen?examen_id=1&grupo_id=1")
    assert origen.status_code == 200
    assert origen.get_json()["ok"] is True
    assert origen.get_json()["filas"][0]["numero_pregunta"] == 1

    dummy = client.get("/api/claves/origen?examen_id=1&grupo_id=99")
    assert dummy.status_code == 200
    assert len(dummy.get_json()["filas"]) == 10

    assert client.post("/api/claves/aleatorizar", json={"examen_id": 0, "grupo_id": 1}).status_code == 400
    alea = client.post("/api/claves/aleatorizar", json={"examen_id": 1, "grupo_id": 1, "tipos": ["P", "Q"]})
    assert alea.status_code == 200, alea.get_data(as_text=True)
    assert alea.get_json()["ok"] is True


def test_build_salidas_descargar_all_e_imprimir(client, app_module, tmp_path, monkeypatch):
    _seed_claves(app_module, tmp_path, monkeypatch)

    # Prepara claves reales con ensure interno para cubrir ensure_tipos/fetch/upsert.
    total = app_module.api_claves_ensure_internal(1, 1, tipos=("P", "Q"), exclude_origen=True)
    assert total == 2

    conn = app_module.get_connection()
    salidas, claves, tipos, err = app_module._build_salidas_y_claves(conn, [1], grupo_id_fijo=1)
    conn.close()
    assert err is None
    assert salidas and claves and tipos

    monkeypatch.setattr(app_module, "generar_docx_tipo_para_grupo", lambda *_a, **_k: _docx_bytes("tipo"), raising=False)
    monkeypatch.setattr(app_module, "_asegurar_docx_bytes_valido_como_grupo", lambda b, *_a, **_k: b, raising=False)

    z = client.post("/api/pruebas/descargar_all", json={"examen_ids": [1], "grupo_id": 1})
    assert z.status_code == 200, z.get_data(as_text=True)
    assert z.mimetype in ("application/zip", "application/x-zip-compressed")
    with zipfile.ZipFile(io.BytesIO(z.data)) as zf:
        names = zf.namelist()
    assert any(n.endswith(".docx") for n in names)

    # Errores de imprimir.
    assert client.post("/api/claves/imprimir", json={}).status_code == 400
    assert client.post("/api/claves/imprimir", json={"examen_ids": [0], "grupo_id": 1}).status_code == 400
    assert client.post("/api/claves/imprimir", json={"examen_ids": [1]}).status_code == 400

    pdf = tmp_path / "claves.pdf"
    pdf.write_bytes(b"%PDF-1.4\n% cov13")
    monkeypatch.setattr(app_module, "generar_docx_claves_all_dinamico", lambda *_a, **_k: _docx_bytes("claves"), raising=False)
    monkeypatch.setattr(app_module, "generar_pdf", lambda _ruta: str(pdf), raising=False)
    ok = client.post("/api/claves/imprimir", json={"examen_ids": [1], "grupo_id": 1})
    assert ok.status_code == 200, ok.get_data(as_text=True)
    assert ok.get_json()["ok"] is True
    assert ok.get_json()["archivo_pdf"] == "claves.pdf"


def test_descargar_pruebas_dummy_y_generadores_docx(app_module, client, tmp_path, monkeypatch):
    _seed_claves(app_module, tmp_path, monkeypatch)

    resp = client.post("/api/pruebas/descargar", json={"grupo_id": 1, "examen_id": 1})
    assert resp.status_code == 200
    assert b"Pruebas para grupo" in resp.data

    b1 = app_module.generar_docx_claves_all("base", [{"grupo": "A", "numero_pregunta": 1, "origen": "A", "p": "B", "q": "C"}])
    b2 = app_module.generar_docx_claves_all_dinamico(["P", "Q"], [{"grupo": "A", "numero_pregunta": 1, "P": "B", "Q": "C"}])
    assert b1.startswith(b"PK") and b2.startswith(b"PK")

    assert app_module.inferir_clave_grupo_desde_nombre("EXAMEN_grupo-B_final.docx") == "B"
    assert app_module.inferir_clave_grupo_desde_nombre("sin_clave.docx") is None


def test_build_salidas_error_branches(app_module, tmp_path, monkeypatch):
    _patch_db(app_module, tmp_path, monkeypatch)
    conn = app_module.get_connection()
    assert "No se encontraron" in app_module._build_salidas_y_claves(conn, [999], grupo_id_fijo=1)[3]
    cur = conn.cursor()
    cur.execute("INSERT INTO examenes_importados(id,nombre,ruta,total_preguntas) VALUES (1,'x','no-existe.docx',1)")
    conn.commit()
    assert "Grupo no encontrado" in app_module._build_salidas_y_claves(conn, [1], grupo_id_fijo=99)[3]
    cur.execute("INSERT INTO grupos(idgrupo,clave,nombre,activo) VALUES (1,'A','A',1)")
    conn.commit()
    salidas, claves, tipos, err = app_module._build_salidas_y_claves(conn, [1], grupo_id_fijo=1)
    assert err is None and salidas == [] and claves == [] and tipos == ["P", "Q"]
    cur.close(); conn.close()


def test_api_claves_ensure_endpoint(client, app_module, tmp_path, monkeypatch):
    _seed_claves(app_module, tmp_path, monkeypatch)
    r = client.post("/api/claves/ensure", json={"examen_ids": [1], "grupo_id": 1, "tipos": ["P", "Q"]})
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()["items"][0]["total"] == 2

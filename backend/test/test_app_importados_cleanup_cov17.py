import io
import os
import sqlite3
from pathlib import Path

from docx import Document


def _connect(db_path):
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _docx_bytes(text="Documento importado"):
    bio = io.BytesIO()
    doc = Document()
    doc.add_paragraph(text)
    doc.save(bio)
    bio.seek(0)
    return bio.getvalue()


def _patch_import_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov17_importados.sqlite3"
    conn = _connect(db_path)
    conn.executescript(
        """
        CREATE TABLE examenes_importados(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            ruta TEXT,
            extension TEXT,
            total_preguntas INTEGER,
            fuente TEXT,
            hash_archivo TEXT UNIQUE,
            fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE claves_respuesta(id INTEGER PRIMARY KEY AUTOINCREMENT, examen_id INTEGER);
        CREATE TABLE claves_respuesta_detalle(id INTEGER PRIMARY KEY AUTOINCREMENT, claves_respuesta_id INTEGER);
        CREATE TABLE claves_tipo(id INTEGER PRIMARY KEY AUTOINCREMENT, examen_id INTEGER);
        """
    )
    conn.commit(); conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path), raising=False)
    uploads = tmp_path / "uploads_importados"
    uploads.mkdir(exist_ok=True)
    monkeypatch.setitem(app_module.app.config, "UPLOADS_EXAM_DIR", str(uploads))
    return db_path, uploads


def test_api_examenes_importar_listar_y_validaciones(client, app_module, tmp_path, monkeypatch):
    _patch_import_db(app_module, tmp_path, monkeypatch)
    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda path: 7, raising=False)

    assert client.open("/api/examenes/importar", method="OPTIONS").status_code == 204
    assert client.post("/api/examenes/importar", data={}, content_type="multipart/form-data").status_code == 400

    r_bad_ext = client.post(
        "/api/examenes/importar",
        data={"files": (io.BytesIO(b"x"), "mal.txt")},
        content_type="multipart/form-data",
    )
    assert r_bad_ext.status_code == 415

    r_ok = client.post(
        "/api/examenes/importar",
        data={"files": (io.BytesIO(_docx_bytes()), "examen ordinario I UNAMBA 2025.docx")},
        content_type="multipart/form-data",
    )
    assert r_ok.status_code == 200
    body = r_ok.get_json()
    assert body["ok"] is True
    assert body["items"][0]["total_preguntas"] == 7

    r_list = client.get("/api/examenes/importados")
    assert r_list.status_code == 200
    assert r_list.get_json()[0]["total_preguntas"] == 7

    assert app_module._ext_ok("a.doc") is True
    assert app_module._ext_ok("a.docx") is True
    assert app_module._ext_ok("a.pdf") is True
    assert app_module._ext_ok("a.txt") is False
    assert app_module.inferir_clave_grupo_desde_nombre("examen_GRUPO_B.docx") == "B"
    assert app_module.inferir_clave_grupo_desde_nombre("sin grupo.docx") is None


def test_limpiar_examenes_importados_endpoint_y_helpers(client, app_module, tmp_path, monkeypatch):
    db_path, uploads = _patch_import_db(app_module, tmp_path, monkeypatch)
    f1 = uploads / "limpiar1.docx"
    f2 = uploads / "sobrante.pdf"
    f1.write_bytes(b"docx")
    f2.write_bytes(b"pdf")

    conn = _connect(db_path)
    conn.execute("INSERT INTO examenes_importados(id,nombre,ruta,extension,total_preguntas,fuente,hash_archivo) VALUES(1,'x',?,'docx',1,'upload','h1')", (str(f1),))
    conn.execute("INSERT INTO claves_respuesta(id,examen_id) VALUES(20,1)")
    conn.execute("INSERT INTO claves_respuesta_detalle(id,claves_respuesta_id) VALUES(30,20)")
    conn.execute("INSERT INTO claves_tipo(id,examen_id) VALUES(40,1)")
    conn.commit(); conn.close()

    assert app_module.limpiar_examenes_importados(force=True) is True
    assert not f1.exists()
    assert not f2.exists()

    conn = _connect(db_path)
    assert conn.execute("SELECT COUNT(*) FROM examenes_importados").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM claves_respuesta").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM claves_respuesta_detalle").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM claves_tipo").fetchone()[0] == 0
    conn.close()

    r = client.post("/api/examenes/importados/limpiar")
    assert r.status_code == 200
    assert r.get_json()["ok"] is True

    # Rama de bloqueo: si ya está corriendo y no se fuerza, retorna True sin tocar BD.
    app_module._CLEANUP_IMPORTADOS_RUNNING = True
    try:
        assert app_module.limpiar_examenes_importados(force=False) is True
    finally:
        app_module._CLEANUP_IMPORTADOS_RUNNING = False

    # Helpers de limpieza invocados al cierre/señal.
    app_module._cleanup_importados_on_exit()
    try:
        app_module._cleanup_importados_on_signal(15, None)
        assert False, "Debe terminar con SystemExit"
    except SystemExit:
        pass

    assert client.get("/__ping__").data == b"ok"

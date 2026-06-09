import io
import os
import sqlite3
import zipfile
from pathlib import Path

from docx import Document


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov13_import_banco.sqlite"

    def connect():
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        return conn

    monkeypatch.setattr(app_module, "get_connection", connect)
    up = tmp_path / "uploads"; desc = tmp_path / "descargas"; banco_p = up / "banco" / "preguntas"; banco_s = up / "banco" / "solucionarios"; exdir = up / "examenes"
    for p in (up, desc, banco_p, banco_s, exdir):
        p.mkdir(parents=True, exist_ok=True)
    app_module.app.config["UPLOAD_FOLDER"] = str(up)
    app_module.app.config["DESCARGAS_FOLDER"] = str(desc)
    app_module.app.config["UPLOADS_EXAM_DIR"] = str(exdir)
    monkeypatch.setattr(app_module, "DESCARGAS_DIR", str(desc), raising=False)
    monkeypatch.setattr(app_module, "BANCO_PREG_DIR", str(banco_p), raising=False)
    monkeypatch.setattr(app_module, "BANCO_SOL_DIR", str(banco_s), raising=False)

    conn = connect(); cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS temario(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            activo INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS preguntas(
            idpreguntas INTEGER PRIMARY KEY AUTOINCREMENT,
            examenes_idexamenes INTEGER,
            tema_id INTEGER,
            numero_p INTEGER,
            archivo_nombre TEXT,
            archivo_ruta TEXT
        );
        CREATE TABLE IF NOT EXISTS tema_docs(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tema_id INTEGER,
            doc_preguntas_nombre TEXT,
            doc_preguntas_ruta TEXT,
            doc_sol_nombre TEXT,
            doc_sol_ruta TEXT,
            fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
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
        CREATE TABLE IF NOT EXISTS claves_tipo(id INTEGER PRIMARY KEY AUTOINCREMENT, examen_id INTEGER, grupo_id INTEGER, codigo TEXT, orden INTEGER, activo INTEGER);
        CREATE TABLE IF NOT EXISTS claves_respuesta(id INTEGER PRIMARY KEY AUTOINCREMENT, examen_id INTEGER, grupo_id INTEGER, numero_pregunta INTEGER, origen TEXT);
        CREATE TABLE IF NOT EXISTS claves_respuesta_detalle(id INTEGER PRIMARY KEY AUTOINCREMENT, claves_respuesta_id INTEGER, tipo_id INTEGER, clave TEXT);
        """
    )
    conn.commit(); cur.close(); conn.close()
    return db_path


def _make_docx(path: Path, txt="1. Pregunta"):
    doc = Document(); doc.add_paragraph(txt); doc.save(path); return path


def test_importados_upload_list_delete_y_cleanup(client, app_module, tmp_path, monkeypatch):
    _patch_db(app_module, tmp_path, monkeypatch)
    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda _p: 7, raising=False)

    assert client.open("/api/examenes/importar", method="OPTIONS").status_code == 204
    assert client.post("/api/examenes/importar", data={}, content_type="multipart/form-data").status_code == 400

    bad = client.post(
        "/api/examenes/importar",
        data={"files": (io.BytesIO(b"x"), "mal.exe")},
        content_type="multipart/form-data",
    )
    assert bad.status_code == 415

    ok = client.post(
        "/api/examenes/importar",
        data={"files": (io.BytesIO(b"contenido"), "examen demo.docx")},
        content_type="multipart/form-data",
    )
    assert ok.status_code == 200, ok.get_data(as_text=True)
    item = ok.get_json()["items"][0]
    assert item["total_preguntas"] == 7

    listado = client.get("/api/examenes/importados")
    assert listado.status_code == 200 and listado.get_json()[0]["nombre"].endswith(".docx")

    # delete_file=0 no borra el archivo, pero sí cubre la ruta de eliminación DB.
    assert client.delete(f"/api/examenes/importados/{item['id']}?delete_file=0").status_code == 200
    assert client.delete("/api/examenes/importados/999").status_code == 404

    # cleanup borra registros relacionados y archivos sueltos de la carpeta.
    extra = Path(app_module.app.config["UPLOADS_EXAM_DIR"]) / "basura.docx"
    extra.write_bytes(b"trash")
    conn = app_module.get_connection(); cur = conn.cursor()
    cur.execute("INSERT INTO examenes_importados(id,nombre,ruta,total_preguntas) VALUES (5,'b',?,1)", (str(extra),))
    cur.execute("INSERT INTO claves_tipo(examen_id,grupo_id,codigo,orden,activo) VALUES (5,1,'P',1,1)")
    cur.execute("INSERT INTO claves_respuesta(id,examen_id,grupo_id,numero_pregunta,origen) VALUES (10,5,1,1,'A')")
    cur.execute("INSERT INTO claves_respuesta_detalle(claves_respuesta_id,tipo_id,clave) VALUES (10,1,'B')")
    conn.commit(); cur.close(); conn.close()
    assert client.post("/api/examenes/importados/limpiar").status_code == 200
    assert not extra.exists()


def test_banco_download_editar_eliminar_y_zip(client, app_module, tmp_path, monkeypatch):
    _patch_db(app_module, tmp_path, monkeypatch)
    preg = _make_docx(tmp_path / "preg.docx")
    sol = _make_docx(tmp_path / "sol.docx", "Solución")
    conn = app_module.get_connection(); cur = conn.cursor()
    cur.execute("INSERT INTO temario(id,nombre) VALUES (1,'ÁLGEBRA'),(2,'FÍSICA')")
    cur.execute(
        "INSERT INTO tema_docs(id,tema_id,doc_preguntas_nombre,doc_preguntas_ruta,doc_sol_nombre,doc_sol_ruta) VALUES (1,1,'preg.docx',?,'sol.docx',?)",
        (str(preg), str(sol)),
    )
    cur.execute("INSERT INTO preguntas(tema_id,examenes_idexamenes,numero_p,archivo_nombre,archivo_ruta) VALUES (1,NULL,1,'preg.docx',?)", (str(preg),))
    conn.commit(); cur.close(); conn.close()

    lista = client.get("/api/banco_preguntas")
    assert lista.status_code == 200 and lista.get_json()[0]["tema_nombre"] == "ÁLGEBRA"
    assert client.get("/api/banco_preguntas/999/download/preguntas").status_code == 404
    assert client.get("/api/banco_preguntas/1/download/preguntas").status_code == 200
    assert client.get("/api/banco_preguntas/1/download/solucionario").status_code == 200

    full = client.get("/api/banco_preguntas/1/download")
    assert full.status_code == 200
    with zipfile.ZipFile(io.BytesIO(full.data)) as zf:
        assert {"preg.docx", "sol.docx"}.issubset(set(zf.namelist()))

    edit = client.put("/api/banco_preguntas/1", json={"tema_id": 2})
    assert edit.status_code == 200 and edit.get_json()["ok"] is True

    delete = client.delete("/api/banco_preguntas/1")
    assert delete.status_code == 200
    assert not preg.exists() and not sol.exists()
    assert client.delete("/api/banco_preguntas/999").status_code == 404


def test_banco_importar_reemplazar_y_solucionarios(client, app_module, tmp_path, monkeypatch):
    _patch_db(app_module, tmp_path, monkeypatch)
    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda _p: 1, raising=False)
    monkeypatch.setattr(app_module, "_validar_docx_real", lambda _p: None, raising=False)

    conn = app_module.get_connection(); cur = conn.cursor()
    cur.execute("INSERT INTO temario(id,nombre) VALUES (1,'QUÍMICA')")
    conn.commit(); cur.close(); conn.close()

    assert client.post("/api/banco_preguntas", data={}, content_type="multipart/form-data").status_code == 400
    r = client.post(
        "/api/banco_preguntas",
        data={"tema_id": "1", "doc_preguntas": (io.BytesIO(_make_docx(tmp_path / "p.docx").read_bytes()), "p.docx")},
        content_type="multipart/form-data",
    )
    assert r.status_code == 200, r.get_data(as_text=True)

    # reemplazo inválido por conteo distinto a 1
    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda _p: 2, raising=False)
    bad = client.post(
        "/api/banco_preguntas/1/reemplazar/preguntas",
        data={"doc_preguntas": (io.BytesIO(_make_docx(tmp_path / "p2.docx").read_bytes()), "p2.docx")},
        content_type="multipart/form-data",
    )
    assert bad.status_code == 400

    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda _p: 1, raising=False)
    ok = client.post(
        "/api/banco_preguntas/1/reemplazar/preguntas",
        data={"doc_preguntas": (io.BytesIO(_make_docx(tmp_path / "p3.docx").read_bytes()), "p3.docx")},
        content_type="multipart/form-data",
    )
    assert ok.status_code == 200

    assert client.post("/api/banco_preguntas/solucionario", data={}, content_type="multipart/form-data").status_code == 400
    sol = client.post(
        "/api/banco_preguntas/solucionario",
        data={"tema_id": "1", "doc_solucionario": (io.BytesIO(_make_docx(tmp_path / "s.docx", "Sol").read_bytes()), "s.docx")},
        content_type="multipart/form-data",
    )
    assert sol.status_code == 200, sol.get_data(as_text=True)

    repl_sol = client.post(
        "/api/banco_preguntas/1/reemplazar/solucionario",
        data={"doc_solucionario": (io.BytesIO(_make_docx(tmp_path / "s2.docx", "Sol2").read_bytes()), "s2.docx")},
        content_type="multipart/form-data",
    )
    assert repl_sol.status_code == 200


def test_banco_preview_con_pdf_simulado(client, app_module, tmp_path, monkeypatch):
    _patch_db(app_module, tmp_path, monkeypatch)
    preg = _make_docx(tmp_path / "preg_prev.docx")
    conn = app_module.get_connection(); cur = conn.cursor()
    cur.execute("INSERT INTO temario(id,nombre) VALUES (1,'RAZONAMIENTO')")
    cur.execute("INSERT INTO tema_docs(id,tema_id,doc_preguntas_nombre,doc_preguntas_ruta) VALUES (1,1,'p.docx',?)", (str(preg),))
    conn.commit(); cur.close(); conn.close()
    pdf = tmp_path / "preview.pdf"; pdf.write_bytes(b"%PDF-1.4")
    monkeypatch.setattr(app_module, "generar_pdf_preview", lambda *_a, **_k: str(pdf), raising=False)
    resp = client.get("/api/banco_preguntas/1/preview")
    assert resp.status_code == 200, resp.get_data(as_text=True)
    assert resp.get_json()["ok"] is True
    assert client.get("/api/banco_preguntas/999/preview").status_code == 404

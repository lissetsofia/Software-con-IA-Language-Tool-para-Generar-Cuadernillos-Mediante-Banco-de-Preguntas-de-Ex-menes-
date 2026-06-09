import io
import os
import sqlite3
from pathlib import Path
from docx import Document


def _connect(db_path):
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _docx_bytes(text="1. Pregunta de prueba"):
    bio = io.BytesIO()
    doc = Document()
    doc.add_paragraph(text)
    doc.save(bio)
    bio.seek(0)
    return bio


def _patch_banco(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov14_banco.sqlite3"
    conn = _connect(db_path)
    conn.executescript(
        """
        CREATE TABLE temario(id INTEGER PRIMARY KEY, nombre TEXT, activo INTEGER DEFAULT 1);
        CREATE TABLE tema_docs(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tema_id INTEGER,
            doc_preguntas_nombre TEXT,
            doc_preguntas_ruta TEXT,
            doc_sol_nombre TEXT,
            doc_sol_ruta TEXT,
            fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE preguntas(
            idpreguntas INTEGER PRIMARY KEY AUTOINCREMENT,
            examenes_idexamenes INTEGER,
            tema_id INTEGER,
            numero_p INTEGER,
            archivo_nombre TEXT,
            archivo_ruta TEXT,
            enunciado TEXT,
            alternativa_a TEXT,
            alternativa_b TEXT,
            alternativa_c TEXT,
            alternativa_d TEXT
        );
        """
    )
    conn.execute("INSERT INTO temario(id,nombre,activo) VALUES(1,'Álgebra',1)")
    conn.execute("INSERT INTO temario(id,nombre,activo) VALUES(2,'Física',1)")
    conn.commit(); conn.close()

    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path), raising=False)
    banco_p = tmp_path / "banco" / "preguntas"; banco_p.mkdir(parents=True, exist_ok=True)
    banco_s = tmp_path / "banco" / "solucionarios"; banco_s.mkdir(parents=True, exist_ok=True)
    desc = tmp_path / "descargas"; desc.mkdir(exist_ok=True)
    monkeypatch.setattr(app_module, "BANCO_PREG_DIR", str(banco_p), raising=False)
    monkeypatch.setattr(app_module, "BANCO_SOL_DIR", str(banco_s), raising=False)
    monkeypatch.setattr(app_module, "DESCARGAS_DIR", str(desc), raising=False)
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(desc))
    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda _p: 1, raising=False)
    monkeypatch.setattr(app_module, "_validar_docx_real", lambda _p: None, raising=False)

    def fake_pdf_preview(ruta_docx, nombre_base=None):
        out = desc / f"{nombre_base or 'preview'}.pdf"
        out.write_bytes(b"%PDF-1.4\n%fake\n")
        return str(out)
    monkeypatch.setattr(app_module, "generar_pdf_preview", fake_pdf_preview, raising=False)
    return db_path, banco_p, banco_s, desc


def test_banco_importar_reemplazar_preview_download_y_eliminar(client, app_module, tmp_path, monkeypatch):
    db_path, _banco_p, _banco_s, _desc = _patch_banco(app_module, tmp_path, monkeypatch)

    assert client.get("/api/banco_preguntas").status_code == 200
    assert client.post("/api/banco_preguntas", data={}).status_code == 400

    crear = client.post("/api/banco_preguntas", data={
        "tema_id": "1",
        "doc_preguntas": (_docx_bytes("1. ¿Pregunta banco?"), "pregunta.docx"),
    }, content_type="multipart/form-data")
    assert crear.status_code == 200
    assert crear.get_json()["ok"] is True

    conn = _connect(db_path)
    assert conn.execute("SELECT COUNT(*) FROM tema_docs").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM preguntas WHERE examenes_idexamenes IS NULL").fetchone()[0] == 1
    conn.close()

    # Solucionario: ramas de validación y éxito.
    assert client.post("/api/banco_preguntas/solucionario", data={}).status_code == 400
    sol = client.post("/api/banco_preguntas/solucionario", data={
        "tema_id": "1",
        "doc_solucionario": (_docx_bytes("Solución"), "sol.docx"),
    }, content_type="multipart/form-data")
    assert sol.status_code == 200

    prev = client.get("/api/banco_preguntas/1/preview")
    assert prev.status_code == 200
    assert prev.get_json()["ok"] is True
    assert prev.get_json()["tiene_solucionario"] is True

    assert client.get("/api/banco_preguntas/1/download/preguntas").status_code == 200
    assert client.get("/api/banco_preguntas/1/download/solucionario").status_code == 200
    assert client.get("/api/banco_preguntas/1/download").status_code == 200
    assert client.get("/api/banco_preguntas/999/download").status_code == 404

    assert client.put("/api/banco_preguntas/1", json={"tema_id": 2}).status_code == 200

    # Reemplazo inválido: no toca BD y devuelve 400.
    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda _p: 2, raising=False)
    bad = client.post("/api/banco_preguntas/1/reemplazar/preguntas", data={
        "doc_preguntas": (_docx_bytes("1. Una\n2. Dos"), "bad.docx"),
    }, content_type="multipart/form-data")
    assert bad.status_code == 400

    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda _p: 1, raising=False)
    ok = client.post("/api/banco_preguntas/1/reemplazar/preguntas", data={
        "doc_preguntas": (_docx_bytes("1. Nueva"), "nueva.docx"),
    }, content_type="multipart/form-data")
    assert ok.status_code == 200

    assert client.post("/api/banco_preguntas/1/reemplazar/solucionario", data={}).status_code == 400
    repl_sol = client.post("/api/banco_preguntas/1/reemplazar/solucionario", data={
        "doc_solucionario": (_docx_bytes("Sol nueva"), "sol2.docx"),
    }, content_type="multipart/form-data")
    assert repl_sol.status_code == 200

    eliminar = client.delete("/api/banco_preguntas/1")
    assert eliminar.status_code == 200
    assert eliminar.get_json()["ok"] is True
    assert client.get("/api/banco_preguntas/1/preview").status_code == 404

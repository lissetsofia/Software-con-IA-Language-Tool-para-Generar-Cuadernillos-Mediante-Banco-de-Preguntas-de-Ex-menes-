import os
import sqlite3
from pathlib import Path

from docx import Document


def _connect(db_path):
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _make_docx(path, text="1. Pregunta"):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = Document(); doc.add_paragraph(text); doc.save(path)
    return path


def _patch_db(app_module, tmp_path, monkeypatch, cantidad=1, archivo=True):
    db_path = tmp_path / "cov18_matriz_db.sqlite3"
    if db_path.exists():
        db_path.unlink()
    src = _make_docx(tmp_path / "tema.docx") if archivo else None
    conn = _connect(db_path)
    conn.executescript("""
        CREATE TABLE matriz(id INTEGER PRIMARY KEY, nombre TEXT);
        CREATE TABLE temario(id INTEGER PRIMARY KEY, nombre TEXT);
        CREATE TABLE matriz_detalle(id INTEGER PRIMARY KEY, matriz_id INTEGER, tema_id INTEGER, cantidad INTEGER, orden INTEGER, archivo_ruta TEXT);
    """)
    conn.execute("INSERT INTO matriz(id,nombre) VALUES(1,'Matriz COV18')")
    conn.execute("INSERT INTO temario(id,nombre) VALUES(1,'Álgebra')")
    conn.execute(
        "INSERT INTO matriz_detalle(id,matriz_id,tema_id,cantidad,orden,archivo_ruta) VALUES(1,1,1,?,?,?)",
        (cantidad, 1, str(src) if src else None),
    )
    conn.commit(); conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path), raising=False)
    out = tmp_path / "descargas_matriz"
    out.mkdir(exist_ok=True)
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(out))
    return db_path, src


def test_matriz_generar_db_errores_grandes(client, app_module, tmp_path, monkeypatch):
    _patch_db(app_module, tmp_path, monkeypatch, cantidad=1, archivo=True)
    assert client.post("/api/matriz/999/generar").status_code == 404

    _patch_db(app_module, tmp_path, monkeypatch, cantidad=1, archivo=False)
    r_falta = client.post("/api/matriz/1/generar")
    assert r_falta.status_code == 400
    assert "falta subir" in r_falta.get_json()["error"].lower()

    _patch_db(app_module, tmp_path, monkeypatch, cantidad=3, archivo=True)
    monkeypatch.setattr(app_module, "_contar_preguntas_docx", lambda *_a, **_k: 1, raising=False)
    r_insuf = client.post("/api/matriz/1/generar")
    assert r_insuf.status_code == 409
    assert r_insuf.get_json()["ok"] is False

    _patch_db(app_module, tmp_path, monkeypatch, cantidad=1, archivo=True)
    monkeypatch.setattr(app_module, "_contar_preguntas_docx", lambda *_a, **_k: 2, raising=False)
    monkeypatch.setattr(app_module, "_cut_docx_to_individual_question_docs", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("corte malo")), raising=False)
    r_cut = client.post("/api/matriz/1/generar")
    assert r_cut.status_code == 500
    assert "falló el recorte" in r_cut.get_json()["error"].lower()

    _patch_db(app_module, tmp_path, monkeypatch, cantidad=0, archivo=True)
    r_empty = client.post("/api/matriz/1/generar")
    assert r_empty.status_code == 400
    assert "no tiene temas" in r_empty.get_json()["error"].lower()


def test_matriz_generar_db_merge_malos_y_success(client, app_module, tmp_path, monkeypatch):
    _patch_db(app_module, tmp_path, monkeypatch, cantidad=1, archivo=True)
    frag = _make_docx(tmp_path / "frag.docx", "fragmento")
    monkeypatch.setattr(app_module, "_contar_preguntas_docx", lambda *_a, **_k: 5, raising=False)
    monkeypatch.setattr(app_module, "_cut_docx_to_individual_question_docs", lambda *_a, **_k: [str(frag)], raising=False)
    monkeypatch.setattr(app_module, "_com_disponible", lambda: False, raising=False)
    monkeypatch.setattr(app_module, "_post_merge_fix_numbering", lambda *_a, **_k: None, raising=False)
    monkeypatch.setattr(app_module, "bullets_to_numbers_docx", lambda *_a, **_k: None, raising=False)
    monkeypatch.setattr(app_module, "reparar_docx_inplace", lambda *_a, **_k: None, raising=False)

    def merge_bad(grouped, out_path):
        _make_docx(out_path, "parcial")
        return out_path, [], [(str(frag), "no insertó")]

    monkeypatch.setattr(app_module, "_merge_grouped_with_headings", merge_bad, raising=False)
    r_bad = client.post("/api/matriz/1/generar")
    assert r_bad.status_code == 409
    assert "detalles" in r_bad.get_json()

    def merge_ok(grouped, out_path):
        _make_docx(out_path, "matriz final")
        return out_path, [], []

    monkeypatch.setattr(app_module, "_merge_grouped_with_headings", merge_ok, raising=False)
    r_ok = client.post("/api/matriz/1/generar")
    assert r_ok.status_code == 200
    assert "wordprocessingml.document" in r_ok.headers.get("Content-Type", "")

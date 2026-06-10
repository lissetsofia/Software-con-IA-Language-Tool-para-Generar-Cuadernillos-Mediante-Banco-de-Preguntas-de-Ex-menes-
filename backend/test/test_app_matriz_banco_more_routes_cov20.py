import os
import sqlite3
from pathlib import Path

from flask import jsonify
from docx import Document


def _connect(db_path):
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _make_docx(path, text="1. Pregunta"):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = Document()
    doc.add_paragraph(text)
    doc.save(path)
    return path


def _patch_banco(app_module, tmp_path, monkeypatch, with_files=True, with_sol=True):
    db_path = tmp_path / "cov20_banco.sqlite3"
    if db_path.exists():
        db_path.unlink()
    preg = tmp_path / "preg.docx"
    sol = tmp_path / "sol.docx"
    if with_files:
        _make_docx(preg, "preg")
        if with_sol:
            _make_docx(sol, "sol")
    conn = _connect(db_path)
    conn.executescript("""
        CREATE TABLE temario(id INTEGER PRIMARY KEY, nombre TEXT);
        CREATE TABLE tema_docs(
            id INTEGER PRIMARY KEY,
            tema_id INTEGER,
            doc_preguntas_ruta TEXT,
            doc_sol_ruta TEXT
        );
    """)
    conn.execute("INSERT INTO temario(id,nombre) VALUES(1,'Álgebra'),(2,'Geometría')")
    conn.execute(
        "INSERT INTO tema_docs(id,tema_id,doc_preguntas_ruta,doc_sol_ruta) VALUES(10,1,?,?)",
        (str(preg), str(sol) if with_sol else None),
    )
    conn.commit(); conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path), raising=False)
    return db_path, preg, sol


def test_matriz_desde_banco_validaciones_db_faltantes_y_success(client, app_module, tmp_path, monkeypatch):
    assert client.post("/api/matriz/generar_desde_banco", json={}).status_code == 400
    assert client.post("/api/matriz/generar_desde_banco", json={"items": [{"tema_id": "x", "doc_ids": [1]}]}).status_code == 400

    _patch_banco(app_module, tmp_path, monkeypatch, with_files=False)
    falt = client.post("/api/matriz/generar_desde_banco", json={"items": [{"tema_id": 1, "doc_ids": [10]}]})
    assert falt.status_code == 400
    assert "faltantes" in falt.get_json()

    _patch_banco(app_module, tmp_path, monkeypatch, with_files=True)

    def fake_generar(grouped_data, out_path, log_prefix=""):
        assert grouped_data[0][1] == "Álgebra"
        assert os.path.basename(out_path).endswith(".docx")
        return jsonify(ok=True, cantidad=len(grouped_data), log_prefix=log_prefix)

    monkeypatch.setattr(app_module, "_generar_matriz_banco_docx_robusto", fake_generar, raising=False)
    ok = client.post(
        "/api/matriz/generar_desde_banco",
        json={"nombre": "COV20", "items": [{"tema_id": 1, "doc_ids": [10]}, {"tema_id": 2, "doc_ids": []}]},
    )
    assert ok.status_code == 200
    assert ok.get_json()["ok"] is True

    monkeypatch.setattr(app_module, "get_connection", lambda: (_ for _ in ()).throw(RuntimeError("db rota")), raising=False)
    err = client.post("/api/matriz/generar_desde_banco", json={"items": [{"tema_id": 1, "doc_ids": [10]}]})
    assert err.status_code == 500


def test_matriz_desde_banco_solucionario_validaciones_y_success(client, app_module, tmp_path, monkeypatch):
    assert client.post("/api/matriz/generar_desde_banco/solucionario", json={}).status_code == 400
    assert client.post("/api/matriz/generar_desde_banco/solucionario", json={"items": [{"tema_id": 1, "doc_ids": ["x"]}]}).status_code == 400

    _patch_banco(app_module, tmp_path, monkeypatch, with_files=True, with_sol=False)
    miss_sol = client.post(
        "/api/matriz/generar_desde_banco/solucionario",
        json={"items": [{"tema_id": 1, "doc_ids": [10, 999]}]},
    )
    assert miss_sol.status_code in (400, 409)
    assert "faltantes" in miss_sol.get_json() or "faltantes_sol" in miss_sol.get_json()

    _patch_banco(app_module, tmp_path, monkeypatch, with_files=True, with_sol=True)

    def fake_generar(grouped_data, out_path, log_prefix=""):
        assert grouped_data[0][2]
        return jsonify(ok=True, sol=True, total=len(grouped_data))

    monkeypatch.setattr(app_module, "_generar_matriz_banco_docx_robusto", fake_generar, raising=False)
    ok = client.post(
        "/api/matriz/generar_desde_banco/solucionario",
        json={"nombre": "SOL", "items": [{"tema_id": 1, "doc_ids": [10]}]},
    )
    assert ok.status_code == 200
    assert ok.get_json()["ok"] is True

import os
import sqlite3
from pathlib import Path

from docx import Document
from flask import jsonify


def _connect(db_path):
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _make_docx(path, text="Documento banco"):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = Document()
    doc.add_paragraph(text)
    doc.save(path)
    return path


def _patch_banco_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov17_matriz_banco.sqlite3"
    preg = _make_docx(tmp_path / "banco" / "preg1.docx", "Pregunta banco")
    sol = _make_docx(tmp_path / "banco" / "sol1.docx", "Solucionario banco")
    missing = tmp_path / "banco" / "no_existe.docx"
    conn = _connect(db_path)
    conn.executescript(
        """
        CREATE TABLE temario(id INTEGER PRIMARY KEY, nombre TEXT, activo INTEGER DEFAULT 1);
        CREATE TABLE tema_docs(
            id INTEGER PRIMARY KEY,
            tema_id INTEGER,
            doc_preguntas_ruta TEXT,
            doc_sol_ruta TEXT
        );
        """
    )
    conn.executemany("INSERT INTO temario(id,nombre,activo) VALUES(?,?,1)", [(1, "Álgebra"), (2, "Física")])
    conn.execute("INSERT INTO tema_docs(id,tema_id,doc_preguntas_ruta,doc_sol_ruta) VALUES(10,1,?,?)", (str(preg), str(sol)))
    conn.execute("INSERT INTO tema_docs(id,tema_id,doc_preguntas_ruta,doc_sol_ruta) VALUES(11,1,?,?)", (str(missing), str(sol)))
    conn.execute("INSERT INTO tema_docs(id,tema_id,doc_preguntas_ruta,doc_sol_ruta) VALUES(12,1,?,NULL)", (str(preg),))
    conn.execute("INSERT INTO tema_docs(id,tema_id,doc_preguntas_ruta,doc_sol_ruta) VALUES(13,1,?,?)", (str(preg), str(missing)))
    conn.commit(); conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path), raising=False)
    desc = tmp_path / "desc"; desc.mkdir(exist_ok=True)
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(desc))
    monkeypatch.setattr(app_module, "DESCARGAS_DIR", str(desc), raising=False)
    return preg, sol, missing


def test_matriz_generar_desde_banco_validaciones_y_success(client, app_module, tmp_path, monkeypatch):
    _patch_banco_db(app_module, tmp_path, monkeypatch)

    assert client.post("/api/matriz/generar_desde_banco", json={}).status_code == 400
    r_invalid = client.post("/api/matriz/generar_desde_banco", json={"items": [{"tema_id": "x", "doc_ids": [10]}]})
    assert r_invalid.status_code == 400

    r_missing_file = client.post(
        "/api/matriz/generar_desde_banco",
        json={"nombre": "X", "items": [{"tema_id": 1, "doc_ids": [11]}]},
    )
    assert r_missing_file.status_code == 400
    assert "no existen" in r_missing_file.get_json()["error"].lower()

    seen = {}

    def fake_generar(grouped_data, out_path, log_prefix=""):
        seen["grouped"] = grouped_data
        seen["out_path"] = out_path
        seen["prefix"] = log_prefix
        return jsonify(ok=True, archivo=os.path.basename(out_path), temas=len(grouped_data))

    monkeypatch.setattr(app_module, "_generar_matriz_banco_docx_robusto", fake_generar, raising=False)
    r_ok = client.post(
        "/api/matriz/generar_desde_banco",
        json={"nombre": "Banco OK", "items": [
            {"tema_id": 1, "doc_ids": [10]},
            {"tema_id": 2, "doc_ids": []},
        ]},
    )
    assert r_ok.status_code == 200
    assert r_ok.get_json()["ok"] is True
    assert seen["prefix"] == "[MATRIZ_BANCO]"
    assert seen["grouped"][0][1] == "Álgebra"
    assert seen["grouped"][1][1] == "Física"


def test_matriz_generar_desde_banco_solucionario_ramas(client, app_module, tmp_path, monkeypatch):
    _patch_banco_db(app_module, tmp_path, monkeypatch)

    assert client.post("/api/matriz/generar_desde_banco/solucionario", json={}).status_code == 400
    r_invalid = client.post("/api/matriz/generar_desde_banco/solucionario", json={"items": [{"tema_id": 1, "doc_ids": ["x"]}]})
    assert r_invalid.status_code == 400

    r_no_reg = client.post(
        "/api/matriz/generar_desde_banco/solucionario",
        json={"items": [{"tema_id": 1, "doc_ids": [999]}]},
    )
    assert r_no_reg.status_code == 409
    assert "faltan solucionarios" in r_no_reg.get_json()["error"].lower()

    r_sin_sol = client.post(
        "/api/matriz/generar_desde_banco/solucionario",
        json={"items": [{"tema_id": 1, "doc_ids": [12]}]},
    )
    assert r_sin_sol.status_code == 409
    assert "sin doc_sol_ruta" in str(r_sin_sol.get_json()["faltantes"]).lower()

    r_sol_missing = client.post(
        "/api/matriz/generar_desde_banco/solucionario",
        json={"items": [{"tema_id": 1, "doc_ids": [13]}]},
    )
    assert r_sol_missing.status_code == 409
    assert "no existe" in str(r_sol_missing.get_json()["faltantes"]).lower()

    def fake_generar(grouped_data, out_path, log_prefix=""):
        assert log_prefix == "[MATRIZ_BANCO_SOL]"
        assert grouped_data[0][1] == "Álgebra"
        assert grouped_data[0][2]
        return jsonify(ok=True, archivo=os.path.basename(out_path), solucionario=True)

    monkeypatch.setattr(app_module, "_generar_matriz_banco_docx_robusto", fake_generar, raising=False)
    r_ok = client.post(
        "/api/matriz/generar_desde_banco/solucionario",
        json={"nombre": "Banco SOL", "items": [{"tema_id": 1, "doc_ids": [10]}]},
    )
    assert r_ok.status_code == 200
    assert r_ok.get_json()["solucionario"] is True

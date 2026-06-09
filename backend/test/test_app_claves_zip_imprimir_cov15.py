import io
import os
import sqlite3
import zipfile
from pathlib import Path

from docx import Document


def _connect(db_path):
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _docx_bytes(text="Documento"):
    bio = io.BytesIO()
    doc = Document()
    doc.add_paragraph(text)
    doc.save(bio)
    return bio.getvalue()


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov15_claves_zip.sqlite3"
    src_docx = tmp_path / "examen_importado.docx"
    src_docx.write_bytes(_docx_bytes("1. Pregunta con alternativas"))
    conn = _connect(db_path)
    conn.executescript(
        """
        CREATE TABLE examenes_importados(
            id INTEGER PRIMARY KEY,
            nombre TEXT,
            ruta TEXT,
            extension TEXT,
            total_preguntas INTEGER DEFAULT 0,
            fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE grupos(idgrupo INTEGER PRIMARY KEY, clave TEXT, nombre TEXT, activo INTEGER DEFAULT 1);
        """
    )
    conn.execute("INSERT INTO examenes_importados(id,nombre,ruta,extension,total_preguntas) VALUES(1,'examen.docx',?, 'docx', 2)", (str(src_docx),))
    conn.execute("INSERT INTO grupos(idgrupo,clave,nombre,activo) VALUES(1,'A','Grupo A',1)")
    conn.execute("INSERT INTO grupos(idgrupo,clave,nombre,activo) VALUES(2,'B','Grupo B',1)")
    conn.commit(); conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path), raising=False)
    return db_path, src_docx


def test_build_salidas_descargar_all_e_imprimir_claves(client, app_module, tmp_path, monkeypatch):
    db_path, _src_docx = _patch_db(app_module, tmp_path, monkeypatch)

    filas = [
        {"numero_pregunta": 1, "origen": "A", "P": "B", "Q": "C"},
        {"numero_pregunta": 2, "origen": "D", "P": "E", "Q": "A"},
    ]

    monkeypatch.setattr(app_module, "fetch_claves_pivot", lambda conn, ex, grupo: (filas, ["P", "Q"]), raising=False)
    monkeypatch.setattr(app_module, "api_claves_ensure_internal", lambda *a, **k: 2, raising=False)
    monkeypatch.setattr(app_module, "generar_docx_tipo_para_grupo", lambda ruta, fp, t: _docx_bytes(f"tipo {t}"), raising=False)
    monkeypatch.setattr(app_module, "_asegurar_docx_bytes_valido_como_grupo", lambda b, nombre: b, raising=False)

    conn = _connect(db_path)
    salidas, claves_all, tipos, err = app_module._build_salidas_y_claves(conn, [1], grupo_id_fijo=1)
    conn.close()
    assert err is None
    assert len(salidas) == 1
    assert len(claves_all) == 2
    assert tipos == ["P", "Q"]

    r_zip = client.post("/api/pruebas/descargar_all", json={"examen_ids": [1], "grupo_id": 1})
    assert r_zip.status_code == 200
    with zipfile.ZipFile(io.BytesIO(r_zip.data)) as z:
        names = set(z.namelist())
    assert "EXAMEN_1_A_P.docx" in names
    assert "EXAMEN_1_A_Q.docx" in names
    assert "CLAVES_RESPUESTA.docx" in names

    r_temas = client.post("/api/pruebas/descargar_all", json={"examen_ids": [1], "grupo_id": 1, "solo_temas": True})
    assert r_temas.status_code == 200
    with zipfile.ZipFile(io.BytesIO(r_temas.data)) as z:
        names_temas = set(z.namelist())
    assert "TEMAS_A_P.docx" in names_temas
    assert "CLAVES_RESPUESTA.docx" not in names_temas

    assert client.post("/api/claves/imprimir", json={}).status_code == 400
    assert client.post("/api/claves/imprimir", json={"examen_ids": [1]}).status_code == 400

    def fake_generar_pdf(ruta_docx):
        out = tmp_path / "claves de respuesta grupo A.pdf"
        out.write_bytes(b"%PDF-1.4\nclaves\n")
        return str(out)

    monkeypatch.setattr(app_module, "generar_pdf", fake_generar_pdf, raising=False)
    r_print = client.post("/api/claves/imprimir", json={"examen_ids": [1], "grupo_id": 1})
    assert r_print.status_code == 200
    data = r_print.get_json()
    assert data["ok"] is True
    assert data["archivo_pdf"].endswith(".pdf")
    assert os.path.exists(data["ruta_pdf_abs"])

    # Rama todos_los_grupos: procesa A y B y usa nombre genérico.
    r_print_all = client.post("/api/claves/imprimir", json={"examen_ids": [1], "todos_los_grupos": True})
    assert r_print_all.status_code == 200

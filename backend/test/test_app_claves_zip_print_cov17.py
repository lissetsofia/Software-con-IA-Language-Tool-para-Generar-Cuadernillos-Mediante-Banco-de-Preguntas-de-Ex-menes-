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


def _docx_bytes(text="DOCX"):
    bio = io.BytesIO()
    doc = Document()
    doc.add_paragraph(text)
    doc.save(bio)
    return bio.getvalue()


def _make_docx(path, text="Examen"):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(_docx_bytes(text))
    return path


def _patch_claves_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov17_claves.sqlite3"
    if db_path.exists():
        db_path.unlink()
    docx = _make_docx(tmp_path / "importados" / "grupo_A.docx")
    conn = _connect(db_path)
    conn.executescript(
        """
        CREATE TABLE examenes_importados(id INTEGER PRIMARY KEY, nombre TEXT, ruta TEXT, total_preguntas INTEGER);
        CREATE TABLE grupos(idgrupo INTEGER PRIMARY KEY, clave TEXT, nombre TEXT, activo INTEGER DEFAULT 1);
        CREATE TABLE claves_tipo(id INTEGER PRIMARY KEY AUTOINCREMENT, examen_id INTEGER, grupo_id INTEGER, codigo TEXT, orden INTEGER, activo INTEGER DEFAULT 1);
        CREATE TABLE claves_respuesta(id INTEGER PRIMARY KEY AUTOINCREMENT, examen_id INTEGER, grupo_id INTEGER, numero_pregunta INTEGER, origen TEXT);
        CREATE TABLE claves_respuesta_detalle(id INTEGER PRIMARY KEY AUTOINCREMENT, claves_respuesta_id INTEGER, tipo_id INTEGER, clave TEXT);
        """
    )
    conn.execute("INSERT INTO examenes_importados(id,nombre,ruta,total_preguntas) VALUES(1,'grupo A',?,2)", (str(docx),))
    conn.execute("INSERT INTO grupos(idgrupo,clave,nombre,activo) VALUES(5,'A','Grupo A',1)")
    conn.commit(); conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path), raising=False)
    return db_path, str(docx)


def test_build_salidas_y_claves_errores_y_success(app_module, tmp_path, monkeypatch):
    _patch_claves_db(app_module, tmp_path, monkeypatch)
    conn = app_module.get_connection()

    assert app_module._build_salidas_y_claves(conn, [999], grupo_id_fijo=5)[3].startswith("No se encontraron")
    assert app_module._build_salidas_y_claves(conn, [1], grupo_id_fijo=999)[3] == "Grupo no encontrado"

    cur = conn.cursor()
    cur.execute("UPDATE grupos SET activo=0 WHERE idgrupo=5")
    conn.commit(); cur.close(); conn.close()
    conn = app_module.get_connection()
    assert app_module._build_salidas_y_claves(conn, [1], todos_los_grupos=True)[3] == "No hay grupos activos"
    conn.close()

    db_path, docx = _patch_claves_db(app_module, tmp_path, monkeypatch)

    def fake_fetch(conn, examen_id, grupo_id):
        return ([{"numero_pregunta": 1, "origen": "A", "P": "C", "Q": "D"}], ["P", "Q"])

    monkeypatch.setattr(app_module, "fetch_claves_pivot", fake_fetch, raising=False)
    monkeypatch.setattr(app_module, "api_claves_ensure_internal", lambda *_a, **_k: None, raising=False)
    conn = app_module.get_connection()
    salidas, claves_all, tipos, err = app_module._build_salidas_y_claves(conn, [1], grupo_id_fijo=5)
    conn.close()
    assert err is None
    assert salidas and claves_all and tipos == ["P", "Q"]
    assert salidas[0]["ruta_docx"] == docx


def test_api_descargar_pruebas_all_y_claves_imprimir(client, app_module, tmp_path, monkeypatch):
    _patch_claves_db(app_module, tmp_path, monkeypatch)

    # Descargar all: error propagado desde el builder.
    monkeypatch.setattr(app_module, "_build_salidas_y_claves", lambda *a, **k: (None, None, None, "Grupo no encontrado"), raising=False)
    r_err = client.post("/api/pruebas/descargar_all", json={"examen_ids": [1], "grupo_id": 99})
    assert r_err.status_code == 404

    salidas = [{"ex_id": 1, "ruta_docx": "dummy.docx", "clave_grupo": "A", "filas_pivot": [], "tipos": ["P", "Q"]}]
    claves = [{"grupo": "A", "numero_pregunta": 1, "origen": "A", "P": "B", "Q": "C"}]
    monkeypatch.setattr(app_module, "_build_salidas_y_claves", lambda *a, **k: (salidas, claves, ["P", "Q"], None), raising=False)
    monkeypatch.setattr(app_module, "generar_docx_tipo_para_grupo", lambda *_a, **_k: _docx_bytes("tipo"), raising=False)
    monkeypatch.setattr(app_module, "_asegurar_docx_bytes_valido_como_grupo", lambda b, nombre_base="x": b, raising=False)

    r_zip = client.post("/api/pruebas/descargar_all", json={"examen_ids": [1], "grupo_id": 5})
    assert r_zip.status_code == 200
    with zipfile.ZipFile(io.BytesIO(r_zip.data)) as zf:
        names = set(zf.namelist())
        assert "EXAMEN_1_A_P.docx" in names
        assert "EXAMEN_1_A_Q.docx" in names
        assert "CLAVES_RESPUESTA.docx" in names

    r_temas = client.post("/api/pruebas/descargar_all", json={"examen_ids": [1], "grupo_id": 5, "solo_temas": True})
    assert r_temas.status_code == 200
    with zipfile.ZipFile(io.BytesIO(r_temas.data)) as zf:
        names = set(zf.namelist())
        assert "TEMAS_A_P.docx" in names
        assert "CLAVES_RESPUESTA.docx" not in names

    # Validaciones de impresión.
    assert client.post("/api/claves/imprimir", json={}).status_code == 400
    assert client.post("/api/claves/imprimir", json={"examen_ids": [0], "grupo_id": 5}).status_code == 400
    assert client.post("/api/claves/imprimir", json={"examen_ids": [1]}).status_code == 400

    monkeypatch.setattr(app_module, "_build_salidas_y_claves", lambda *a, **k: ([], [], ["P"], None), raising=False)
    assert client.post("/api/claves/imprimir", json={"examen_ids": [1], "grupo_id": 5}).status_code == 409

    monkeypatch.setattr(app_module, "_build_salidas_y_claves", lambda *a, **k: (salidas, claves, ["P", "Q"], None), raising=False)

    def fake_pdf(docx_path):
        pdf = tmp_path / (Path(docx_path).stem + ".pdf")
        pdf.write_bytes(b"%PDF-1.4\nCOV17")
        return str(pdf)

    monkeypatch.setattr(app_module, "generar_pdf", fake_pdf, raising=False)
    r_print = client.post("/api/claves/imprimir", json={"examen_ids": [1], "grupo_id": 5})
    assert r_print.status_code == 200
    assert r_print.get_json()["ok"] is True
    assert "grupo A" in os.path.basename(r_print.get_json()["ruta_docx_abs"])

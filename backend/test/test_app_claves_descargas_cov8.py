# backend/test/test_app_claves_descargas_cov8.py
import io
import sqlite3
import zipfile
from pathlib import Path

from docx import Document as DocxDocument


def _connect(db_path: Path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _docx_bytes(text="Documento"):
    bio = io.BytesIO()
    doc = DocxDocument()
    doc.add_paragraph(text)
    doc.save(bio)
    return bio.getvalue()


def _make_docx(path: Path, text="Examen"):
    path.write_bytes(_docx_bytes(text))
    return path


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov8_claves.sqlite3"

    def get_connection():
        return _connect(db_path)

    monkeypatch.setattr(app_module, "get_connection", get_connection)
    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute("CREATE TABLE IF NOT EXISTS examenes_importados (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, ruta TEXT)")
    cur.execute("CREATE TABLE IF NOT EXISTS grupos (idgrupo INTEGER PRIMARY KEY AUTOINCREMENT, clave TEXT, nombre TEXT, activo INTEGER DEFAULT 1)")
    cur.execute("CREATE TABLE IF NOT EXISTS claves_tipo (id INTEGER PRIMARY KEY AUTOINCREMENT, examen_id INTEGER, grupo_id INTEGER, codigo TEXT, orden INTEGER DEFAULT 0, activo INTEGER DEFAULT 1)")
    cur.execute("CREATE TABLE IF NOT EXISTS claves_respuesta (id INTEGER PRIMARY KEY AUTOINCREMENT, examen_id INTEGER, grupo_id INTEGER, numero_pregunta INTEGER, origen TEXT, fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP)")
    cur.execute("CREATE TABLE IF NOT EXISTS claves_respuesta_detalle (id INTEGER PRIMARY KEY AUTOINCREMENT, claves_respuesta_id INTEGER, tipo_id INTEGER, clave TEXT, fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(claves_respuesta_id, tipo_id))")
    conn.commit(); cur.close(); conn.close()
    return db_path


def test_pick_helpers_generadores_docx_y_reorder_wrappers(app_module, tmp_path, monkeypatch):
    p, q = app_module.pick_two_distinct_letters()
    assert p in app_module.VALID_LETTERS and q in app_module.VALID_LETTERS and p != q
    assert len(set(app_module.pick_n_distinct_letters(3, exclude="A"))) == 3
    assert "A" not in app_module.pick_distinct_for_tipos(2, exclude_origen="A")

    try:
        app_module.pick_n_distinct_letters(6)
        assert False, "Debió fallar con 6 letras"
    except ValueError:
        pass

    try:
        app_module.pick_distinct_for_tipos(6)
        assert False, "Debió fallar con 6 tipos"
    except ValueError:
        pass

    assert app_module.inferir_clave_grupo_desde_nombre("EXAMEN_GRUPO_A_P.docx") == "A"
    assert app_module.inferir_clave_grupo_desde_nombre("sin grupo.docx") is None

    claves = [
        {"grupo": "A", "numero_pregunta": 1, "origen": "A", "p": "B", "q": "C", "P": "B", "Q": "C"},
        {"grupo": "B", "numero_pregunta": 2, "origen": "B", "P": "D", "Q": "E"},
    ]
    assert app_module.generar_docx_claves_all("base", claves).startswith(b"PK")
    dyn = app_module.generar_docx_claves_all_dinamico(["P", "Q"], claves)
    assert dyn.startswith(b"PK")

    src = _make_docx(tmp_path / "examen_reorder.docx", "1. Pregunta")
    llamadas = []

    def fake_apply(doc, filas, modo="P"):
        llamadas.append(modo)

    monkeypatch.setattr(app_module, "_apply_reorder", fake_apply, raising=False)
    out_tipo = app_module.generar_docx_tipo_para_grupo(str(src), claves, "R")
    assert out_tipo.startswith(b"PK")
    assert llamadas[-1] == "R"

    p_bytes, q_bytes = app_module.generar_docx_pq_para_grupo(str(src), claves, "A", "base")
    assert p_bytes.startswith(b"PK") and q_bytes.startswith(b"PK")
    assert llamadas[-2:] == ["P", "Q"]


def test_build_salidas_y_descargar_all_e_imprimir(client, app_module, tmp_path, monkeypatch):
    db_path = _patch_db(app_module, tmp_path, monkeypatch)
    exam_docx = _make_docx(tmp_path / "examen_importado.docx", "1. Pregunta")

    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute("INSERT INTO examenes_importados (nombre, ruta) VALUES ('examen_importado.docx', ?)", (str(exam_docx),))
    ex_id = int(cur.lastrowid)
    cur.execute("INSERT INTO grupos (clave, nombre, activo) VALUES ('A', 'Grupo A', 1)")
    grupo_id = int(cur.lastrowid)
    cur.execute("INSERT INTO claves_tipo (examen_id, grupo_id, codigo, orden, activo) VALUES (?, ?, 'P', 1, 1)", (ex_id, grupo_id))
    tipo_p = int(cur.lastrowid)
    cur.execute("INSERT INTO claves_tipo (examen_id, grupo_id, codigo, orden, activo) VALUES (?, ?, 'Q', 2, 1)", (ex_id, grupo_id))
    tipo_q = int(cur.lastrowid)
    cur.execute("INSERT INTO claves_respuesta (examen_id, grupo_id, numero_pregunta, origen) VALUES (?, ?, 1, 'A')", (ex_id, grupo_id))
    cr_id = int(cur.lastrowid)
    app_module.upsert_detalle(cur, cr_id, tipo_p, "B")
    app_module.upsert_detalle(cur, cr_id, tipo_q, "C")
    conn.commit()

    monkeypatch.setattr(app_module, "api_claves_ensure_internal", lambda *a, **k: 1, raising=False)
    salidas, claves_all, tipos_global, err = app_module._build_salidas_y_claves(conn, [ex_id], grupo_id_fijo=grupo_id)
    assert err is None
    assert salidas and claves_all and tipos_global == ["P", "Q"]
    conn.close()

    # Descargar_all con ZIP, sin depender de reordenamiento real ni validaciones pesadas.
    monkeypatch.setattr(app_module, "generar_docx_tipo_para_grupo", lambda *_a, **_k: _docx_bytes("tipo"), raising=False)
    monkeypatch.setattr(app_module, "_asegurar_docx_bytes_valido_como_grupo", lambda b, nombre_base="x": b, raising=False)
    r_zip = client.post("/api/pruebas/descargar_all", json={"examen_ids": [ex_id], "grupo_id": grupo_id})
    assert r_zip.status_code == 200
    assert r_zip.data.startswith(b"PK")
    with zipfile.ZipFile(io.BytesIO(r_zip.data)) as z:
        names = z.namelist()
        assert any(n.endswith(".docx") for n in names)
        assert "CLAVES_RESPUESTA.docx" in names

    r_temas = client.post("/api/pruebas/descargar_all", json={"examen_ids": [ex_id], "grupo_id": grupo_id, "solo_temas": True})
    assert r_temas.status_code == 200

    monkeypatch.setattr(app_module, "generar_pdf", lambda ruta: str(tmp_path / "claves.pdf"), raising=False)
    (tmp_path / "claves.pdf").write_bytes(b"%PDF-1.4\n%%EOF")
    r_print = client.post("/api/claves/imprimir", json={"examen_ids": [ex_id], "grupo_id": grupo_id})
    assert r_print.status_code == 200
    assert r_print.get_json()["ok"] is True

    assert client.post("/api/claves/imprimir", json={"examen_ids": []}).status_code == 400
    assert client.post("/api/claves/imprimir", json={"examen_ids": [ex_id]}).status_code == 400

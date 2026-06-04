# backend/test/test_app_routes_claves_importados_cov3.py
import io
import os
import zipfile
import sqlite3
from pathlib import Path


SCHEMA_COV3 = """
CREATE TABLE IF NOT EXISTS temario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    activo INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tema_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tema_id INTEGER,
    doc_preguntas_nombre TEXT,
    doc_preguntas_ruta TEXT,
    doc_sol_nombre TEXT,
    doc_sol_ruta TEXT,
    fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS matriz (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS grupos (
    idgrupo INTEGER PRIMARY KEY AUTOINCREMENT,
    clave TEXT NOT NULL UNIQUE,
    nombre TEXT,
    activo INTEGER DEFAULT 1,
    fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS examenes_importados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    ruta TEXT,
    extension TEXT,
    total_preguntas INTEGER DEFAULT 0,
    fuente TEXT,
    hash_archivo TEXT UNIQUE,
    fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS claves_tipo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    examen_id INTEGER NOT NULL,
    grupo_id INTEGER NOT NULL,
    codigo TEXT NOT NULL,
    orden INTEGER DEFAULT 1,
    activo INTEGER DEFAULT 1,
    UNIQUE(examen_id, grupo_id, codigo)
);

CREATE TABLE IF NOT EXISTS claves_respuesta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    examen_id INTEGER NOT NULL,
    grupo_id INTEGER NOT NULL,
    numero_pregunta INTEGER NOT NULL,
    origen TEXT DEFAULT 'A',
    fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(examen_id, grupo_id, numero_pregunta)
);

CREATE TABLE IF NOT EXISTS claves_respuesta_detalle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claves_respuesta_id INTEGER NOT NULL,
    tipo_id INTEGER NOT NULL,
    clave TEXT,
    fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(claves_respuesta_id, tipo_id)
);
"""


def _connect(db_path: Path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _patch_sqlite(monkeypatch, app_module, db_path: Path):
    def get_connection():
        return _connect(db_path)
    monkeypatch.setattr(app_module, "get_connection", get_connection)


def _seed_base(db_path: Path, tmp_path: Path):
    preg = tmp_path / "pregunta_banco.docx"
    sol = tmp_path / "sol_banco.docx"
    preg.write_bytes(b"fake docx preguntas")
    sol.write_bytes(b"fake docx solucionario")

    conn = _connect(db_path)
    cur = conn.cursor()
    cur.execute("INSERT INTO temario(nombre, activo) VALUES ('Álgebra', 1)")
    cur.execute("INSERT INTO temario(nombre, activo) VALUES ('Historia', 0)")
    cur.execute("INSERT INTO grupos(clave, nombre, activo) VALUES ('A', 'Grupo A', 1)")
    cur.execute("INSERT INTO grupos(clave, nombre, activo) VALUES ('B', 'Grupo B', 0)")
    cur.execute("INSERT INTO matriz(nombre) VALUES ('Matriz A')")
    cur.execute(
        """INSERT INTO tema_docs
           (tema_id, doc_preguntas_nombre, doc_preguntas_ruta, doc_sol_nombre, doc_sol_ruta)
           VALUES (1, 'pregunta_banco.docx', ?, 'sol_banco.docx', ?)""",
        (str(preg), str(sol)),
    )
    cur.execute(
        """INSERT INTO tema_docs
           (tema_id, doc_preguntas_nombre, doc_preguntas_ruta, doc_sol_nombre, doc_sol_ruta)
           VALUES (1, 'sin_sol.docx', ?, NULL, NULL)""",
        (str(preg),),
    )
    cur.execute(
        """INSERT INTO examenes_importados
           (nombre, ruta, extension, total_preguntas, fuente, hash_archivo)
           VALUES ('examen_base.docx', ?, 'docx', 3, 'seed', 'hash-base')""",
        (str(preg),),
    )
    conn.commit()
    conn.close()
    return preg, sol


def test_ping_descargas_y_pruebas_descargar(client, app_module, tmp_path):
    assert client.get("/__ping__").status_code == 200

    descargas = Path(app_module.app.config["DESCARGAS_FOLDER"])
    pdf = descargas / "vista_test.pdf"
    pdf.write_bytes(b"%PDF-1.4\n%fake\n")

    r_api = client.get("/api/descargas/vista_test.pdf")
    assert r_api.status_code == 200
    assert r_api.headers["Content-Type"].startswith("application/pdf")

    r_plain = client.get("/descargas/vista_test.pdf")
    assert r_plain.status_code in (200, 304)

    r_pruebas = client.post("/api/pruebas/descargar", json={"grupo_id": 1, "examen_id": 2})
    assert r_pruebas.status_code == 200
    assert b"Pruebas para grupo" in r_pruebas.data


def test_resumen_temas_temascuad_matrices_y_matriz_banco(client, app_module, monkeypatch, tmp_path):
    db_path = tmp_path / "cov3.sqlite3"
    conn = _connect(db_path)
    conn.executescript(SCHEMA_COV3)
    conn.commit()
    conn.close()
    _patch_sqlite(monkeypatch, app_module, db_path)
    _seed_base(db_path, tmp_path)

    resumen = client.get("/api/banco_preguntas/resumen_temas")
    assert resumen.status_code == 200
    assert resumen.get_json()[0]["tema_nombre"] == "Álgebra"
    assert resumen.get_json()[0]["n_docs"] >= 1

    temas = client.get("/api/temas_cuad")
    assert temas.status_code == 200
    assert all(x["activo"] == 1 for x in temas.get_json())

    temas_all = client.get("/api/temas_cuad?all=1")
    assert temas_all.status_code == 200
    assert len(temas_all.get_json()) >= 2

    matrices = client.get("/api/matrices")
    assert matrices.status_code == 200
    assert matrices.get_json()[0]["nombre"] == "Matriz A"

    llamadas = []

    def fake_generar_matriz(grouped_data, out_path, log_prefix=""):
        llamadas.append((grouped_data, out_path, log_prefix))
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        Path(out_path).write_bytes(b"fake matriz")
        return app_module.jsonify(ok=True, total_temas=len(grouped_data), log_prefix=log_prefix)

    monkeypatch.setattr(app_module, "_generar_matriz_banco_docx_robusto", fake_generar_matriz, raising=False)

    assert client.post("/api/matriz/generar_desde_banco", json={"items": []}).status_code == 400
    assert client.post(
        "/api/matriz/generar_desde_banco",
        json={"items": [{"tema_id": 1, "doc_ids": ["x"]}]},
    ).status_code == 400

    ok = client.post(
        "/api/matriz/generar_desde_banco",
        json={"nombre": "Banco", "items": [{"tema_id": 1, "doc_ids": [1]}]},
    )
    assert ok.status_code == 200
    assert ok.get_json()["ok"] is True
    assert llamadas[-1][2] == "[MATRIZ_BANCO]"

    falta_sol = client.post(
        "/api/matriz/generar_desde_banco/solucionario",
        json={"nombre": "Sol", "items": [{"tema_id": 1, "doc_ids": [2]}]},
    )
    assert falta_sol.status_code == 409

    ok_sol = client.post(
        "/api/matriz/generar_desde_banco/solucionario",
        json={"nombre": "Sol", "items": [{"tema_id": 1, "doc_ids": [1]}]},
    )
    assert ok_sol.status_code == 200
    assert ok_sol.get_json()["log_prefix"] == "[MATRIZ_BANCO_SOL]"


def test_examenes_importar_listar_eliminar_y_limpiar(client, app_module, monkeypatch, tmp_path):
    db_path = tmp_path / "importados.sqlite3"
    conn = _connect(db_path)
    conn.executescript(SCHEMA_COV3)
    conn.commit()
    conn.close()
    _patch_sqlite(monkeypatch, app_module, db_path)

    upload_dir = tmp_path / "uploads_examenes"
    upload_dir.mkdir()
    app_module.app.config["UPLOADS_EXAM_DIR"] = str(upload_dir)

    assert client.open("/api/examenes/importar", method="OPTIONS").status_code == 204
    assert client.post("/api/examenes/importar", data={}, content_type="multipart/form-data").status_code == 400

    bad = client.post(
        "/api/examenes/importar",
        data={"files": (io.BytesIO(b"x"), "no_permitido.txt")},
        content_type="multipart/form-data",
    )
    assert bad.status_code == 415

    monkeypatch.setattr(app_module, "contar_preguntas_docx", lambda path: 4, raising=False)
    ok = client.post(
        "/api/examenes/importar",
        data={"files": (io.BytesIO(b"contenido docx"), "examen_importado.docx")},
        content_type="multipart/form-data",
    )
    assert ok.status_code == 200
    data = ok.get_json()
    assert data["ok"] is True
    assert data["items"][0]["total_preguntas"] == 4

    listado = client.get("/api/examenes/importados")
    assert listado.status_code == 200
    assert any(x["nombre"] == "examen_importado.docx" for x in listado.get_json())

    exam_id = data["items"][0]["id"]
    assert client.delete("/api/examenes/importados/999").status_code == 404
    assert client.delete(f"/api/examenes/importados/{exam_id}?delete_file=0").status_code == 200

    monkeypatch.setattr(app_module, "limpiar_examenes_importados", lambda force=True: True, raising=False)
    limpiar = client.post("/api/examenes/importados/limpiar")
    assert limpiar.status_code == 200
    assert limpiar.get_json()["ok"] is True


def test_claves_ensure_guardar_origen_y_aleatorizar(client, app_module, monkeypatch, tmp_path):
    db_path = tmp_path / "claves.sqlite3"
    conn = _connect(db_path)
    conn.executescript(SCHEMA_COV3)
    conn.commit()
    conn.close()
    _patch_sqlite(monkeypatch, app_module, db_path)
    _seed_base(db_path, tmp_path)

    assert client.get("/api/claves/origen").status_code == 400
    dummy = client.get("/api/claves/origen?examen_id=1&grupo_id=1")
    assert dummy.status_code == 200
    assert len(dummy.get_json()["filas"]) == 10

    ensure = client.post(
        "/api/claves/ensure",
        json={"examen_ids": [1], "grupo_id": 1, "tipos": ["P", "Q", "R"]},
    )
    assert ensure.status_code == 200
    assert ensure.get_json()["items"][0]["total"] == 3

    origen = client.get("/api/claves/origen?examen_id=1&grupo_id=1")
    assert origen.status_code == 200
    assert origen.get_json()["tipos"] == ["P", "Q", "R"]
    assert len(origen.get_json()["filas"]) == 3

    guardar = client.post(
        "/api/claves/guardar",
        json={
            "examen_id": 1,
            "grupo_id": 1,
            "tipos": ["P", "Q", "R"],
            "filas": [
                {"numero_pregunta": 1, "origen": "Z", "P": "A", "Q": "B", "R": "C"},
                {"numero_pregunta": 2, "origen": "D", "p": "E", "q": "A", "R": ""},
                {"numero_pregunta": 0, "origen": "A", "P": "B"},
            ],
        },
    )
    assert guardar.status_code == 200
    assert guardar.get_json()["ok"] is True

    after = client.get("/api/claves/origen?examen_id=1&grupo_id=1").get_json()
    fila1 = next(x for x in after["filas"] if x["numero_pregunta"] == 1)
    assert fila1["origen"] == "A"
    assert fila1["P"] == "A"

    monkeypatch.setattr(
        app_module,
        "pick_distinct_for_tipos",
        lambda n, exclude_origen=None: list("ABCDE")[:n],
        raising=False,
    )
    aleat = client.post(
        "/api/claves/aleatorizar",
        json={"examen_id": 1, "grupo_id": 1, "tipos": ["P", "Q"]},
    )
    assert aleat.status_code == 200
    assert aleat.get_json()["ok"] is True

    assert client.post("/api/claves/guardar", json={"examen_id": 0, "grupo_id": 1}).status_code == 400
    assert client.post("/api/claves/aleatorizar", json={"examen_id": 0, "grupo_id": 1}).status_code == 400


def test_pruebas_descargar_all_y_claves_imprimir_con_build_simulado(client, app_module, monkeypatch, tmp_path):
    db_path = tmp_path / "zip.sqlite3"
    conn = _connect(db_path)
    conn.executescript(SCHEMA_COV3)
    conn.commit()
    conn.close()
    _patch_sqlite(monkeypatch, app_module, db_path)

    def fake_build(conn, examen_ids, todos_los_grupos=False, grupo_id_fijo=0):
        salidas = [
            {
                "ex_id": 7,
                "ruta_docx": str(tmp_path / "base.docx"),
                "grupo_id": 1,
                "clave_grupo": "A",
                "filas_pivot": [{"numero_pregunta": 1, "origen": "A", "P": "B", "Q": "C"}],
                "tipos": ["P", "Q"],
            }
        ]
        claves = [{"grupo": "A", "numero_pregunta": 1, "origen": "A", "P": "B", "Q": "C"}]
        return salidas, claves, ["P", "Q"], None

    monkeypatch.setattr(app_module, "_build_salidas_y_claves", fake_build, raising=False)
    monkeypatch.setattr(app_module, "generar_docx_tipo_para_grupo", lambda ruta, filas, tipo: b"docx bytes", raising=False)
    monkeypatch.setattr(app_module, "_asegurar_docx_bytes_valido_como_grupo", lambda b, nombre: b, raising=False)
    monkeypatch.setattr(app_module, "generar_docx_claves_all_dinamico", lambda tipos, claves: b"claves bytes", raising=False)

    z = client.post("/api/pruebas/descargar_all", json={"examen_ids": [7], "grupo_id": 1})
    assert z.status_code == 200
    assert z.headers["Content-Type"].startswith("application/zip")
    with zipfile.ZipFile(io.BytesIO(z.data)) as zf:
        names = zf.namelist()
        assert "EXAMEN_7_A_P.docx" in names
        assert "EXAMEN_7_A_Q.docx" in names
        assert "CLAVES_RESPUESTA.docx" in names

    z_temas = client.post(
        "/api/pruebas/descargar_all",
        json={"examen_ids": [7], "grupo_id": 1, "solo_temas": True},
    )
    assert z_temas.status_code == 200
    with zipfile.ZipFile(io.BytesIO(z_temas.data)) as zf:
        assert "TEMAS_A_P.docx" in zf.namelist()

    assert client.post("/api/claves/imprimir", json={}).status_code == 400
    assert client.post("/api/claves/imprimir", json={"examen_ids": [7]}).status_code == 400

    pdf_path = tmp_path / "claves.pdf"
    def fake_generar_pdf(ruta_docx):
        pdf_path.write_bytes(b"%PDF-1.4\n%fake\n")
        return str(pdf_path)

    monkeypatch.setattr(app_module, "generar_pdf", fake_generar_pdf, raising=False)
    imprimir = client.post("/api/claves/imprimir", json={"examen_ids": [7], "grupo_id": 1})
    assert imprimir.status_code == 200
    assert imprimir.get_json()["ok"] is True
    assert imprimir.get_json()["archivo_pdf"] == "claves.pdf"


def test_helpers_importados_claves_y_docx_claves(app_module, tmp_path):
    f = tmp_path / "archivo.txt"
    f.write_text("abc", encoding="utf-8")

    assert app_module._ext_ok("examen.docx") is True
    assert app_module._ext_ok("examen.exe") is False
    assert len(app_module.sha256sum(str(f))) == 64
    assert app_module.inferir_clave_grupo_desde_nombre("EXAMEN_GRUPO_A_P.docx") == "A"
    assert app_module.inferir_clave_grupo_desde_nombre("sin_grupo.docx") is None

    simple = app_module.generar_docx_claves_all(
        "base",
        [{"grupo": "A", "numero_pregunta": 1, "origen": "A", "p": "B", "q": "C"}],
    )
    assert simple.startswith(b"PK")

    dinamico = app_module.generar_docx_claves_all_dinamico(
        ["P", "Q", "R"],
        [{"grupo": "A", "numero_pregunta": 1, "origen": "A", "P": "B", "Q": "C", "R": "D"}],
    )
    assert dinamico.startswith(b"PK")

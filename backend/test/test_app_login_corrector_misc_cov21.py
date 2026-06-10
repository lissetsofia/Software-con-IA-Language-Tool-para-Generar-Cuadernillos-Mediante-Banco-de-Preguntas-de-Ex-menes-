import io
import os
import sqlite3
from docx import Document


def _connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _make_docx(path, lines=("esto esta mal", "A) alternativa")):
    doc = Document()
    for line in lines:
        doc.add_paragraph(line)
    doc.save(path)
    return path


def _patch_auth_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov21_auth.sqlite3"
    if db_path.exists():
        db_path.unlink()
    conn = _connect(db_path)
    conn.executescript(
        """
        CREATE TABLE usuarios(id INTEGER PRIMARY KEY, username TEXT, password TEXT);
        CREATE TABLE sesiones_app(token TEXT PRIMARY KEY, username TEXT);
        INSERT INTO usuarios(id,username,password) VALUES(1,'admin','123');
        """
    )
    conn.commit(); conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path))
    return db_path


def test_login_session_logout_probar_conexion_y_helpers(client, app_module, tmp_path, monkeypatch):
    _patch_auth_db(app_module, tmp_path, monkeypatch)

    with app_module.app.test_request_context("/", headers={"Authorization": "Bearer abc"}):
        assert app_module._extract_bearer_token() == "abc"
    with app_module.app.test_request_context("/"):
        assert app_module._extract_bearer_token() is None

    err = app_module.DocxVacioError(["a.docx"])
    assert err.paths == ["a.docx"]

    bad = client.post("/login", json={"usuario": "admin", "clave": "bad"})
    assert bad.status_code == 401

    ok = client.post("/login", json={"usuario": "admin", "clave": "123"})
    assert ok.status_code == 200
    token = ok.get_json()["token"]

    assert client.get("/api/session").status_code == 401
    assert client.get("/api/session", headers={"Authorization": "Bearer no"}).status_code == 401
    sess = client.get("/api/session", headers={"Authorization": f"Bearer {token}"})
    assert sess.status_code == 200
    assert sess.get_json()["usuario"] == "admin"

    logout = client.post("/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout.status_code == 200
    assert client.get("/api/session", headers={"Authorization": f"Bearer {token}"}).status_code == 401

    probe = client.get("/probar-conexion")
    assert probe.status_code == 200
    assert probe.get_json()["conexion"] == "ok"

    monkeypatch.setattr(app_module, "get_connection", lambda: (_ for _ in ()).throw(RuntimeError("boom")))
    probe_error = client.get("/probar-conexion")
    assert probe_error.status_code == 200
    assert probe_error.get_json()["conexion"] == "error"


def test_corregir_archivo_preview_y_modo_corregir(client, app_module, tmp_path, monkeypatch):
    upload = tmp_path / "uploads"
    desc = tmp_path / "descargas"
    upload.mkdir(exist_ok=True)
    desc.mkdir(exist_ok=True)
    monkeypatch.setattr(app_module, "UPLOAD_DIR", str(upload))
    monkeypatch.setattr(app_module, "DESCARGAS_DIR", str(desc))
    monkeypatch.setitem(app_module.app.config, "UPLOAD_FOLDER", str(upload))
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(desc))

    assert client.post("/api/corregir_archivo", data={}).status_code == 400
    no_docx = client.post(
        "/api/corregir_archivo",
        data={"archivo": (io.BytesIO(b"texto"), "a.txt")},
        content_type="multipart/form-data",
    )
    assert no_docx.status_code == 400

    source = tmp_path / "entrada.docx"
    _make_docx(source)
    data = source.read_bytes()

    monkeypatch.setattr(app_module, "detectar_indices_alternativas_por_numid", lambda doc, active_q_numId=None, max_alts=10: (set(), "1"))
    monkeypatch.setattr(app_module, "lt_check_smart", lambda texto, lang="es": {"matches": []})
    monkeypatch.setattr(app_module, "apply_lt_corrections", lambda texto, matches, protected_spans=None: texto.replace("esta", "está"))
    monkeypatch.setattr(app_module, "post_correcciones", lambda texto: texto)
    monkeypatch.setattr(app_module, "insertar_marcas_eliminacion", lambda original, corregido: corregido)

    preview = client.post(
        "/api/corregir_archivo",
        data={"modo": "preview", "archivo": (io.BytesIO(data), "entrada.docx")},
        content_type="multipart/form-data",
    )
    assert preview.status_code == 200
    assert preview.get_json()["ok"] is True

    def fake_generar_docx_corregido(path_in, texto_corregido, path_salida_docx, highlight=False, texto_original_para_highlight=None):
        _make_docx(path_salida_docx, (texto_corregido or "salida",))

    monkeypatch.setattr(app_module, "generar_docx_corregido", fake_generar_docx_corregido)
    full = client.post(
        "/api/corregir_archivo",
        data={"modo": "corregir", "archivo": (io.BytesIO(data), "entrada.docx")},
        content_type="multipart/form-data",
    )
    assert full.status_code == 200
    body = full.get_json()
    assert body["ok"] is True
    assert body["descargas"]["docx"].endswith("_corregido_limpio.docx")
    assert os.path.exists(desc / "entrada_corregido_limpio.docx")

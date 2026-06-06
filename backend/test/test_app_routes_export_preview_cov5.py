# backend/test/test_app_routes_export_preview_cov5.py
import io
import os
from pathlib import Path


class _Row(dict):
    """Fila simple que permite acceso por nombre y por índice 0."""
    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


class _FakeCursor:
    def __init__(self, *, one=None, all_rows=None, description=None):
        self._one = one
        self._all_rows = all_rows or []
        self.description = description or [("idexamenes",), ("nombre",), ("numero",), ("institucion",), ("anio",)]
        self.executed = []
        self.rowcount = 0
        self.lastrowid = 1
        self.closed = False

    def execute(self, sql, params=()):
        self.executed.append((sql, params))
        if sql.strip().upper().startswith("DELETE") or sql.strip().upper().startswith("UPDATE"):
            self.rowcount = 1
        return self

    def fetchone(self):
        if isinstance(self._one, list):
            return self._one.pop(0) if self._one else None
        return self._one

    def fetchall(self):
        return self._all_rows

    def close(self):
        self.closed = True


class _FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def cursor(self):
        return self._cursor

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


def _patch_conn(monkeypatch, app_module, cursor):
    conn = _FakeConn(cursor)
    monkeypatch.setattr(app_module, "get_connection", lambda: conn)
    return conn


def test_exportar_examen_validaciones_word_y_pdf(client, app_module, tmp_path, monkeypatch):
    # formato inválido no debe tocar la BD
    r_bad = client.get("/api/exportar_examen/1?formato=xlsx")
    assert r_bad.status_code == 400

    # examen inexistente
    _patch_conn(monkeypatch, app_module, _FakeCursor(one=None))
    r_404 = client.get("/api/exportar_examen/99?formato=word")
    assert r_404.status_code == 404

    # descarga Word correcta
    docx = tmp_path / "examen.docx"
    docx.write_bytes(b"DOCX falso para send_file")
    row = _Row(archivo_ruta=str(docx), archivo_nombre="examen.docx")
    _patch_conn(monkeypatch, app_module, _FakeCursor(one=row))
    r_word = client.get("/api/exportar_examen/1?formato=word")
    assert r_word.status_code == 200
    assert "application/vnd.openxmlformats" in r_word.headers.get("Content-Type", "")

    # descarga PDF simulando Word COM
    pdf = tmp_path / "examen.pdf"

    def fake_generar_pdf(_ruta_docx):
        pdf.write_bytes(b"%PDF-1.4\n%EOF")
        return str(pdf)

    _patch_conn(monkeypatch, app_module, _FakeCursor(one=row))
    monkeypatch.setattr(app_module, "generar_pdf", fake_generar_pdf)
    r_pdf = client.get("/api/exportar_examen/1?formato=pdf")
    assert r_pdf.status_code == 200
    assert "application/pdf" in r_pdf.headers.get("Content-Type", "")


def test_examen_nombre_y_listado_con_bd_falsa(client, app_module, monkeypatch):
    # listado /api/examenes
    rows = [(1, "Examen Ordinario", "I", "UNAMBA", 2025)]
    cur = _FakeCursor(all_rows=rows)
    _patch_conn(monkeypatch, app_module, cur)
    r = client.get("/api/examenes")
    assert r.status_code == 200
    assert r.get_json()[0]["nombre"] == "Examen Ordinario"

    # nombre por id
    _patch_conn(monkeypatch, app_module, _FakeCursor(one=_Row(archivo_nombre="uno.docx")))
    r_name = client.get("/api/examen_nombre/1")
    assert r_name.status_code == 200
    assert r_name.get_json()["archivo_nombre"] == "uno.docx"

    _patch_conn(monkeypatch, app_module, _FakeCursor(one=None))
    assert client.get("/api/examen_nombre/99").status_code == 404


def test_eliminar_examen_exito_y_no_encontrado(client, app_module, tmp_path, monkeypatch):
    _patch_conn(monkeypatch, app_module, _FakeCursor(one=None))
    assert client.delete("/api/examenes/123").status_code == 404

    archivo = tmp_path / "original.docx"
    archivo.write_bytes(b"x")
    preguntas_dir = tmp_path / "preguntas"
    carpeta = preguntas_dir / "examen_5"
    carpeta.mkdir(parents=True)
    (carpeta / "p1.docx").write_bytes(b"p")
    monkeypatch.setitem(app_module.app.config, "PREGUNTAS_DIR", str(preguntas_dir))

    row = _Row(archivo_ruta=str(archivo), archivo_nombre="original.docx")
    conn = _patch_conn(monkeypatch, app_module, _FakeCursor(one=row))
    r = client.delete("/api/examenes/5")
    assert r.status_code == 200
    assert r.get_json()["mensaje"]
    assert conn.committed is True
    assert not archivo.exists()
    assert not carpeta.exists()


def test_render_vista_y_render_docx_guardado_simulados(client, app_module, tmp_path, monkeypatch):
    uploads = tmp_path / "uploads"
    descargas = tmp_path / "descargas"
    uploads.mkdir(exist_ok=True); descargas.mkdir(exist_ok=True)
    monkeypatch.setattr(app_module, "UPLOAD_DIR", str(uploads), raising=False)
    monkeypatch.setattr(app_module, "DESCARGAS_DIR", str(descargas), raising=False)
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(descargas))

    assert client.post("/api/render_vista", data={}).status_code == 400
    r_ext = client.post(
        "/api/render_vista",
        data={"archivo": (io.BytesIO(b"abc"), "demo.pdf")},
        content_type="multipart/form-data",
    )
    assert r_ext.status_code == 400

    def fake_preview(docx_path, nombre_base=None):
        out = descargas / f"{nombre_base or 'preview'}.pdf"
        out.write_bytes(b"%PDF-1.4\n%EOF")
        return str(out)

    monkeypatch.setattr(app_module, "generar_pdf_preview", fake_preview)
    monkeypatch.setattr(app_module, "_sha1_file", lambda p: "abc123def456")

    r_ok = client.post(
        "/api/render_vista",
        data={"archivo": (io.BytesIO(b"docx falso"), "demo.docx")},
        content_type="multipart/form-data",
    )
    assert r_ok.status_code == 200
    assert r_ok.get_json()["ok"] is True
    assert "/api/descargas/" in r_ok.get_json()["html_url"]

    # render_docx_guardado: 404 y éxito con PDF simulado
    assert client.get("/api/render_docx_guardado/no_existe.docx").status_code == 404
    (descargas / "guardado.docx").write_bytes(b"contenido")
    r_guardado = client.get("/api/render_docx_guardado/guardado.docx")
    assert r_guardado.status_code == 200
    assert r_guardado.get_json()["ok"] is True


def test_pdf_from_docx_y_descargar_pdf_corregido(client, app_module, tmp_path, monkeypatch):
    descargas = tmp_path / "descargas"
    descargas.mkdir(exist_ok=True)
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(descargas))
    monkeypatch.setattr(app_module, "DESCARGAS_DIR", str(descargas), raising=False)

    assert client.post("/api/pdf_from_docx", json={"docx": "../malo.docx"}).status_code == 400
    assert client.post("/api/pdf_from_docx", json={"docx": "no.docx"}).status_code == 404

    docx = descargas / "archivo.docx"
    docx.write_bytes(b"docx")

    def fake_resave(src, dst):
        Path(dst).write_bytes(Path(src).read_bytes())
        return dst

    def fake_docx_a_pdf(src, dst):
        Path(dst).write_bytes(b"%PDF-1.4\n%EOF")
        return dst

    monkeypatch.setattr(app_module, "resave_docx_formatted", fake_resave)
    monkeypatch.setattr(app_module, "docx_a_pdf", fake_docx_a_pdf)
    r = client.post("/api/pdf_from_docx", json={"docx": "archivo.docx"})
    assert r.status_code == 200
    assert r.get_json()["archivo_pdf"] == "archivo.pdf"

    assert client.get("/api/descargar_pdf_corregido/no.docx").status_code == 404

    def fake_generar_pdf_lt(_docx):
        out = tmp_path / "tmp.pdf"
        out.write_bytes(b"%PDF-1.4\n%EOF")
        return str(out)

    monkeypatch.setattr(app_module, "generar_pdf_lt", fake_generar_pdf_lt)
    r_pdf = client.get("/api/descargar_pdf_corregido/archivo.docx")
    assert r_pdf.status_code == 200
    assert "application/pdf" in r_pdf.headers.get("Content-Type", "")


def test_lt_status_ensure_y_static_descargas(client, app_module, tmp_path, monkeypatch):
    static_dir = tmp_path / "static"
    down_dir = tmp_path / "down"
    static_dir.mkdir(exist_ok=True); down_dir.mkdir(exist_ok=True)
    (static_dir / "x.txt").write_text("static-ok", encoding="utf-8")
    (down_dir / "a.txt").write_text("down-ok", encoding="utf-8")

    monkeypatch.setattr(app_module, "STATIC_DIR", str(static_dir), raising=False)
    monkeypatch.setattr(app_module.app, "static_folder", str(static_dir), raising=False)
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(down_dir))
    monkeypatch.setattr(app_module, "LT_DIR", "LT_TEST", raising=False)
    monkeypatch.setattr(app_module, "lt_is_running", lambda *a, **k: True)
    monkeypatch.setattr(app_module, "lt_start_server", lambda: None)

    assert client.get("/lt/status").status_code == 200
    assert client.get("/lt/ensure").get_json()["ok"] is True
    assert client.get("/static/x.txt").status_code == 200
    assert client.get("/descargas/a.txt").status_code == 200


def test_grupo_generar_por_clave_y_jobs_basicos(client, app_module, monkeypatch):
    # Grupo por clave inexistente
    _patch_conn(monkeypatch, app_module, _FakeCursor(one=None))
    assert client.get("/api/grupos/Z/generar_doc").status_code == 404

    # Grupo por clave existente, pero sin ejecutar generación real
    _patch_conn(monkeypatch, app_module, _FakeCursor(one=(7,)))

    def fake_impl(idgrupo, formato):
        return app_module.jsonify({"ok": True, "idgrupo": idgrupo, "formato": formato or "word"})

    monkeypatch.setattr(app_module, "_grupos_generar_doc_impl", fake_impl)
    r = client.get("/api/grupos/A/generar_doc?formato=pdf")
    assert r.status_code == 200
    assert r.get_json()["idgrupo"] == 7

    # Estados de jobs sin iniciar hilos reales
    assert client.get("/api/grupos/generar_doc/jobs/nope").status_code == 404
    app_module._generar_doc_jobs["done1"] = {
        "status": "done", "done": 10, "total": 10, "message": "done", "result": {"ok": True}
    }
    assert client.get("/api/grupos/generar_doc/jobs/done1").get_json()["status"] == "done"
    ev = client.get("/api/grupos/generar_doc/jobs/done1/events")
    assert ev.status_code == 200
    assert b"event: progress" in ev.data

    assert client.get("/api/examenes/partir_y_guardar/jobs/nope").status_code == 404
    app_module._partir_guardar_jobs["err1"] = {
        "status": "error", "done": 4, "total": 100, "message": "fallo", "error": {"error": "x"}, "http_status": 500
    }
    assert client.get("/api/examenes/partir_y_guardar/jobs/err1").get_json()["ok"] is False
    ev2 = client.get("/api/examenes/partir_y_guardar/jobs/err1/events")
    assert ev2.status_code == 200
    assert b"event: progress" in ev2.data

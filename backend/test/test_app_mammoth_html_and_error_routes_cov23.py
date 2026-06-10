import os
from types import SimpleNamespace
from docx import Document


def test_mammoth_preview_y_exportar_html_con_mammoth(app_module, tmp_path, monkeypatch):
    desc = tmp_path / "desc"; desc.mkdir()
    prev = tmp_path / "previews"; prev.mkdir()
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(desc))
    monkeypatch.setattr(app_module, "PREVIEWS_DIR", str(prev))

    src = tmp_path / "a.docx"
    Document().save(src)

    class _Msg:
        def __str__(self):
            return "aviso"
    class _FakeMammoth:
        class images:
            @staticmethod
            def img_element(fn):
                return fn
        @staticmethod
        def convert_to_html(*args, **kwargs):
            return SimpleNamespace(value="<html><head></head><body><p>Hola</p></body></html>", messages=[_Msg()])

    # Las funciones importan mammoth dentro del helper, por eso se parchea el módulo real.
    import mammoth as real_mammoth
    monkeypatch.setattr(real_mammoth, "convert_to_html", _FakeMammoth.convert_to_html)
    monkeypatch.setattr(real_mammoth.images, "img_element", _FakeMammoth.images.img_element)

    h1 = app_module._preview_with_mammoth(str(src), "previa")
    assert os.path.exists(h1)
    assert "hola" in open(h1, encoding="utf-8").read().lower()

    h2, warnings = app_module._exportar_html_con_mammoth(str(src), "base:con*malos")
    assert os.path.exists(h2)
    assert warnings


def test_rutas_error_db_basicas_y_descargas_invalidas(client, app_module, tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "get_connection", lambda: (_ for _ in ()).throw(RuntimeError("db rota")))
    assert client.get("/api/examenes").status_code == 500
    assert client.get("/api/examen_nombre/1").status_code == 500
    assert client.get("/api/temas").status_code == 500
    assert client.post("/api/temas", json={"nombre": "Tema"}).status_code == 500
    assert client.put("/api/temas/1", json={"nombre": "Tema"}).status_code == 500
    assert client.patch("/api/temas/1/toggle").status_code == 500
    assert client.delete("/api/temas/1").status_code == 500

    desc = tmp_path / "desc"; desc.mkdir()
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(desc))
    monkeypatch.setattr(app_module, "DESCARGAS_DIR", str(desc))
    assert client.get("/api/descargas/sub/cosa.docx").status_code in (400, 404)
    assert client.get("/__ping__").data == b"ok"

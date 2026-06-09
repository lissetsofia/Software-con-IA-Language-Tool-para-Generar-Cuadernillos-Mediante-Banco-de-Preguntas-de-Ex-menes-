import os
import socket
import sqlite3
import time
import zipfile
from pathlib import Path

import pytest


def test_core_small_helpers_y_request_context(app_module, tmp_path, monkeypatch):
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("CREATE TABLE t(id INTEGER, nombre TEXT)")
    cur.execute("INSERT INTO t VALUES (1, 'uno')")
    cur.execute("SELECT * FROM t")
    assert app_module._row_to_dict_list(cur) == [{"id": 1, "nombre": "uno"}]

    with app_module.app.test_request_context("/", headers={"Authorization": "Bearer abc123"}):
        assert app_module._extract_bearer_token() == "abc123"
    with app_module.app.test_request_context("/"):
        assert app_module._extract_bearer_token() is None

    f = tmp_path / "hash.txt"
    f.write_bytes(b"abc")
    assert app_module._sha1_file(str(f)) == app_module._sha1_file_lt(str(f))
    assert len(app_module.sha256sum(str(f))) == 64

    monkeypatch.setattr(app_module, "DESCARGAS_DIR", str(tmp_path / "desc"), raising=False)
    copied = app_module._save_into_descargas(str(f), "copia.txt")
    assert Path(copied).exists()

    assert app_module._wait_exists_nonzero(str(f), tries=1, delay=0) is True
    assert app_module._wait_exists_nonzero(str(tmp_path / "nope"), tries=1, delay=0) is False
    assert isinstance(app_module.is_port_busy("127.0.0.1", 9), bool)


def test_html_utf8_postprocess_y_fallbacks(app_module, tmp_path):
    h = tmp_path / "a.htm"
    h.write_text("<html><head><meta charset=windows-1252></head><body><!--[if !vml]-->x<!-- <![endif]--></body></html>", encoding="cp1252")
    app_module._force_utf8_html(str(h))
    app_module._postprocess_word_html(str(h))
    txt = h.read_text(encoding="utf-8")
    assert "utf-8" in txt.lower() and "img" in txt.lower()

    h2 = tmp_path / "b.htm"
    h2.write_text("<html><head><meta charset='windows-1252'></head><body>x</body></html>", encoding="cp1252")
    app_module._force_utf8_html_lt(str(h2))
    app_module._postprocess_word_html_lt(str(h2))
    assert "utf-8" in h2.read_text(encoding="utf-8").lower()

    # Ramas de excepción controladas: no deben propagar.
    app_module._force_utf8_html(str(tmp_path / "faltante.htm"))
    app_module._postprocess_word_html(str(tmp_path / "faltante.htm"))


def test_lt_dir_ngram_y_request_simulado(app_module, tmp_path, monkeypatch):
    lt_dir = tmp_path / "LanguageTool"
    lt_dir.mkdir()
    jar = lt_dir / "languagetool-server.jar"
    jar.write_text("jar")
    monkeypatch.setenv("LT_DIR", str(lt_dir))
    assert app_module._resolve_lt_dir() == str(lt_dir)
    monkeypatch.setattr(app_module, "LT_DIR", str(lt_dir), raising=False)
    assert app_module._find_lt_jar().endswith("languagetool-server.jar")

    ng = tmp_path / "ngrams" / "es"
    (ng / "1grams").mkdir(parents=True)
    (ng / "2grams").mkdir()
    monkeypatch.setenv("NGRAMS_DIR", str(ng))
    assert app_module._detect_ngrams_dir() == str(ng)

    calls = {"n": 0}

    class Resp:
        def __init__(self, status_code=200, body="ok"):
            self.status_code = status_code
            self.text = body
        def raise_for_status(self):
            pass
        def json(self):
            return {"matches": []}

    def fake_post(*_args, **_kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise app_module.requests.exceptions.ConnectionError("down")
        return Resp(200)

    monkeypatch.setattr(app_module, "lt_is_running", lambda *a, **k: False)
    monkeypatch.setattr(app_module, "lt_start_server", lambda: None)
    monkeypatch.setattr(app_module.LT_HTTP, "post", fake_post)
    assert app_module._lt_request("hola", "es")["_status"] == 200

    monkeypatch.setattr(app_module.LT_HTTP, "post", lambda *_a, **_k: Resp(400, "too long"))
    assert app_module._lt_request("hola", "es")["_status"] == 400


def _write_zip(path, files):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)


def _doc_xml(body):
    return f"""<?xml version='1.0' encoding='UTF-8'?>
    <w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
                xmlns:mc='http://schemas.openxmlformats.org/markup-compatibility/2006'>
      <w:body>{body}</w:body>
    </w:document>"""


def test_docx_validation_content_and_xml_sanitize(app_module, tmp_path):
    docx = tmp_path / "valid.docx"
    _write_zip(docx, {
        "word/document.xml": _doc_xml("<w:p><w:r><w:t>Texto</w:t></w:r></w:p>"),
        "[Content_Types].xml": "<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'/>",
    })
    app_module._validar_docx_real(str(docx))
    assert app_module._tiene_texto_o_contenido(str(docx)) is True

    bad = tmp_path / "bad.docx"
    _write_zip(bad, {"word/otro.xml": "<x/>"})
    with pytest.raises(Exception):
        app_module._validar_docx_real(str(bad))

    root = app_module.ET.fromstring(_doc_xml("""
      <w:p w:rsidR='1'>
        <w:sdt><w:sdtPr/><w:sdtContent><w:r><w:t>Conserva</w:t></w:r></w:sdtContent></w:sdt>
        <w:del><w:r><w:delText>Borrar</w:delText></w:r></w:del>
        <w:bookmarkStart w:id='1' w:name='b'/>
      </w:p>
    """))
    p = root.find(f".//{{{app_module.NS_W}}}p")
    app_module._sanear_fragmento(p)
    out = app_module.ET.tostring(p, encoding="unicode")
    assert "Conserva" in out and "Borrar" not in out and "bookmarkStart" not in out and "rsid" not in out


def test_docx_count_helpers_and_name_utils(app_module, tmp_path):
    assert app_module.pick_not_in(["A", "B"]) in {"C", "D", "E"}
    assert app_module._norm_name("  Trigonometría  avanzada ") == "TRIGONOMETRIA AVANZADA"
    assert app_module._norm_upper_noaccent("Árbol") == "ARBOL"
    assert app_module._docx_requiere_resave_para_matriz("TRIGONOMETRÍA", "noexiste.docx") is True
    assert app_module._docx_requiere_resave_para_matriz("ÁLGEBRA", "noexiste.docx") is False

    docx = tmp_path / "complex.docx"
    _write_zip(docx, {"word/document.xml": _doc_xml("<w:p><w:r><w:drawing/></w:r></w:p>")})
    assert app_module._docx_requiere_resave_para_matriz("ÁLGEBRA", str(docx)) is True

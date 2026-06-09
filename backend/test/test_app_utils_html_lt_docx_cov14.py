import os
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
from docx import Document


def test_texto_correcciones_spans_y_helpers_basicos(app_module, tmp_path, monkeypatch):
    assert app_module.normalize_ocr_noise("pa-\nlabra\u00a0  doble") == "palabra doble"
    assert app_module._strip_accents("ÁÉÍÓÚ ñ") == "AEIOU n"
    assert app_module._same_casing("CASA", "perro") == "PERRO"
    assert app_module._same_casing("Casa", "perro") == "Perro"
    assert app_module._prev_token("El llegue", 3) == "El"
    assert app_module._choose_best_suggestion("llego", [{"value": "llegó"}], "El") == "llegó"
    assert app_module.is_upper_acronym("(UNAMBA)") is True
    assert app_module._has_any_digit("x²") is True
    assert app_module._looks_reasonable_replacement("numeros", "números") is True
    assert app_module._looks_reasonable_replacement("abc", "xyzxyz") is False

    texto = "A) alternativa\nPregunta comun\nB) otra"
    spans = app_module.detectar_spans_alternativas(texto)
    assert spans and app_module.intersecta_spans(0, 2, spans) is True
    assert app_module.intersecta_spans(20, 3, spans) is False
    assert app_module.restaurar_segmentos_protegidos(texto, "ZZ alternativa\nPregunta comun\nYY otra", spans).startswith("A)")

    matches = [
        {"offset": 0, "length": 1, "replacements": [{"value": "y"}]},
        {"offset": 2, "length": 3, "replacements": [{"value": "abc"}]},
    ]
    assert app_module.apply_lt_corrections_classic("x 123", matches) == "x 123"
    assert app_module.apply_lt_corrections_smart("casa", [{"offset": 0, "length": 4, "replacements": [{"value": "casas"}]}]) == "casas"

    corregido = app_module.post_correcciones("haber si vienes?\n1) numero entera\nDe el total")
    assert "a ver si vienes?" in corregido.lower()
    assert "número entero" in corregido.lower()
    assert "Del total" in corregido

    marcado = app_module.insertar_marcas_eliminacion("uno dos tres", "uno tres")
    assert app_module.MARK_WORD_DELETE in marcado


def test_html_cache_sha_y_docx_zip_utils(app_module, tmp_path, monkeypatch):
    html = tmp_path / "word.htm"
    html.write_text("<html><head><meta charset=windows-1252></head><body><!--[if !vml]-->x<!-- <![endif]--><img src='a'></body></html>", encoding="utf-8")
    app_module._force_utf8_html(str(html))
    app_module._postprocess_word_html(str(html))
    content = html.read_text(encoding="utf-8")
    assert "charset=utf-8" in content.lower() or "charset=\"utf-8\"" in content.lower()
    assert "img{max-width" in content.replace(" ", "")

    html_lt = tmp_path / "lt.htm"
    html_lt.write_text("<html><head></head><body>ok</body></html>", encoding="utf-8")
    app_module._force_utf8_html_lt(str(html_lt))
    app_module._postprocess_word_html_lt(str(html_lt))
    assert "utf-8" in html_lt.read_text(encoding="utf-8").lower()

    data = tmp_path / "data.bin"
    data.write_bytes(b"abc")
    assert app_module._sha1_file(str(data)) == app_module._sha1_file_lt(str(data))
    assert app_module._wait_exists_nonzero(str(data), tries=1, delay=0) is True
    assert app_module._wait_exists_nonzero(str(tmp_path / "no.bin"), tries=1, delay=0) is False

    desc = tmp_path / "desc"; desc.mkdir(exist_ok=True)
    monkeypatch.setattr(app_module, "DESCARGAS_DIR", str(desc), raising=False)
    saved = app_module._save_into_descargas(str(data), "copiado.bin")
    assert Path(saved).read_bytes() == b"abc"

    # DOCX con y sin contenido para _tiene_texto_o_contenido.
    docx = tmp_path / "ok.docx"
    doc = Document(); doc.add_paragraph("Texto"); doc.save(docx)
    assert app_module._tiene_texto_o_contenido(str(docx)) is True

    # _safe_rezip acepta bytes y strings.
    zpath = tmp_path / "mini.docx"
    app_module._safe_rezip(str(zpath), {"word/document.xml": b"<root/>", "custom.txt": "hola"})
    with zipfile.ZipFile(zpath) as z:
        assert z.read("custom.txt") == b"hola"

    # _hacer_secciones_continuas debe poder procesar un docx real sin romperlo.
    app_module._hacer_secciones_continuas(str(docx))
    assert zipfile.is_zipfile(docx)

    # _short_path/_short83 no deben fallar aunque win32api no exista.
    assert os.path.isabs(app_module._short_path(str(data)))
    assert os.path.isabs(app_module._short83(str(data)))

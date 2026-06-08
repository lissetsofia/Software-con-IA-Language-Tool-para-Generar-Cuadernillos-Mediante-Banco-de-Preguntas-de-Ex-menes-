import os
import xml.etree.ElementTree as ET
from pathlib import Path


def _paragraph(app_module, text="Pregunta"):
    p = ET.Element(app_module.W + "p")
    r = ET.SubElement(p, app_module.W + "r")
    t = ET.SubElement(r, app_module.W + "t")
    t.text = text
    return p


def test_wordcom_helpers_de_error_controlado(app_module, tmp_path, monkeypatch):
    calls = {"init": 0, "uninit": 0}
    monkeypatch.setattr(app_module.pythoncom, "CoInitialize", lambda: calls.__setitem__("init", calls["init"] + 1), raising=False)
    monkeypatch.setattr(app_module.pythoncom, "CoUninitialize", lambda: calls.__setitem__("uninit", calls["uninit"] + 1), raising=False)
    monkeypatch.setattr(app_module.win32, "DispatchEx", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("sin word cov10")), raising=False)

    src = tmp_path / "origen.docx"
    src.write_bytes(b"fake")
    dst = tmp_path / "destino.docx"
    elementos = [_paragraph(app_module, "Pregunta de prueba")]

    ok1, err1 = app_module.guardar_pregunta_docx_wordcom(str(src), str(dst), elementos)
    assert ok1 is False and "sin word" in err1.lower()

    ok2, err2 = app_module.guardar_pregunta_docx_desde_fuente_wordcom(str(src), str(dst), elementos)
    assert ok2 is False and "sin word" in err2.lower()

    ok3, err3 = app_module.reparar_docx_fuerte(str(src))
    assert ok3 is False and "sin word" in err3.lower()

    out, err4 = app_module.normalizar_docx_fuente(str(src))
    assert out is None and "sin word" in err4.lower()
    assert calls["init"] >= 4 and calls["uninit"] >= 4


def test_docx_pdf_wrappers_error_y_short_path(app_module, tmp_path, monkeypatch):
    monkeypatch.setattr(app_module.pythoncom, "CoInitialize", lambda: None, raising=False)
    monkeypatch.setattr(app_module.pythoncom, "CoUninitialize", lambda: None, raising=False)
    monkeypatch.setattr(app_module.win32, "DispatchEx", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("word no disponible")), raising=False)

    src = tmp_path / "a.docx"
    src.write_bytes(b"docx")
    pdf = tmp_path / "a.pdf"

    try:
        app_module.to_pdf_insert_only(str(src), str(pdf))
        assert False, "Debió fallar sin Word"
    except RuntimeError as e:
        assert "word no disponible" in str(e)

    try:
        app_module.resave_docx_formatted(str(src), str(tmp_path / "out.docx"))
        assert False, "Debió fallar sin Word"
    except RuntimeError as e:
        assert "word no disponible" in str(e)

    try:
        app_module.docx_a_pdf(str(src), str(pdf))
        assert False, "Debió fallar sin Word"
    except RuntimeError as e:
        assert "word no disponible" in str(e)

    # Cobertura adicional de helpers de ruta, sin depender de 8.3 real.
    assert app_module._short_path(str(src))
    assert app_module._short83(str(src))

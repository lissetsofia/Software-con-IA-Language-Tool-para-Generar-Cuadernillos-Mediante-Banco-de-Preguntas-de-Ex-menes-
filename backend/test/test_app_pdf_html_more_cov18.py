import os
from pathlib import Path

from docx import Document


class _Fields:
    def Update(self):
        pass


class _PdfDoc:
    def __init__(self, write_pdf=True, write_html=True):
        self.Fields = _Fields()
        self.WebOptions = type("WebOptions", (), {})()
        self.Content = type("Content", (), {"FormattedText": "FMT"})()
        self._write_pdf = write_pdf
        self._write_html = write_html

    def SaveAs(self, path, FileFormat=None):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        if str(path).lower().endswith((".htm", ".html")):
            if self._write_html:
                Path(path).write_text("<html><head><meta charset=windows-1252></head><body>ok</body></html>", encoding="utf-8")
        else:
            Path(path).write_bytes(b"docx")

    def SaveAs2(self, FileName=None, FileFormat=None, Encoding=None):
        self.SaveAs(FileName, FileFormat=FileFormat)

    def ExportAsFixedFormat(self, OutputFileName=None, **kwargs):
        if self._write_pdf:
            Path(OutputFileName).parent.mkdir(parents=True, exist_ok=True)
            Path(OutputFileName).write_bytes(b"%PDF-1.4\n1")

    def Repaginate(self):
        pass

    def Close(self, *args, **kwargs):
        pass

    def Range(self, *args, **kwargs):
        return type("Range", (), {"InsertFile": lambda self, *a, **k: None, "FormattedText": "FMT"})()


class _Docs:
    def __init__(self, doc):
        self.doc = doc

    def Open(self, *args, **kwargs):
        return self.doc

    def Add(self):
        return self.doc


class _Word:
    def __init__(self, doc):
        self.Documents = _Docs(doc)
        self.Visible = False
        self.DisplayAlerts = 0
        self.AutomationSecurity = None

    def Quit(self):
        pass


def _make_docx(path, text="contenido"):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = Document()
    doc.add_paragraph(text)
    doc.save(path)
    return path


def _patch_word(app_module, monkeypatch, doc):
    monkeypatch.setattr(app_module.pythoncom, "CoInitialize", lambda: None, raising=False)
    monkeypatch.setattr(app_module.pythoncom, "CoUninitialize", lambda: None, raising=False)
    monkeypatch.setattr(app_module.win32, "DispatchEx", lambda *_a, **_k: _Word(doc), raising=False)


def test_guardar_pdf_success_y_pdf_vacio(app_module, tmp_path, monkeypatch):
    src = _make_docx(tmp_path / "base.docx")

    _patch_word(app_module, monkeypatch, _PdfDoc(write_pdf=True))
    pdf = app_module.guardar_pdf(str(src))
    assert os.path.exists(pdf)
    assert Path(pdf).read_bytes().startswith(b"%PDF")

    _patch_word(app_module, monkeypatch, _PdfDoc(write_pdf=False))
    try:
        app_module.guardar_pdf(str(src))
        assert False, "Debió fallar si Word no genera PDF"
    except RuntimeError as e:
        assert "pdf" in str(e).lower()


def test_html_helpers_utf8_postprocess_y_fallback(app_module, tmp_path, monkeypatch):
    html = tmp_path / "latin.htm"
    html.write_bytes("<html><head><meta charset=windows-1252></head><body>á</body></html>".encode("cp1252"))
    app_module._force_utf8_html(str(html))
    txt = html.read_text(encoding="utf-8")
    assert "charset=utf-8" in txt.lower() or "charset=\"utf-8\"" in txt.lower()

    app_module._postprocess_word_html(str(html))
    txt2 = html.read_text(encoding="utf-8")
    assert "img" in txt2.lower() and "body" in txt2.lower()

    assert app_module._wait_exists_nonzero(str(html), tries=1, delay=0) is True
    assert app_module._wait_exists_nonzero(str(tmp_path / "no.htm"), tries=1, delay=0) is False

    src = _make_docx(tmp_path / "preview.docx")
    out_dir = tmp_path / "descargas_cov18"
    out_dir.mkdir()
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(out_dir))

    def fake_preview(docx_path, base):
        out = out_dir / f"{base}.htm"
        out.write_text("<html>mammoth fallback</html>", encoding="utf-8")
        return str(out)

    monkeypatch.setattr(app_module.win32, "DispatchEx", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("word falla")), raising=False)
    monkeypatch.setattr(app_module, "_preview_with_mammoth", fake_preview, raising=False)
    generado = app_module.generar_html_desde_docx(str(src), nombre_base="vista_cov18")
    assert generado.endswith("vista_cov18.htm")
    assert Path(generado).exists()


def test_exportar_html_con_word_success(app_module, tmp_path, monkeypatch):
    src = _make_docx(tmp_path / "word_html.docx")
    prev = tmp_path / "previews"
    prev.mkdir()
    monkeypatch.setattr(app_module, "PREVIEWS_DIR", str(prev), raising=False)
    _patch_word(app_module, monkeypatch, _PdfDoc(write_html=True))

    html_path, warnings = app_module._exportar_html_con_word(str(src), "base:*cov18")
    assert Path(html_path).exists()
    assert isinstance(warnings, list)
    assert "charset" in Path(html_path).read_text(encoding="utf-8").lower()

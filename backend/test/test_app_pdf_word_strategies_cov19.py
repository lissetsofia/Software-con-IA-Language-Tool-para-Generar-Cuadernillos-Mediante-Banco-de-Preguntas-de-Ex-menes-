import os
from pathlib import Path

from docx import Document


class _Range:
    def __init__(self, insert_fails=False):
        self._insert_fails = insert_fails
        self.FormattedText = "FMT"

    def InsertFile(self, *args, **kwargs):
        if self._insert_fails:
            raise RuntimeError("insert falla")


class _Content:
    FormattedText = "CONTENT_FMT"


class _Doc:
    def __init__(self, write_pdf=True, export_fails=False, save_pdf=True, insert_fails=False):
        self.Content = _Content()
        self._write_pdf = write_pdf
        self._export_fails = export_fails
        self._save_pdf = save_pdf
        self._insert_fails = insert_fails

    def Range(self, *args, **kwargs):
        return _Range(insert_fails=self._insert_fails)

    def ExportAsFixedFormat(self, OutputFileName=None, **kwargs):
        if self._export_fails:
            raise RuntimeError("export falla")
        if self._write_pdf:
            Path(OutputFileName).parent.mkdir(parents=True, exist_ok=True)
            Path(OutputFileName).write_bytes(b"%PDF-1.4 cov19")

    def SaveAs2(self, path=None, FileName=None, FileFormat=None, **kwargs):
        target = FileName or path
        if target and (FileFormat in (12, 17)):
            Path(target).parent.mkdir(parents=True, exist_ok=True)
            if FileFormat == 17:
                if self._save_pdf:
                    Path(target).write_bytes(b"%PDF via SaveAs2")
            else:
                Path(target).write_bytes(b"DOCX")

    def SaveAs(self, path, FileFormat=None):
        self.SaveAs2(path, FileFormat=FileFormat)

    def Close(self, *args, **kwargs):
        pass


class _Docs:
    def __init__(self, open_fails=False, add_doc=None, open_doc=None):
        self.open_fails = open_fails
        self.add_doc = add_doc or _Doc()
        self.open_doc = open_doc or _Doc()

    def Open(self, *args, **kwargs):
        if self.open_fails:
            raise RuntimeError("open falla")
        return self.open_doc

    def Add(self):
        return self.add_doc


class _Word:
    def __init__(self, docs):
        self.Documents = docs
        self.Visible = False
        self.DisplayAlerts = 0
        self.AutomationSecurity = None

    def Quit(self):
        pass


def _make_docx(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = Document(); doc.add_paragraph("contenido"); doc.save(path)
    return path


def _patch_word(app_module, monkeypatch, word):
    monkeypatch.setattr(app_module, "_short83", lambda p: os.path.abspath(p), raising=False)
    monkeypatch.setattr(app_module.pythoncom, "CoInitialize", lambda: None, raising=False)
    monkeypatch.setattr(app_module.pythoncom, "CoUninitialize", lambda: None, raising=False)
    monkeypatch.setattr(app_module.win32, "DispatchEx", lambda *_a, **_k: word, raising=False)
    monkeypatch.setattr(app_module.time, "sleep", lambda *_a, **_k: None, raising=False)


def test_to_pdf_insert_only_y_resave_docx_fallback(app_module, tmp_path, monkeypatch):
    src = _make_docx(tmp_path / "src.docx")
    pdf = tmp_path / "out.pdf"

    # ExportAsFixedFormat falla, pero SaveAs2(FileFormat=17) genera PDF.
    _patch_word(app_module, monkeypatch, _Word(_Docs(add_doc=_Doc(export_fails=True, save_pdf=True))))
    assert app_module.to_pdf_insert_only(str(src), str(pdf)) == str(pdf)
    assert pdf.exists() and pdf.read_bytes().startswith(b"%PDF")

    # resave_docx_formatted: Open falla y cae a InsertFile.
    dst_docx = tmp_path / "resaved.docx"
    _patch_word(app_module, monkeypatch, _Word(_Docs(open_fails=True, add_doc=_Doc())))
    assert app_module.resave_docx_formatted(str(src), str(dst_docx)) == str(dst_docx)
    assert dst_docx.exists()


def test_docx_a_pdf_estrategias_insert_saveas_y_error(app_module, tmp_path, monkeypatch):
    src = _make_docx(tmp_path / "base.docx")

    # A falla al abrir, B crea documento por InsertFile y exporta PDF.
    pdf_b = tmp_path / "b.pdf"
    _patch_word(app_module, monkeypatch, _Word(_Docs(open_fails=True, add_doc=_Doc(write_pdf=True))))
    assert app_module.docx_a_pdf(str(src), str(pdf_b)) == str(pdf_b)
    assert pdf_b.exists()

    # Export falla, SaveAs2(FileFormat=17) genera PDF.
    pdf_saveas = tmp_path / "saveas.pdf"
    _patch_word(app_module, monkeypatch, _Word(_Docs(open_fails=False, open_doc=_Doc(export_fails=True, save_pdf=True))))
    assert app_module.docx_a_pdf(str(src), str(pdf_saveas)) == str(pdf_saveas)
    assert pdf_saveas.exists()

    # Open, InsertFile y FormattedText fallan: RuntimeError con detalle de las 3 rutas.
    pdf_err = tmp_path / "err.pdf"
    _patch_word(app_module, monkeypatch, _Word(_Docs(open_fails=True, add_doc=_Doc(insert_fails=True))))
    try:
        app_module.docx_a_pdf(str(src), str(pdf_err))
        assert False, "Debió fallar cuando las 3 estrategias fallan"
    except RuntimeError as e:
        msg = str(e).lower()
        assert "open:" in msg and "insert:" in msg and "fmt:" in msg


def test_docx_a_pdf_fallback_final_resave_insert(app_module, tmp_path, monkeypatch):
    src = _make_docx(tmp_path / "final.docx")
    pdf = tmp_path / "final.pdf"

    # Word abre y no falla, pero no escribe PDF; debe caer al intento adicional.
    _patch_word(app_module, monkeypatch, _Word(_Docs(open_doc=_Doc(write_pdf=False, save_pdf=False))))

    def fake_resave(docx_path, tmp_norm):
        Path(tmp_norm).write_bytes(b"DOCX NORMALIZADO")
        return tmp_norm

    def fake_to_pdf(tmp_norm, pdf_path):
        Path(pdf_path).write_bytes(b"%PDF fallback final")
        return pdf_path

    monkeypatch.setattr(app_module, "resave_docx_formatted", fake_resave, raising=False)
    monkeypatch.setattr(app_module, "to_pdf_insert_only", fake_to_pdf, raising=False)
    assert app_module.docx_a_pdf(str(src), str(pdf)) == str(pdf)
    assert pdf.read_bytes().startswith(b"%PDF")

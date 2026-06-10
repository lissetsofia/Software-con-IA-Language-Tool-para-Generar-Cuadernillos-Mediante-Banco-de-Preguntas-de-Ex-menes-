import os
import xml.etree.ElementTree as ET
from pathlib import Path


def _p(app_module, text):
    p = ET.Element(app_module.W + "p")
    r = ET.SubElement(p, app_module.W + "r")
    t = ET.SubElement(r, app_module.W + "t")
    t.text = text
    return p


def _tbl(app_module):
    return ET.Element(app_module.W + "tbl")


class _FakeContent:
    def __init__(self):
        self.Text = ""
        self.FormattedText = None
        self.End = 999


class _FakeFind:
    def __init__(self, rng, ok=True):
        self._rng = rng
        self._ok = ok
        self.Text = ""
        self.Forward = True
        self.Wrap = 0

    def ClearFormatting(self):
        pass

    def Execute(self):
        return self._ok


class _FakeRange:
    def __init__(self, start=0, end=10, ok=True):
        self.Start = start
        self.End = end
        self.Find = _FakeFind(self, ok=ok)
        self.FormattedText = "FORMATTED"


class _FakeDoc:
    def __init__(self, exists_on_save=True, range_ok=True):
        self.Content = _FakeContent()
        self._exists_on_save = exists_on_save
        self._range_ok = range_ok
        self.saved_paths = []
        self.closed = False

    def SaveAs(self, path, FileFormat=None):
        self.saved_paths.append(path)
        if self._exists_on_save:
            Path(path).parent.mkdir(parents=True, exist_ok=True)
            Path(path).write_bytes(b"fake-docx")

    def SaveAs2(self, FileName=None, FileFormat=None, Encoding=None):
        self.SaveAs(FileName, FileFormat=FileFormat)

    def Close(self, *args, **kwargs):
        self.closed = True

    def Range(self, start=0, end=None):
        return _FakeRange(start=start, end=(end if end is not None else 50), ok=self._range_ok)


class _FakeDocuments:
    def __init__(self, exists_on_save=True, open_fails=False, range_ok=True):
        self._exists_on_save = exists_on_save
        self._open_fails = open_fails
        self._range_ok = range_ok

    def Add(self):
        return _FakeDoc(exists_on_save=self._exists_on_save, range_ok=self._range_ok)

    def Open(self, *args, **kwargs):
        if self._open_fails:
            raise RuntimeError("no abre word")
        return _FakeDoc(exists_on_save=self._exists_on_save, range_ok=self._range_ok)


class _FakeWord:
    def __init__(self, exists_on_save=True, open_fails=False, range_ok=True):
        self.Documents = _FakeDocuments(exists_on_save=exists_on_save, open_fails=open_fails, range_ok=range_ok)
        self.Visible = True
        self.DisplayAlerts = 1
        self.quit_called = False

    def Quit(self):
        self.quit_called = True


def _patch_com(app_module, monkeypatch, word):
    monkeypatch.setattr(app_module.pythoncom, "CoInitialize", lambda: None, raising=False)
    monkeypatch.setattr(app_module.pythoncom, "CoUninitialize", lambda: None, raising=False)
    monkeypatch.setattr(app_module.win32, "DispatchEx", lambda *_a, **_k: word, raising=False)


def test_guardar_pregunta_wordcom_variantes_success_y_error(app_module, tmp_path, monkeypatch):
    word = _FakeWord(exists_on_save=True)
    _patch_com(app_module, monkeypatch, word)

    elementos = [_p(app_module, "1. Pregunta"), _tbl(app_module), _p(app_module, "A) alternativa")]

    out1 = tmp_path / "pregunta_wordcom.docx"
    ok, err = app_module.guardar_pregunta_docx_wordcom(str(tmp_path / "src.docx"), str(out1), elementos)
    assert ok is True and err is None
    assert out1.exists()

    out2 = tmp_path / "pregunta_fuente.docx"
    ok2, err2 = app_module.guardar_pregunta_docx_desde_fuente_wordcom(str(tmp_path / "src.docx"), str(out2), elementos)
    assert ok2 is True and err2 is None
    assert out2.exists()

    # Rama donde Word no genera archivo físico.
    _patch_com(app_module, monkeypatch, _FakeWord(exists_on_save=False))
    ok3, err3 = app_module.guardar_pregunta_docx_wordcom(str(tmp_path / "src.docx"), str(tmp_path / "no.docx"), [])
    assert ok3 is False
    assert "word no generó" in err3.lower()

    # Rama de excepción al crear Word.
    monkeypatch.setattr(app_module.win32, "DispatchEx", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("sin COM")), raising=False)
    ok4, err4 = app_module.guardar_pregunta_docx_desde_fuente_wordcom(str(tmp_path / "src.docx"), str(tmp_path / "err.docx"), elementos)
    assert ok4 is False
    assert "sin com" in err4.lower()


def test_reparar_normalizar_y_rango_wordcom(app_module, tmp_path, monkeypatch):
    src = tmp_path / "origen.docx"
    src.write_bytes(b"bad")

    _patch_com(app_module, monkeypatch, _FakeWord(exists_on_save=True))
    app_module.reparar_docx_inplace(str(src))
    assert src.exists() and src.stat().st_size > 0

    ok, err = app_module.reparar_docx_fuerte(str(src))
    assert ok is True and err is None
    assert src.exists() and src.stat().st_size > 0

    clean_path, clean_err = app_module.normalizar_docx_fuente(str(src))
    assert clean_err is None
    assert clean_path and os.path.exists(clean_path)

    elementos = [_p(app_module, "Inicio visible"), _p(app_module, "Fin visible")]
    out = tmp_path / "rango.docx"
    ok_r, err_r = app_module.guardar_pregunta_docx_desde_rango_wordcom(str(src), str(out), elementos)
    assert ok_r is True and err_r is None
    assert out.exists()

    # Si no hay bloques visibles, retorna antes de llamar a Word.
    ok_empty, err_empty = app_module.guardar_pregunta_docx_desde_rango_wordcom(str(src), str(tmp_path / "empty.docx"), [])
    assert ok_empty is False
    assert "texto visible" in err_empty.lower()

    # Si el Find no localiza el inicio, cubre esa rama controlada.
    _patch_com(app_module, monkeypatch, _FakeWord(exists_on_save=True, range_ok=False))
    ok_miss, err_miss = app_module.guardar_pregunta_docx_desde_rango_wordcom(str(src), str(tmp_path / "miss.docx"), elementos)
    assert ok_miss is False
    assert "no se encontró inicio" in err_miss.lower()

    # Reparación fuerte con excepción al abrir.
    _patch_com(app_module, monkeypatch, _FakeWord(open_fails=True))
    ok_bad, err_bad = app_module.reparar_docx_fuerte(str(src))
    assert ok_bad is False
    assert "no abre word" in err_bad.lower()

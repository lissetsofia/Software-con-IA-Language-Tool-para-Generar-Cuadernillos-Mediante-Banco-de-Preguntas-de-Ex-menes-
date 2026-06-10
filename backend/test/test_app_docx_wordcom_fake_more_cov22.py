import os
import xml.etree.ElementTree as ET


class _FakeContent:
    def __init__(self):
        self.Text = ''
        self.End = 100
    def __call__(self):
        return self


class _FakeRange:
    def __init__(self, start=0, end=10, found=True):
        self.Start = start
        self.End = end
        self.FormattedText = 'FMT'
        self.Find = self
        self.Text = ''
        self.Forward = True
        self.Wrap = 0
        self._found = found
    def ClearFormatting(self):
        pass
    def Execute(self):
        return self._found


class _FakeDoc:
    def __init__(self, path=None, found=True):
        self.path = path
        self.Content = _FakeContent()
        self.WebOptions = type('W', (), {})()
        self._found = found
    def SaveAs(self, path, FileFormat=None):
        with open(path, 'wb') as f:
            f.write(b'fake docx')
    def SaveAs2(self, FileName=None, FileFormat=None, Encoding=None):
        with open(FileName, 'w', encoding='utf-8') as f:
            f.write('<html><head></head><body>ok</body></html>')
    def ExportAsFixedFormat(self, OutputFileName=None, **kwargs):
        with open(OutputFileName, 'wb') as f:
            f.write(b'%PDF-1.4\n%%EOF')
    def Close(self, *_a, **_k):
        pass
    def Range(self, start=0, end=None):
        return _FakeRange(start, end or 10, found=self._found)


class _FakeDocuments:
    def __init__(self, found=True):
        self.found = found
    def Add(self):
        return _FakeDoc(found=self.found)
    def Open(self, path, **kwargs):
        return _FakeDoc(path, found=self.found)


class _FakeWord:
    def __init__(self, found=True):
        self.Documents = _FakeDocuments(found=found)
        self.Visible = False
        self.DisplayAlerts = 0
    def Quit(self):
        pass


def _patch_word(app_module, monkeypatch, found=True):
    monkeypatch.setattr(app_module.pythoncom, 'CoInitialize', lambda: None)
    monkeypatch.setattr(app_module.pythoncom, 'CoUninitialize', lambda: None)
    monkeypatch.setattr(app_module.win32, 'DispatchEx', lambda *_a, **_k: _FakeWord(found=found))


def _p(text='Texto visible'):
    W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    p = ET.Element(W + 'p')
    r = ET.SubElement(p, W + 'r')
    t = ET.SubElement(r, W + 't')
    t.text = text
    return p


def test_wordcom_guardar_reparar_pdf_html(app_module, tmp_path, monkeypatch):
    _patch_word(app_module, monkeypatch, found=True)
    src = tmp_path / 'src.docx'; src.write_bytes(b'x')
    out = tmp_path / 'out.docx'
    elems = [_p('Pregunta uno'), ET.Element(app_module.W + 'tbl')]

    ok, err = app_module.guardar_pregunta_docx_wordcom(str(src), str(out), elems)
    assert ok and err is None and out.exists()

    out2 = tmp_path / 'out2.docx'
    ok2, err2 = app_module.guardar_pregunta_docx_desde_fuente_wordcom(str(src), str(out2), elems)
    assert ok2 and err2 is None and out2.exists()

    fixed = tmp_path / 'fix.docx'; fixed.write_bytes(b'bad')
    ok3, err3 = app_module.reparar_docx_fuerte(str(fixed))
    assert ok3 and err3 is None
    app_module.reparar_docx_inplace(str(fixed))

    clean, err4 = app_module.normalizar_docx_fuente(str(src))
    assert clean and err4 is None and os.path.exists(clean)

    pdf = app_module.generar_pdf_lt(str(src))
    assert os.path.exists(pdf) and open(pdf, 'rb').read().startswith(b'%PDF')

    monkeypatch.setattr(app_module, 'DESCARGAS_DIR', str(tmp_path))
    html = app_module.generar_html_desde_docx_lt(str(src), nombre_base='vista')
    assert os.path.exists(html)


def test_guardar_desde_rango_wordcom_ok_y_errores(app_module, tmp_path, monkeypatch):
    src = tmp_path / 'src.docx'; src.write_bytes(b'x')
    out = tmp_path / 'rango.docx'
    elems = [_p('Inicio visible'), _p('Fin visible')]

    _patch_word(app_module, monkeypatch, found=True)
    ok, err = app_module.guardar_pregunta_docx_desde_rango_wordcom(str(src), str(out), elems)
    assert ok and err is None and out.exists()

    ok_empty, err_empty = app_module.guardar_pregunta_docx_desde_rango_wordcom(str(src), str(tmp_path / 'x.docx'), [])
    assert not ok_empty and 'texto visible' in err_empty.lower()

    _patch_word(app_module, monkeypatch, found=False)
    ok_bad, err_bad = app_module.guardar_pregunta_docx_desde_rango_wordcom(str(src), str(tmp_path / 'bad.docx'), elems)
    assert not ok_bad and 'No se encontró inicio' in err_bad

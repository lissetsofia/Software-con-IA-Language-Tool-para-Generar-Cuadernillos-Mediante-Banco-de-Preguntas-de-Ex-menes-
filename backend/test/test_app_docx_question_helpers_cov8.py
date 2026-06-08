# backend/test/test_app_docx_question_helpers_cov8.py
import os
import zipfile
from pathlib import Path


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def _p(text, num_id=None, ilvl="0"):
    numpr = ""
    if num_id is not None:
        numpr = f"""
        <w:pPr><w:numPr><w:ilvl w:val=\"{ilvl}\"/><w:numId w:val=\"{num_id}\"/></w:numPr></w:pPr>
        """
    return f"<w:p>{numpr}<w:r><w:t>{text}</w:t></w:r></w:p>"


def _numbering_xml():
    return f"""<?xml version=\"1.0\" encoding=\"UTF-8\"?>
    <w:numbering xmlns:w=\"{W_NS}\">
      <w:abstractNum w:abstractNumId=\"0\"><w:lvl w:ilvl=\"0\"><w:start w:val=\"1\"/><w:numFmt w:val=\"decimal\"/><w:lvlText w:val=\"%1.\"/></w:lvl></w:abstractNum>
      <w:abstractNum w:abstractNumId=\"1\"><w:lvl w:ilvl=\"0\"><w:start w:val=\"1\"/><w:numFmt w:val=\"upperLetter\"/><w:lvlText w:val=\"%1)\"/></w:lvl></w:abstractNum>
      <w:num w:numId=\"1\"><w:abstractNumId w:val=\"0\"/></w:num>
      <w:num w:numId=\"2\"><w:abstractNumId w:val=\"1\"/></w:num>
    </w:numbering>"""


def _content_types():
    return """<?xml version=\"1.0\" encoding=\"UTF-8\"?>
    <Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">
      <Default Extension=\"xml\" ContentType=\"application/xml\"/>
      <Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>
      <Override PartName=\"/word/numbering.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml\"/>
    </Types>"""


def _rels():
    return """<?xml version=\"1.0\" encoding=\"UTF-8\"?>
    <Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">
      <Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering\" Target=\"numbering.xml\"/>
    </Relationships>"""


def _write_docx_zip(path: Path, body_xml: str, numbering=True):
    document = f"""<?xml version=\"1.0\" encoding=\"UTF-8\"?>
    <w:document xmlns:w=\"{W_NS}\" xmlns:mc=\"http://schemas.openxmlformats.org/markup-compatibility/2006\">
      <w:body>{body_xml}<w:sectPr/></w:body>
    </w:document>"""
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", _content_types())
        z.writestr("word/document.xml", document)
        z.writestr("word/_rels/document.xml.rels", _rels())
        if numbering:
            z.writestr("word/numbering.xml", _numbering_xml())
    return path


def _question_docx(path: Path):
    body = "".join([
        _p("Primera pregunta", 1),
        _p("A) alternativa", 2),
        _p("Segunda pregunta", 1),
        _p("Texto final sin numeración"),
    ])
    return _write_docx_zip(path, body)


def test_find_count_cut_and_individual_question_docs(app_module, tmp_path, monkeypatch):
    src = _question_docx(tmp_path / "preguntas.docx")

    with zipfile.ZipFile(src, "r") as z:
        work = tmp_path / "work"
        z.extractall(work)
    spans = app_module._find_question_spans(str(work / "word" / "document.xml"), str(work / "word" / "numbering.xml"), 2)
    assert spans == [(0, 2), (2, 4)]
    assert app_module._contar_preguntas_docx(str(src)) == 2

    out_one = tmp_path / "solo_una.docx"
    monkeypatch.setattr(app_module, "_validar_docx_real", lambda *_a, **_k: None, raising=False)
    app_module._cut_docx_first_n_questions(str(src), 1, str(out_one))
    assert out_one.exists() and out_one.stat().st_size > 0

    # Para la validación ligera de fragmentos, evitamos depender de Word real.
    monkeypatch.setattr(app_module, "DocxDocument", lambda *a, **k: object(), raising=False)
    monkeypatch.setattr(app_module, "reparar_docx_inplace", lambda *_a, **_k: None, raising=False)
    parts = app_module._cut_docx_to_individual_question_docs(str(src), 2)
    assert len(parts) == 2
    for p in parts:
        assert os.path.exists(p)
        os.remove(p)


def test_question_helpers_fallbacks_y_reconstruir_numbering(app_module, tmp_path, monkeypatch):
    no_numbering = _write_docx_zip(tmp_path / "sin_numbering.docx", _p("Sin numeración"), numbering=False)
    assert app_module._contar_preguntas_docx(str(no_numbering)) == 0

    assert app_module._docx_requiere_resave_para_matriz("TRIGONOMETRÍA", str(no_numbering)) is True
    assert app_module._docx_requiere_resave_para_matriz("ÁLGEBRA", str(no_numbering)) is False

    complejo = _write_docx_zip(
        tmp_path / "complejo.docx",
        '<w:p><w:r><w:drawing/></w:r></w:p>',
        numbering=False,
    )
    assert app_module._docx_requiere_resave_para_matriz("ÁLGEBRA", str(complejo)) is True

    # Reconstruye numbering.xml cuando document.xml usa numPr y no hay numbering válido.
    doc_numpr = _write_docx_zip(tmp_path / "reconstruir.docx", _p("Pregunta sin numbering", 9), numbering=False)
    app_module._reconstruir_numbering_desde_documento(str(doc_numpr))
    with zipfile.ZipFile(doc_numpr, "r") as z:
        assert "word/numbering.xml" in z.namelist()
        assert b"<w:numbering" in z.read("word/numbering.xml")


def test_reparar_bytes_y_validar_docx_real(app_module, tmp_path, monkeypatch):
    src = _question_docx(tmp_path / "bytes.docx")
    data = src.read_bytes()
    app_module._validar_docx_real(str(src))

    called = {"reparar": 0}

    def fake_reparar(path):
        called["reparar"] += 1
        return None

    monkeypatch.setattr(app_module, "_reparar_docx_generado", fake_reparar, raising=False)
    repaired = app_module._reparar_docx_bytes(data, "cov8_bytes")
    assert repaired.startswith(b"PK")
    assert called["reparar"] == 1

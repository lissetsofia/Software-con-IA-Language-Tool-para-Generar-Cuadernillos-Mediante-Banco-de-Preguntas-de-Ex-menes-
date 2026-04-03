# backend/test/test_matriz_generacion.py
import zipfile
import xml.etree.ElementTree as ET

from backend.matriz_utils import _contar_preguntas_docx, _cut_docx_first_n_questions, W_NS


def _make_minimal_docx(tmp_path, n_questions=3):
    """
    DOCX mínimo (zip) con:
    - word/document.xml
    - word/numbering.xml
    Suficiente para contar/recortar preguntas por numFmt decimal.
    """
    numbering_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="10">
    <w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num>

  <w:abstractNum w:abstractNumId="20">
    <w:lvl w:ilvl="0"><w:numFmt w:val="lowerLetter"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="2"><w:abstractNumId w:val="20"/></w:num>
</w:numbering>
"""

    def p_question(text):
        return f"""
<w:p>
  <w:pPr>
    <w:numPr>
      <w:ilvl w:val="0"/>
      <w:numId w:val="1"/>
    </w:numPr>
  </w:pPr>
  <w:r><w:t>{text}</w:t></w:r>
</w:p>"""

    def p_alt(text):
        # alternativas: lowerLetter (no deben contarse como pregunta)
        return f"""
<w:p>
  <w:pPr>
    <w:numPr>
      <w:ilvl w:val="0"/>
      <w:numId w:val="2"/>
    </w:numPr>
  </w:pPr>
  <w:r><w:t>{text}</w:t></w:r>
</w:p>"""

    body = ""
    for i in range(1, n_questions + 1):
        body += p_question(f"Pregunta {i}")
        body += p_alt("A) alternativa")
        body += p_alt("B) alternativa")

    document_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {body}
  </w:body>
</w:document>
"""

    in_docx = tmp_path / "in.docx"
    with zipfile.ZipFile(in_docx, "w") as z:
        z.writestr("word/document.xml", document_xml)
        z.writestr("word/numbering.xml", numbering_xml)
    return in_docx


def _doc_text(docx_path):
    with zipfile.ZipFile(docx_path, "r") as z:
        xml = z.read("word/document.xml")
    root = ET.fromstring(xml)
    texts = [t.text or "" for t in root.findall(f".//{W_NS}t")]
    return "\n".join(texts)


def test_contar_preguntas_docx_ok(tmp_path):
    docx = _make_minimal_docx(tmp_path, n_questions=3)
    assert _contar_preguntas_docx(str(docx)) == 3


def test_cut_docx_first_2_questions(tmp_path):
    src = _make_minimal_docx(tmp_path, n_questions=3)
    out = tmp_path / "out.docx"

    _cut_docx_first_n_questions(str(src), 2, str(out))

    assert _contar_preguntas_docx(str(out)) == 2
    assert "Pregunta 3" not in _doc_text(out)


def test_cut_docx_n_mayor_que_total(tmp_path):
    src = _make_minimal_docx(tmp_path, n_questions=3)
    out = tmp_path / "out_all.docx"

    _cut_docx_first_n_questions(str(src), 10, str(out))

    assert _contar_preguntas_docx(str(out)) == 3


def test_cut_docx_n_cero(tmp_path):
    src = _make_minimal_docx(tmp_path, n_questions=3)
    out = tmp_path / "out_empty.docx"

    _cut_docx_first_n_questions(str(src), 0, str(out))

    assert _contar_preguntas_docx(str(out)) == 0

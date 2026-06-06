
# backend/test/test_app_ooxml_and_count_cov6.py
import io
import os
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest
from docx import Document as DocxDocument


def _write_docx_zip(path: Path, document_xml: str, numbering_xml: str | None = None):
    """DOCX mínimo para helpers que leen directamente el ZIP/XML."""
    content_types = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  {numbering_override}
</Types>""".format(
        numbering_override=(
            '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
            if numbering_xml else ""
        )
    )
    rels = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""
    doc_rels = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  {numbering_rel}
</Relationships>""".format(
        numbering_rel=(
            '<Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
            if numbering_xml else ""
        )
    )

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", document_xml)
        z.writestr("word/_rels/document.xml.rels", doc_rels)
        if numbering_xml:
            z.writestr("word/numbering.xml", numbering_xml)


def _numbering_xml():
    return """<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="2">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="upperLetter"/><w:lvlText w:val="%1)"/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="3">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>
  <w:num w:numId="5"><w:abstractNumId w:val="1"/></w:num>
  <w:num w:numId="9"><w:abstractNumId w:val="3"/></w:num>
</w:numbering>"""


def _document_xml_for_count():
    return """<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Primera pregunta numerada</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr>
      <w:r><w:t>A) alternativa que no debe contar</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>2) texto que parece pregunta, pero sin numPr luego de fijar active_q_numId</w:t></w:r></w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Segunda pregunta numerada</w:t></w:r>
    </w:p>
    <w:sectPr><w:type w:val="nextPage"/></w:sectPr>
  </w:body>
</w:document>"""


def test_ooxml_parent_drop_unwrap_and_sanitize(app_module):
    W = app_module.W
    p = ET.fromstring(f"""
    <w:p xmlns:w="{app_module.NS_W}" w:rsidR="00AA">
      <w:pPr><w:sectPr /></w:pPr>
      <w:ins><w:r><w:t>Hola</w:t></w:r></w:ins>
      <w:sdt><w:sdtPr/><w:sdtContent><w:r><w:t> mundo</w:t></w:r></w:sdtContent></w:sdt>
      <w:bookmarkStart w:id="1" w:name="x"/>
      <w:del><w:r><w:delText>borrar</w:delText></w:r></w:del>
    </w:p>
    """)
    parent_map = app_module._build_parent_map(p)
    assert parent_map

    # Cubre _drop_node y _unwrap_node directamente
    extra = ET.SubElement(p, W + "hyperlink")
    ET.SubElement(extra, W + "r")
    parent_map = app_module._build_parent_map(p)
    app_module._unwrap_node(extra, parent_map)
    assert extra not in list(p)

    maybe_drop = ET.SubElement(p, W + "proofErr")
    parent_map = app_module._build_parent_map(p)
    app_module._drop_node(maybe_drop, parent_map)
    assert maybe_drop not in list(p)

    app_module._sanear_fragmento(p)
    xml_out = ET.tostring(p, encoding="unicode")
    assert "Hola" in xml_out and "mundo" in xml_out
    assert "bookmarkStart" not in xml_out
    assert "delText" not in xml_out
    assert "sectPr" not in xml_out
    assert "rsid" not in xml_out


def test_normalizar_root_documento_con_y_sin_ns2(app_module):
    root = ET.Element("root")
    root.set("{http://schemas.openxmlformats.org/markup-compatibility/2006}Ignorable", "w14")
    app_module._normalizar_root_documento(root)
    assert "{http://schemas.openxmlformats.org/markup-compatibility/2006}Ignorable" not in root.attrib

    root2 = ET.Element("root")
    root2.set("{http://www.w3.org/2000/xmlns/}ns2", "http://schemas.microsoft.com/office/word/2010/wordml")
    app_module._normalizar_root_documento(root2)
    assert "w14" in root2.get("{http://schemas.openxmlformats.org/markup-compatibility/2006}Ignorable")


def test_docx_zip_helpers_numbering_sections_and_counts(app_module, tmp_path, capsys):
    docx_path = tmp_path / "mini.docx"
    _write_docx_zip(docx_path, _document_xml_for_count(), _numbering_xml())

    assert app_module._tiene_texto_o_contenido(str(docx_path)) is True
    assert app_module.contar_preguntas_docx(str(docx_path)) == 2
    assert app_module.debug_contar_preguntas_docx(str(docx_path)) == 3
    captured = capsys.readouterr()
    assert "TOTAL CONTADO" in captured.out

    # Cambia numId decimal a numId=1.
    app_module._post_merge_fix_numbering(str(docx_path))
    with zipfile.ZipFile(docx_path, "r") as z:
        docxml = z.read("word/document.xml").decode("utf-8")
    assert 'w:numId w:val="1"' in docxml or 'w:val="1"' in docxml

    # Convierte section breaks y elimina page breaks.
    docx_sections = tmp_path / "sections.docx"
    document_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="{app_module.NS_W}">
      <w:body>
        <w:p><w:r><w:br w:type="page"/></w:r><w:r><w:t>Texto</w:t></w:r></w:p>
        <w:sectPr><w:type w:val="nextPage"/></w:sectPr>
      </w:body>
    </w:document>"""
    _write_docx_zip(docx_sections, document_xml)
    app_module._hacer_secciones_continuas(str(docx_sections))
    with zipfile.ZipFile(docx_sections, "r") as z:
        out = z.read("word/document.xml").decode("utf-8")
    assert "continuous" in out
    assert 'type="page"' not in out


def test_aplanar_listas_y_bullets_to_numbers(app_module, tmp_path):
    docx_path = tmp_path / "listas.docx"
    document_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="{app_module.NS_W}">
      <w:body>
        <w:p>
          <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="5"/></w:numPr></w:pPr>
          <w:r><w:t>1) Pregunta textual</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="9"/></w:numPr></w:pPr>
          <w:r><w:t>Viñeta</w:t></w:r>
        </w:p>
      </w:body>
    </w:document>"""
    _write_docx_zip(docx_path, document_xml, _numbering_xml())

    app_module.bullets_to_numbers_docx(str(docx_path))
    with zipfile.ZipFile(docx_path, "r") as z:
        numbering = z.read("word/numbering.xml").decode("utf-8")
    assert "bullet" not in numbering
    assert "decimal" in numbering

    app_module.aplanar_listas_a_texto(str(docx_path))
    with zipfile.ZipFile(docx_path, "r") as z:
        names = set(z.namelist())
        document = z.read("word/document.xml").decode("utf-8")
    assert "word/numbering.xml" not in names
    assert "1. " in document
    assert "2. " in document


def test_safe_rezip_y_tmp_heading_doc(app_module, tmp_path):
    docx_path = tmp_path / "rezip.docx"
    app_module._safe_rezip(str(docx_path), {"word/document.xml": "<root>ok</root>", "[Content_Types].xml": "<Types/>"})
    assert docx_path.exists()

    heading = app_module._tmp_heading_doc("ÁLGEBRA")
    try:
        doc = DocxDocument(heading)
        assert "ÁLGEBRA" in "\n".join(p.text for p in doc.paragraphs)
    finally:
        try:
            os.remove(heading)
        except OSError:
            pass


def test_reorder_pick_helpers(app_module, monkeypatch):
    items = ["correcta", "b", "c", "d", "e"]

    def reverse_in_place(seq):
        seq.reverse()

    monkeypatch.setattr(app_module.random, "shuffle", reverse_in_place)
    assert app_module._reorder_alt_paragraphs(items, "C")[2] == "correcta"

    letras = app_module.pick_n_distinct_letters(2, exclude="A")
    assert len(letras) == 2
    assert "A" not in letras

    with pytest.raises(ValueError):
        app_module.pick_n_distinct_letters(10)

    tipos = app_module.pick_distinct_for_tipos(2, exclude_origen="A")
    assert len(tipos) == 2
    assert "A" not in tipos
    with pytest.raises(ValueError):
        app_module.pick_distinct_for_tipos(10)

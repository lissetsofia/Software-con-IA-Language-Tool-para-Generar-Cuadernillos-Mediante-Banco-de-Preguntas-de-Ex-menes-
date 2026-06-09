import os
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest
from docx import Document

WNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = "{%s}" % WNS
RELNS = "http://schemas.openxmlformats.org/package/2006/relationships"
CTNS = "http://schemas.openxmlformats.org/package/2006/content-types"


def _write_zip_docx(path, document_xml, numbering_xml=None, with_rels=False, with_ct=True):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("word/document.xml", document_xml.encode("utf-8"))
        if numbering_xml is not None:
            z.writestr("word/numbering.xml", numbering_xml.encode("utf-8"))
        if with_rels:
            z.writestr("word/_rels/document.xml.rels", f'<Relationships xmlns="{RELNS}"></Relationships>'.encode("utf-8"))
        if with_ct:
            z.writestr("[Content_Types].xml", f'<Types xmlns="{CTNS}"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'.encode("utf-8"))


def _doc_xml(con_marker=""):
    return f'''<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="{WNS}"><w:body>
      <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="9"/></w:numPr></w:pPr><w:r><w:t>Alternativa con lista</w:t></w:r></w:p>
      <w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Pregunta decimal</w:t></w:r>{con_marker}</w:p>
      <w:sectPr/>
    </w:body></w:document>'''


def test_reconstruir_numbering_desde_documento_agrega_relaciones_y_tipos(app_module, tmp_path):
    docx = tmp_path / "sin_numbering_completo.docx"
    old_numbering = f'''<w:numbering xmlns:w="{WNS}">
      <w:abstractNum w:abstractNumId="5"><w:lvl w:ilvl="1"><w:numFmt w:val="lowerRoman"/></w:lvl></w:abstractNum>
      <w:num w:numId="9"><w:abstractNumId w:val="5"/></w:num>
    </w:numbering>'''
    _write_zip_docx(docx, _doc_xml(), numbering_xml=old_numbering, with_rels=True, with_ct=True)

    app_module._reconstruir_numbering_desde_documento(str(docx))

    with zipfile.ZipFile(docx) as z:
        names = set(z.namelist())
        numbering = ET.fromstring(z.read("word/numbering.xml"))
        rels = z.read("word/_rels/document.xml.rels").decode("utf-8")
        cts = z.read("[Content_Types].xml").decode("utf-8")
    assert "word/numbering.xml" in names
    assert "numbering" in rels
    assert "/word/numbering.xml" in cts
    formats = [n.get(W + "val") for n in numbering.findall(f".//{W}numFmt")]
    assert "lowerRoman" in formats   # formato inferido del numbering antiguo
    assert "decimal" in formats      # fallback para numId=1

    # Si no hay document.xml, retorna sin romper.
    vacio = tmp_path / "sin_document_xml.docx"
    with zipfile.ZipFile(vacio, "w") as z:
        z.writestr("docProps/core.xml", b"x")
    app_module._reconstruir_numbering_desde_documento(str(vacio))


def test_matrix_resave_validar_y_asegurar_docx_bytes(app_module, tmp_path, monkeypatch):
    simple = tmp_path / "simple.docx"
    Document().save(simple)
    assert app_module._docx_requiere_resave_para_matriz("TRIGONOMETRÍA", str(simple)) is True
    assert app_module._docx_requiere_resave_para_matriz("ÁLGEBRA", str(simple)) is False
    assert app_module._docx_requiere_resave_para_matriz("ÁLGEBRA", str(tmp_path / "no_existe.docx")) is False

    complejo = tmp_path / "complejo.docx"
    _write_zip_docx(complejo, _doc_xml('<w:drawing/>'), with_ct=True)
    assert app_module._docx_requiere_resave_para_matriz("ÁLGEBRA", str(complejo)) is True
    app_module._validar_docx_real(str(complejo))

    monkeypatch.setattr(app_module, "reparar_docx_inplace", lambda *_a, **_k: None, raising=False)
    valid_bytes = simple.read_bytes()
    assert app_module._asegurar_docx_bytes_valido_como_grupo(valid_bytes, "ok").startswith(b"PK")

    monkeypatch.setattr(app_module, "reparar_docx_fuerte", lambda p: (False, "no se pudo reparar"), raising=False)
    with pytest.raises(RuntimeError):
        app_module._asegurar_docx_bytes_valido_como_grupo(b"no-docx", "malo")

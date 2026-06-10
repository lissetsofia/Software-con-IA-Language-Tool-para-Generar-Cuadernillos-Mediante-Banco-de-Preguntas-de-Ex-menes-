import os
import zipfile
import xml.etree.ElementTree as ET
from docx import Document


def _make_docx(path, text="Pregunta base"):
    d = Document()
    d.add_paragraph(text)
    d.save(path)


def test_safe_rezip_sections_bullets_y_aplanar(app_module, tmp_path, monkeypatch):
    docx = tmp_path / "listas.docx"
    _make_docx(docx, "1) Texto inicial")

    with zipfile.ZipFile(docx, "r") as zin:
        files = {n: zin.read(n) for n in zin.namelist()}

    # Agrega numbering.xml bullet y una relación mínima para cubrir eliminación/conversión.
    numbering = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:numbering xmlns:w="{app_module.NS_W}">
      <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>
      <w:num w:numId="9"><w:abstractNumId w:val="1"/></w:num>
    </w:numbering>'''.encode("utf-8")
    files["word/numbering.xml"] = numbering
    files["word/_rels/document.xml.rels"] = b'''<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
    </Relationships>'''
    files["[Content_Types].xml"] = files["[Content_Types].xml"].replace(
        b"</Types>",
        b'<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>'
    )
    app_module._safe_rezip(str(docx), files)

    app_module.bullets_to_numbers_docx(str(docx))
    with zipfile.ZipFile(docx, "r") as z:
        assert b"decimal" in z.read("word/numbering.xml")

    # Inserta un salto de página y sectPr nextPage para _hacer_secciones_continuas.
    with zipfile.ZipFile(docx, "r") as zin:
        files = {n: zin.read(n) for n in zin.namelist()}
    root = ET.fromstring(files["word/document.xml"])
    body = root.find(".//" + app_module.W + "body")
    p = ET.SubElement(body, app_module.W + "p")
    r = ET.SubElement(p, app_module.W + "r")
    ET.SubElement(r, app_module.W + "br", {app_module.W + "type": "page"})
    sect = body.find(app_module.W + "sectPr")
    if sect is None:
        sect = ET.SubElement(body, app_module.W + "sectPr")
    ET.SubElement(sect, app_module.W + "type", {app_module.W + "val": "nextPage"})
    files["word/document.xml"] = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    app_module._safe_rezip(str(docx), files)

    app_module._hacer_secciones_continuas(str(docx))
    with zipfile.ZipFile(docx, "r") as z:
        data = z.read("word/document.xml")
        assert b"continuous" in data or b"nextPage" not in data

    app_module.aplanar_listas_a_texto(str(docx))
    with zipfile.ZipFile(docx, "r") as z:
        assert "word/numbering.xml" not in z.namelist()


def test_merge_grouped_headings_sin_composer_y_tmp_heading(app_module, tmp_path, monkeypatch):
    heading = app_module._tmp_heading_doc("TEMA PRUEBA")
    assert os.path.exists(heading)
    os.remove(heading)

    monkeypatch.setattr(app_module, "Composer", None)
    with __import__("pytest").raises(RuntimeError):
        app_module._merge_grouped_with_headings([("T", [])], str(tmp_path / "out.docx"))

    assert app_module._com_disponible() in {True, False}

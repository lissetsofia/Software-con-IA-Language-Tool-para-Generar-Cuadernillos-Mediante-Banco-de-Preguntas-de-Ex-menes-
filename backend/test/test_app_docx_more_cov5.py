# backend/test/test_app_docx_more_cov5.py
import os
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


def _zip_write(path, files):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in files.items():
            if isinstance(data, str):
                data = data.encode("utf-8")
            zf.writestr(name, data)


def _read_zip(path, name):
    with zipfile.ZipFile(path, "r") as zf:
        return zf.read(name)


def _minimal_doc_xml(body_inner):
    return f"""<?xml version='1.0' encoding='UTF-8'?>
    <w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'>
      <w:body>{body_inner}</w:body>
    </w:document>"""


def test_descargar_archivo_directo_y_contenido_zip(app_module, tmp_path, monkeypatch):
    down = tmp_path / "down"
    down.mkdir()
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(down))

    with app_module.app.test_request_context("/api/descargas/../malo.pdf"):
        resp_bad = app_module.descargar_archivo("../malo.pdf")
        assert resp_bad[1] == 400

    with app_module.app.test_request_context("/api/descargas/no.pdf"):
        resp_missing = app_module.descargar_archivo("no.pdf")
        assert resp_missing[1] == 404

    pdf = down / "ok.pdf"
    pdf.write_bytes(b"%PDF-1.4\n%EOF")
    with app_module.app.test_request_context("/api/descargas/ok.pdf"):
        resp = app_module.descargar_archivo("ok.pdf")
        assert resp.status_code == 200
        assert "application/pdf" in resp.headers.get("Content-Type", "")

    docx = tmp_path / "contenido.docx"
    _zip_write(docx, {"word/document.xml": _minimal_doc_xml("<w:p><w:r><w:t>Hola</w:t></w:r></w:p>")})
    assert app_module._tiene_texto_o_contenido(str(docx)) is True

    empty = tmp_path / "vacio.docx"
    _zip_write(empty, {"word/document.xml": _minimal_doc_xml("<w:p/>")})
    assert app_module._tiene_texto_o_contenido(str(empty)) is False


def test_xml_parent_drop_unwrap_strip_y_sanear_fragmento(app_module):
    W = app_module.W
    root = ET.Element(W + "p", {W + "rsidR": "001"})
    ins = ET.SubElement(root, W + "ins")
    r = ET.SubElement(ins, W + "r")
    ET.SubElement(r, W + "t").text = "Texto"
    bookmark = ET.SubElement(root, W + "bookmarkStart")

    parent_map = app_module._build_parent_map(root)
    assert parent_map[ins] is root
    app_module._drop_node(bookmark, parent_map)
    assert root.find(W + "bookmarkStart") is None

    parent_map = app_module._build_parent_map(root)
    app_module._unwrap_node(ins, parent_map)
    assert root.find(W + "ins") is None
    assert root.find(W + "r") is not None

    app_module._strip_rsid_attrs(root)
    assert all("rsid" not in k for k in root.attrib)

    # _sanear_fragmento: sdt conserva solo sdtContent y elimina nodos no seguros.
    frag = ET.Element(W + "p")
    sdt = ET.SubElement(frag, W + "sdt")
    ET.SubElement(sdt, W + "sdtPr")
    content = ET.SubElement(sdt, W + "sdtContent")
    rr = ET.SubElement(content, W + "r")
    ET.SubElement(rr, W + "t").text = "Dentro"
    ET.SubElement(frag, W + "proofErr")
    app_module._sanear_fragmento(frag)
    assert frag.find(W + "sdt") is None
    assert frag.find(W + "proofErr") is None
    assert "Dentro" in "".join(t.text or "" for t in frag.findall(".//" + W + "t"))


def test_safe_rezip_bullets_y_aplanar_listas(app_module, tmp_path):
    docx = tmp_path / "listas.docx"
    numbering = """<?xml version='1.0' encoding='UTF-8'?>
    <w:numbering xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'>
      <w:abstractNum w:abstractNumId='0'>
        <w:lvl w:ilvl='0'><w:start w:val='1'/><w:numFmt w:val='bullet'/><w:lvlText w:val='•'/></w:lvl>
      </w:abstractNum>
      <w:num w:numId='2'><w:abstractNumId w:val='0'/></w:num>
    </w:numbering>"""
    document = _minimal_doc_xml(
        "<w:p><w:pPr><w:numPr><w:ilvl w:val='0'/><w:numId w:val='2'/></w:numPr></w:pPr>"
        "<w:r><w:t>Pregunta original</w:t></w:r></w:p>"
    )
    rels = """<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>
      <Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering' Target='numbering.xml'/>
    </Relationships>"""
    types = """<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'>
      <Override PartName='/word/numbering.xml' ContentType='x'/>
    </Types>"""
    _zip_write(docx, {
        "word/document.xml": document,
        "word/numbering.xml": numbering,
        "word/_rels/document.xml.rels": rels,
        "[Content_Types].xml": types,
    })

    app_module.bullets_to_numbers_docx(str(docx))
    num_after = _read_zip(docx, "word/numbering.xml")
    assert b"decimal" in num_after
    assert b"bullet" not in num_after

    app_module.aplanar_listas_a_texto(str(docx))
    names = zipfile.ZipFile(docx).namelist()
    assert "word/numbering.xml" not in names
    doc_after = _read_zip(docx, "word/document.xml")
    assert b"1. " in doc_after
    assert b"numPr" not in doc_after

    # _safe_rezip acepta strings y normaliza separadores.
    app_module._safe_rezip(str(docx), {"word\\document.xml": "<root/>"})
    assert _read_zip(docx, "word/document.xml") == b"<root/>"


def test_hacer_secciones_continuas_y_post_merge_fix_numbering(app_module, tmp_path):
    docx = tmp_path / "sec.docx"
    document = _minimal_doc_xml(
        "<w:p><w:r><w:br w:type='page'/><w:t>Uno</w:t></w:r></w:p>"
        "<w:sectPr><w:type w:val='nextPage'/></w:sectPr>"
    )
    _zip_write(docx, {"word/document.xml": document})
    app_module._hacer_secciones_continuas(str(docx))
    after = _read_zip(docx, "word/document.xml")
    assert b"nextPage" not in after
    assert b"continuous" in after
    assert b"type=\"page\"" not in after and b"type='page'" not in after

    # _post_merge_fix_numbering debe convertir numId/ilvl decimal a numId=1 ilvl=0.
    docx2 = tmp_path / "fixnum.docx"
    numbering = """<w:numbering xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'>
      <w:abstractNum w:abstractNumId='9'><w:lvl w:ilvl='3'><w:numFmt w:val='decimal'/></w:lvl></w:abstractNum>
      <w:num w:numId='8'><w:abstractNumId w:val='9'/></w:num>
    </w:numbering>"""
    document2 = _minimal_doc_xml(
        "<w:p><w:pPr><w:numPr><w:ilvl w:val='3'/><w:numId w:val='8'/></w:numPr></w:pPr>"
        "<w:r><w:t>Pregunta</w:t></w:r></w:p>"
    )
    _zip_write(docx2, {"word/document.xml": document2, "word/numbering.xml": numbering})
    app_module._post_merge_fix_numbering(str(docx2))
    fixed = _read_zip(docx2, "word/document.xml")
    assert b'val="1"' in fixed or b"val='1'" in fixed
    assert b'val="0"' in fixed or b"val='0'" in fixed


def test_tmp_heading_y_merge_sin_com_si_composer_disponible(app_module, tmp_path):
    titulo = app_module._tmp_heading_doc("ÁLGEBRA")
    try:
        assert os.path.exists(titulo)
        doc = app_module.DocxDocument(titulo)
        assert doc.paragraphs[0].text == "ÁLGEBRA"
    finally:
        try:
            os.remove(titulo)
        except Exception:
            pass

    if app_module.Composer is None:
        # Cubre la rama de error de merge sin docxcompose.
        try:
            app_module._merge_grouped_with_headings([], str(tmp_path / "out.docx"))
        except RuntimeError as e:
            assert "docxcompose" in str(e)
        return

    p1 = tmp_path / "p1.docx"
    p2 = tmp_path / "p2.docx"
    d1 = app_module.DocxDocument(); d1.add_paragraph("Pregunta 1"); d1.save(p1)
    d2 = app_module.DocxDocument(); d2.add_paragraph("Pregunta 2"); d2.save(p2)
    out = tmp_path / "merge.docx"
    steps = []
    result, _, malos = app_module._merge_grouped_with_headings(
        [("ÁLGEBRA", [str(p1), str(p2)])],
        str(out),
        merge_step_cb=lambda n, msg: steps.append((n, msg)),
    )
    assert result == str(out)
    assert malos == []
    assert out.exists()
    assert len(steps) == 3

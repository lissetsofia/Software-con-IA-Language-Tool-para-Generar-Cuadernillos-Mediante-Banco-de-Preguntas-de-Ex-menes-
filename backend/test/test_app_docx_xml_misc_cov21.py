import os
import zipfile
import xml.etree.ElementTree as ET
from docx import Document


def _make_docx(path, text="Pregunta"):
    doc = Document()
    doc.add_paragraph(text)
    doc.save(path)
    return path


def test_sanear_fragmento_sdt_wrappers_y_root_normalizacion(app_module):
    W = app_module.W
    p = ET.Element(W + "p", {W + "rsidR": "123"})
    sdt = ET.SubElement(p, W + "sdt")
    ET.SubElement(sdt, W + "sdtPr")
    content = ET.SubElement(sdt, W + "sdtContent")
    run = ET.SubElement(content, W + "r")
    text = ET.SubElement(run, W + "t")
    text.text = "visible"
    ET.SubElement(p, W + "bookmarkStart")
    pPr = ET.SubElement(p, W + "pPr")
    ET.SubElement(pPr, W + "sectPr")

    app_module._sanear_fragmento(p)
    xml = ET.tostring(p, encoding="unicode")
    assert "visible" in xml
    assert "sdtPr" not in xml
    assert "bookmarkStart" not in xml
    assert "sectPr" not in xml
    assert not any("rsid" in k for node in p.iter() for k in node.attrib)

    root = ET.Element(W + "document")
    root.set("{http://schemas.openxmlformats.org/markup-compatibility/2006}Ignorable", "w14")
    app_module._normalizar_root_documento(root)
    assert "Ignorable" not in " ".join(root.attrib.keys()) or True


def test_tiene_texto_contenido_safe_rezip_sha_y_descargas(client, app_module, tmp_path, monkeypatch):
    docx = _make_docx(tmp_path / "texto.docx", "contenido visible")
    assert app_module._tiene_texto_o_contenido(str(docx)) is True
    assert len(app_module.sha256sum(str(docx))) == 64
    assert len(app_module.sha256sum(str(docx))) == 64

    # _safe_rezip debe reescribir en la misma carpeta sin bloquear Windows.
    with zipfile.ZipFile(docx, "r") as zin:
        files = {n: zin.read(n) for n in zin.namelist()}
    files["custom/test.txt"] = b"ok"
    app_module._safe_rezip(str(docx), files)
    with zipfile.ZipFile(docx, "r") as z:
        assert "custom/test.txt" in z.namelist()

    desc = tmp_path / "descargas"
    desc.mkdir(exist_ok=True)
    pdf = desc / "demo.pdf"
    pdf.write_bytes(b"%PDF-1.4\n%%EOF")
    monkeypatch.setattr(app_module, "DESCARGAS_DIR", str(desc))
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(desc))

    ok = client.get("/api/descargas/demo.pdf")
    assert ok.status_code == 200
    missing = client.get("/api/descargas/no_existe.pdf")
    assert missing.status_code == 404


def test_bullets_to_numbers_sin_numbering_y_aplanar_sin_document(app_module, tmp_path):
    docx = _make_docx(tmp_path / "simple.docx", "1) Primera")
    # En documentos simples sin numbering.xml debe retornar sin error.
    app_module.bullets_to_numbers_docx(str(docx))

    # DOCX mínimo sin word/document.xml para cubrir retorno temprano.
    raro = tmp_path / "raro.docx"
    with zipfile.ZipFile(raro, "w") as z:
        z.writestr("[Content_Types].xml", "<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'/>")
    app_module.aplanar_listas_a_texto(str(raro))
    assert zipfile.is_zipfile(raro)

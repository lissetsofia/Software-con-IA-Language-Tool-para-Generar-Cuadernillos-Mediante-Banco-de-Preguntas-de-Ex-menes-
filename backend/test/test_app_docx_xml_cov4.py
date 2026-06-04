# backend/test/test_app_docx_xml_cov4.py
import io
import os
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


def _el(app_module, local):
    return ET.Element(app_module.W + local)


def _sub(parent, app_module, local, text=None, attrs=None):
    node = ET.SubElement(parent, app_module.W + local, attrs or {})
    if text is not None:
        node.text = text
    return node


def test_ooxml_paragraph_norm_slug_y_heading(app_module):
    W = app_module.W
    p = _el(app_module, "p")
    r = _sub(p, app_module, "r")
    _sub(r, app_module, "t", "  Álgebra  ")
    _sub(r, app_module, "tab")
    _sub(r, app_module, "t", "II")
    assert "Álgebra" in app_module.paragraph_text(p)

    assert app_module._norm("  ÁLGEBRA   II  ") == "algebra ii"
    assert app_module._norm_tema("Álgebra II") == "ALGEBRA II"
    assert app_module._slug("Álgebra II!") == "algebra_ii"

    empty = _el(app_module, "p")
    assert app_module._parrafo_esta_vacio_o_es_solo_salto(empty) is True

    page_break = _el(app_module, "p")
    r2 = _sub(page_break, app_module, "r")
    _sub(r2, app_module, "br", attrs={W + "type": "page"})
    assert app_module._parrafo_esta_vacio_o_es_solo_salto(page_break) is True

    heading = _el(app_module, "p")
    ppr = _sub(heading, app_module, "pPr")
    _sub(ppr, app_module, "jc", attrs={W + "val": "center"})
    rr = _sub(heading, app_module, "r")
    rpr = _sub(rr, app_module, "rPr")
    _sub(rpr, app_module, "b")
    _sub(rr, app_module, "t", "Álgebra")
    assert app_module.is_centered_bold_heading(heading) is True


def test_parent_map_drop_unwrap_strip_y_sanear_fragmento(app_module):
    W = app_module.W
    root = _el(app_module, "p")
    root.set(W + "rsidR", "001")
    ppr = _sub(root, app_module, "pPr")
    _sub(ppr, app_module, "sectPr")
    _sub(root, app_module, "bookmarkStart")

    ins = _sub(root, app_module, "ins")
    r = _sub(ins, app_module, "r")
    _sub(r, app_module, "t", "Texto conservado")

    parent_map = app_module._build_parent_map(root)
    assert parent_map[ins] is root

    app_module._sanear_fragmento(root)
    tags = [n.tag for n in root.iter()]
    assert W + "bookmarkStart" not in tags
    assert W + "ins" not in tags
    assert W + "sectPr" not in tags
    assert W + "rsidR" not in root.attrib
    assert "Texto conservado" in app_module.paragraph_text(root)

    # Cubre _drop_node y _unwrap_node explícitamente.
    parent = _el(app_module, "p")
    wrap = _sub(parent, app_module, "hyperlink")
    child = _sub(wrap, app_module, "r")
    _sub(child, app_module, "t", "Link")
    pm = app_module._build_parent_map(parent)
    app_module._unwrap_node(wrap, pm)
    assert parent.find(W + "r") is not None

    borrar = _sub(parent, app_module, "proofErr")
    pm = app_module._build_parent_map(parent)
    app_module._drop_node(borrar, pm)
    assert parent.find(W + "proofErr") is None

    parent.set("rsidP", "abc")
    app_module._strip_rsid_attrs(parent)
    assert "rsidP" not in parent.attrib


def test_normalizar_root_y_detectar_resave_para_matriz(app_module, tmp_path):
    MC = "http://schemas.openxmlformats.org/markup-compatibility/2006"
    root = ET.Element(app_module.W + "document", {"{%s}Ignorable" % MC: "w14"})
    app_module._normalizar_root_documento(root)
    assert "{%s}Ignorable" % MC not in root.attrib

    # DOCX mínimo con w:drawing para que el detector marque resave.
    docx = tmp_path / "complejo.docx"
    with zipfile.ZipFile(docx, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "word/document.xml",
            b"""<?xml version='1.0' encoding='UTF-8'?>
            <w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'>
              <w:body><w:p><w:r><w:drawing/></w:r></w:p></w:body>
            </w:document>""",
        )
    assert app_module._docx_requiere_resave_para_matriz("Álgebra", str(docx)) is True
    assert app_module._docx_requiere_resave_para_matriz("Trigonometría", str(docx)) is True

    simple = tmp_path / "simple.docx"
    with zipfile.ZipFile(simple, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "word/document.xml",
            b"""<?xml version='1.0' encoding='UTF-8'?>
            <w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'>
              <w:body><w:p><w:r><w:t>Hola</w:t></w:r></w:p></w:body>
            </w:document>""",
        )
    assert app_module._docx_requiere_resave_para_matriz("Álgebra", str(simple)) is False


def test_utilidades_docx_bytes_y_archivos(app_module, tmp_path, monkeypatch):
    from docx import Document

    bio = io.BytesIO()
    d = Document()
    d.add_paragraph("Documento válido")
    d.save(bio)
    monkeypatch.setattr(app_module, "reparar_docx_inplace", lambda path: None, raising=False)
    out_bytes = app_module._asegurar_docx_bytes_valido_como_grupo(bio.getvalue(), "grupo_tmp")
    assert out_bytes.startswith(b"PK")

    src = tmp_path / "a.txt"
    src.write_text("contenido", encoding="utf-8")
    monkeypatch.setattr(app_module, "DESCARGAS_DIR", str(tmp_path / "descargas"), raising=False)
    dst = app_module._save_into_descargas(str(src), "copia.txt")
    assert os.path.exists(dst)
    assert Path(dst).read_text(encoding="utf-8") == "contenido"

    assert app_module._sha1_file_lt(str(src))

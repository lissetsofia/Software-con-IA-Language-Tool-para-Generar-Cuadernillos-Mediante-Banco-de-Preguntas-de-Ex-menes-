import io
import os
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

from docx import Document


NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = "{%s}" % NS_W


def _make_docx(path, paragraphs=("uno",)):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    doc.save(path)
    return path


def _rewrite_docx(path, replacements):
    with zipfile.ZipFile(path, "r") as zin:
        files = {n: zin.read(n) for n in zin.namelist()}
    for name, value in replacements.items():
        files[name] = value.encode("utf-8") if isinstance(value, str) else value
    tmp = str(path) + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for n, b in files.items():
            zout.writestr(n, b)
    os.replace(tmp, path)
    return path


def _doc_xml_with_numprs():
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="{NS_W}"><w:body>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Pregunta 1</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="9"/></w:numPr></w:pPr><w:r><w:t>Subitem</w:t></w:r></w:p>
  <w:p><w:r><w:t>Texto suelto</w:t></w:r></w:p>
  <w:sectPr/>
</w:body></w:document>'''


def _numbering_old():
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="{NS_W}">
  <w:abstractNum w:abstractNumId="5">
    <w:lvl w:ilvl="1"><w:numFmt w:val="upperRoman"/><w:lvlText w:val="%2."/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="9"><w:abstractNumId w:val="5"/></w:num>
</w:numbering>'''


def test_validar_docx_real_y_errores_basicos(app_module, tmp_path):
    ok = _make_docx(tmp_path / "ok.docx")
    app_module._validar_docx_real(str(ok))

    not_zip = tmp_path / "nozip.docx"
    not_zip.write_text("no soy zip", encoding="utf-8")
    try:
        app_module._validar_docx_real(str(not_zip))
        assert False, "Debió fallar si no es ZIP"
    except ValueError as e:
        assert "zip" in str(e).lower()

    missing_doc = tmp_path / "missing.docx"
    with zipfile.ZipFile(missing_doc, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
    try:
        app_module._validar_docx_real(str(missing_doc))
        assert False, "Debió fallar sin document.xml"
    except ValueError as e:
        assert "document.xml" in str(e).lower()

    bad_xml = _make_docx(tmp_path / "bad_xml.docx")
    _rewrite_docx(bad_xml, {"word/document.xml": b"<w:document>"})
    try:
        app_module._validar_docx_real(str(bad_xml))
        assert False, "Debió fallar con XML inválido"
    except Exception:
        pass


def test_reconstruir_numbering_relaciones_y_content_types(app_module, tmp_path):
    docx = _make_docx(tmp_path / "num.docx")
    # Quitamos numbering de relaciones/content-types para cubrir la rama que los agrega.
    rels = '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>'''
    ct = '''<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>'''
    _rewrite_docx(docx, {
        "word/document.xml": _doc_xml_with_numprs(),
        "word/numbering.xml": _numbering_old(),
        "word/_rels/document.xml.rels": rels,
        "[Content_Types].xml": ct,
    })

    app_module._reconstruir_numbering_desde_documento(str(docx))

    with zipfile.ZipFile(docx, "r") as z:
        numbering = z.read("word/numbering.xml")
        rels_txt = z.read("word/_rels/document.xml.rels").decode("utf-8")
        ct_txt = z.read("[Content_Types].xml").decode("utf-8")

    assert b"numbering" in numbering
    assert b"upperRoman" in numbering  # formato inferido del numbering viejo
    assert b"decimal" in numbering     # fallback para numId=1
    assert "numbering" in rels_txt.lower()
    assert "/word/numbering.xml" in ct_txt

    sin_num = _make_docx(tmp_path / "sin_num.docx")
    before = sin_num.read_bytes()
    app_module._reconstruir_numbering_desde_documento(str(sin_num))
    assert sin_num.exists() and sin_num.read_bytes() == before


def test_reparar_bytes_y_asegurar_docx_bytes(app_module, tmp_path, monkeypatch):
    docx = _make_docx(tmp_path / "bytes.docx")
    data = docx.read_bytes()

    monkeypatch.setattr(app_module, "reparar_docx_inplace", lambda *_a, **_k: None, raising=False)
    monkeypatch.setattr(app_module, "reparar_docx_fuerte", lambda *_a, **_k: (False, "sin word"), raising=False)

    repaired = app_module._reparar_docx_bytes(data, "cov19_bytes")
    assert repaired and repaired.startswith(b"PK")

    ensured = app_module._asegurar_docx_bytes_valido_como_grupo(data, "cov19_ok")
    assert ensured and ensured.startswith(b"PK")

    try:
        app_module._asegurar_docx_bytes_valido_como_grupo(b"no zip", "cov19_bad")
        assert False, "Debió fallar con bytes inválidos"
    except RuntimeError as e:
        assert "inválido" in str(e).lower() or "invalido" in str(e).lower()


def test_docx_requiere_resave_y_reparar_generado_con_warnings(app_module, tmp_path, monkeypatch):
    simple = _make_docx(tmp_path / "simple.docx")
    assert app_module._docx_requiere_resave_para_matriz("Trigonometría", str(simple)) is True
    assert app_module._docx_requiere_resave_para_matriz("Álgebra", str(simple)) is False

    complejo = _make_docx(tmp_path / "complejo.docx")
    xml = f'''<w:document xmlns:w="{NS_W}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><w:body>
    <w:p><w:r><w:drawing/></w:r></w:p><w:sectPr/></w:body></w:document>'''
    _rewrite_docx(complejo, {"word/document.xml": xml})
    assert app_module._docx_requiere_resave_para_matriz("Álgebra", str(complejo)) is True

    bad_path = tmp_path / "no_existe.docx"
    assert app_module._docx_requiere_resave_para_matriz("Álgebra", str(bad_path)) is False

    # Cubre ramas de avisos internos sin romper la validación final.
    valid = _make_docx(tmp_path / "repair.docx")
    monkeypatch.setattr(app_module, "_post_merge_fix_numbering", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("num bad")), raising=False)
    monkeypatch.setattr(app_module, "bullets_to_numbers_docx", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("bullet bad")), raising=False)
    monkeypatch.setattr(app_module, "reparar_docx_fuerte", lambda *_a, **_k: (False, "word bad"), raising=False)
    monkeypatch.setattr(app_module, "reparar_docx_inplace", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("inplace bad")), raising=False)
    app_module._reparar_docx_generado(str(valid))

# backend/matriz_utils.py
import os
import zipfile
import tempfile
import shutil
import xml.etree.ElementTree as ET

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _get_numid_and_ilvl(p):
    pPr = p.find(f"{W_NS}pPr")
    if pPr is None:
        return None, None
    numPr = pPr.find(f"{W_NS}numPr")
    if numPr is None:
        return None, None

    ilvl_el = numPr.find(f"{W_NS}ilvl")
    numId_el = numPr.find(f"{W_NS}numId")

    ilvl = ilvl_el.get(f"{W_NS}val") if ilvl_el is not None else None
    numId = numId_el.get(f"{W_NS}val") if numId_el is not None else None
    return numId, ilvl


def _build_num_fmt_map(numbering_xml_path: str):
    """
    Devuelve dict: (numId, ilvl) -> numFmt
    """
    if not os.path.exists(numbering_xml_path):
        return {}

    tree_num = ET.parse(numbering_xml_path)
    root_num = tree_num.getroot()

    # numId -> abstractNumId
    numid_to_abs = {}
    for num in root_num.findall(f"{W_NS}num"):
        numId = num.get(f"{W_NS}numId")
        abs_el = num.find(f"{W_NS}abstractNumId")
        absId = abs_el.get(f"{W_NS}val") if abs_el is not None else None
        if numId and absId:
            numid_to_abs[numId] = absId

    # Construir (numId, ilvl) -> numFmt, usando abstractNum correspondiente
    num_fmt_map = {}
    for absnum in root_num.findall(f"{W_NS}abstractNum"):
        abs_id_this = absnum.get(f"{W_NS}abstractNumId")
        if not abs_id_this:
            continue

        for lvl in absnum.findall(f"{W_NS}lvl"):
            ilvl = lvl.get(f"{W_NS}ilvl")
            fmt_el = lvl.find(f"{W_NS}numFmt")
            fmt = fmt_el.get(f"{W_NS}val") if fmt_el is not None else None
            if ilvl is None or fmt is None:
                continue

            for numId, absId in numid_to_abs.items():
                if absId == abs_id_this:
                    num_fmt_map[(numId, ilvl)] = fmt

    return num_fmt_map


def _find_question_spans(document_xml_path: str, numbering_xml_path: str):
    """
    Retorna spans [(start_idx, end_idx), ...] por cada pregunta detectada.
    La pregunta inicia cuando numFmt=='decimal' e ilvl=='0'.
    """
    num_fmt_map = _build_num_fmt_map(numbering_xml_path)

    tree_doc = ET.parse(document_xml_path)
    root_doc = tree_doc.getroot()
    all_p = root_doc.findall(f".//{W_NS}p")

    starts = []
    for idx, p in enumerate(all_p):
        numId, ilvl = _get_numid_and_ilvl(p)
        if not numId or ilvl is None:
            continue
        numFmt = num_fmt_map.get((numId, ilvl))
        if numFmt == "decimal" and ilvl == "0":
            starts.append(idx)

    if not starts:
        return []

    spans = []
    for i, s in enumerate(starts):
        e = starts[i + 1] if i + 1 < len(starts) else len(all_p)
        spans.append((s, e))
    return spans


def _write_docx_from_dir(src_dir: str, out_docx: str):
    with zipfile.ZipFile(out_docx, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(src_dir):
            for fn in files:
                full = os.path.join(root, fn)
                rel = os.path.relpath(full, src_dir).replace("\\", "/")
                z.write(full, rel)


def _contar_preguntas_docx(docx_path: str) -> int:
    """
    Cuenta preguntas en un DOCX detectando inicio de pregunta por:
    numFmt='decimal' e ilvl='0'
    """
    with tempfile.TemporaryDirectory() as td:
        with zipfile.ZipFile(docx_path, "r") as z:
            z.extractall(td)

        doc_xml = os.path.join(td, "word", "document.xml")
        num_xml = os.path.join(td, "word", "numbering.xml")

        if not os.path.exists(doc_xml):
            return 0

        num_fmt_map = _build_num_fmt_map(num_xml)

        tree_doc = ET.parse(doc_xml)
        root_doc = tree_doc.getroot()
        all_p = root_doc.findall(f".//{W_NS}p")

        count = 0
        for p in all_p:
            numId, ilvl = _get_numid_and_ilvl(p)
            if not numId or ilvl is None:
                continue
            numFmt = num_fmt_map.get((numId, ilvl))
            if numFmt == "decimal" and ilvl == "0":
                count += 1
        return count


def _cut_docx_first_n_questions(src_docx: str, n: int, out_docx: str):
    """
    Crea un DOCX con solo las primeras n preguntas del src.
    Si no detecta preguntas, copia el original.
    (Versión testable: no requiere python-docx)
    """
    with tempfile.TemporaryDirectory() as td:
        with zipfile.ZipFile(src_docx, "r") as z:
            z.extractall(td)

        doc_xml = os.path.join(td, "word", "document.xml")
        num_xml = os.path.join(td, "word", "numbering.xml")

        spans = _find_question_spans(doc_xml, num_xml)
        if not spans:
            shutil.copyfile(src_docx, out_docx)
            return

        # limitar a primeras n preguntas
        if n < 0:
            n = 0
        spans = spans[:n]

        tree_doc = ET.parse(doc_xml)
        root_doc = tree_doc.getroot()
        all_p = root_doc.findall(f".//{W_NS}p")

        keep = set()
        for s, e in spans:
            keep.update(range(s, e))

        # eliminar párrafos que no están en "keep"
        for idx in reversed(range(len(all_p))):
            if idx not in keep:
                parent = all_p[idx].getparent() if hasattr(all_p[idx], "getparent") else None
                # ElementTree estándar no tiene getparent; removemos desde el body
                # Buscamos el w:body y removemos el elemento ahí.
                # (En Word, los w:p cuelgan de w:body)
                body = root_doc.find(f".//{W_NS}body")
                if body is not None and all_p[idx] in list(body):
                    body.remove(all_p[idx])

        tree_doc.write(doc_xml, encoding="utf-8", xml_declaration=True)
        _write_docx_from_dir(td, out_docx)

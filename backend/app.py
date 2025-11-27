# backend/app.py — Corrección con LanguageTool + Vista PDF (render Word) en UTF-8
from flask import Flask, request, jsonify, send_file, send_from_directory, after_this_request
from db import get_connection
import os, tempfile, time, re, difflib, datetime as dt, hashlib
import subprocess, socket, requests, traceback, shutil, json
from flask_cors import CORS, cross_origin

import win32com.client as win32
import pythoncom

from werkzeug.utils import secure_filename
from docx import Document
from pypdf import PdfReader
from shutil import copy2

from docx.oxml import OxmlElement
from docx.oxml.ns import qn

import unicodedata
import re as _re

from difflib import SequenceMatcher
from copy import deepcopy
from docx.enum.text import WD_COLOR_INDEX  # fallback para highlight

# =============== MODO DE CORRECCIÓN ===============
# True  -> comportamiento clásico (como tu código antiguo, corrige "igual de bien")
# False -> heurísticas anti-falsos positivos (tu código nuevo)
USE_CLASSIC_LT = True

# --- Utilidades y constantes ---
TOKEN_RX = re.compile(r'(\s+|[^\wÁÉÍÓÚáéíóúÑñ]+)', flags=re.UNICODE)

# Marcas para preview
MARK_WORD_DELETE  = '---'
MARK_SPACE_DELETE = '--'

# ====== CONFIG GENERAL ======
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
DATA_DIR       = os.path.join(BASE_DIR, "data")
UPLOAD_DIR     = os.path.join(BASE_DIR, "uploads")
DESCARGAS_DIR  = os.path.join(BASE_DIR, "descargas")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DESCARGAS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024
app.config["UPLOAD_FOLDER"]      = UPLOAD_DIR
app.config["DESCARGAS_FOLDER"]   = DESCARGAS_DIR

# ====== Languagetool ======
LT_PORT = int(os.environ.get("LT_PORT", "8010"))

def _java_cmd():
    emb = os.path.join(BASE_DIR, "jre", "bin", "java.exe" if os.name=="nt" else "java")
    return emb if os.path.exists(emb) else "java"

LT_DIR = os.environ.get("LT_DIR", "").strip() or None
_LT_CANDIDATES = [
    os.path.join(BASE_DIR, "libs", "LanguageTool"),
    os.path.join(BASE_DIR, "LanguageTool"),
    os.path.join(BASE_DIR, "languagetool"),
    os.path.join(BASE_DIR, "languagetools"),
    BASE_DIR,
]

def _resolve_lt_dir() -> str:
    forced = os.environ.get("LT_DIR", "").strip()
    if forced and os.path.isdir(forced):
        for r, _d, files in os.walk(forced):
            for f in files:
                name = f.lower()
                if name.endswith("server.jar") and "languagetool" in name:
                    print("[LT] LT_DIR (env) ->", r); return r
    for root in _LT_CANDIDATES:
        if os.path.isdir(root):
            for r, _d, files in os.walk(root):
                for f in files:
                    name = f.lower()
                    if name.endswith("server.jar") and "languagetool" in name:
                        print("[LT] LT_DIR detectado ->", r); return r
    raise RuntimeError("No se encontró LanguageTool (server.jar).")

def _find_lt_jar() -> str:
    if not LT_DIR or not os.path.isdir(LT_DIR):
        raise RuntimeError(f"No se encontró la carpeta LanguageTool: {LT_DIR}")
    for r, _d, files in os.walk(LT_DIR):
        for f in files:
            name = f.lower()
            if name.endswith("server.jar") and "languagetool" in name:
                return os.path.join(r, f)
    raise RuntimeError(f"No se encontró el jar del servidor dentro de: {LT_DIR}")

def lt_is_running(host="127.0.0.1", port=LT_PORT) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.25)
        try:
            s.connect((host, port)); return True
        except Exception:
            return False

def _detect_ngrams_dir() -> str | None:
    forced = os.environ.get("NGRAMS_DIR", "").strip()
    if forced and os.path.isdir(forced):
        if os.path.isdir(os.path.join(forced, "1grams")) and os.path.isdir(os.path.join(forced, "2grams")):
            print("[LT] NGRAMS_DIR (env) ->", forced); return forced
    candidates = []
    if LT_DIR:
        candidates += [os.path.join(LT_DIR, "ngrams", "es"), os.path.join(LT_DIR, "ngrams")]
        parent = os.path.dirname(LT_DIR)
        candidates += [os.path.join(parent, "languagetools", "ngrams", "es"),
                       os.path.join(parent, "languagetools", "ngrams")]
    candidates += [
        os.path.join(BASE_DIR, "ngrams", "es"),
        os.path.join(BASE_DIR, "ngrams"),
        os.path.join(BASE_DIR, "languagetools", "ngrams", "es"),
        os.path.join(BASE_DIR, "languagetools", "ngrams"),
    ]
    for c in candidates:
        if os.path.isdir(os.path.join(c, "1grams")) and os.path.isdir(os.path.join(c, "2grams")):
            print("[LT] NGRAMS detectado ->", c); return c
    print("[LT] NGRAMS no detectado (se intentará iniciar sin languageModel)")
    return None

_LT_PROC = None
def _spawn_lt(args):
    creationflags = 0x08000000 if os.name == "nt" else 0
    return subprocess.Popen(args, cwd=LT_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
                            creationflags=creationflags)

def lt_start_server():
    global _LT_PROC, LT_DIR
    if lt_is_running(): return
    if not LT_DIR: LT_DIR = _resolve_lt_dir()
    lt_jar = _find_lt_jar(); java = _java_cmd()
    base_args = [java, "-Xms256m", "-Xmx2048m", "-jar", lt_jar, "-p", str(LT_PORT)]
    custom_rules = os.path.join(BASE_DIR, "libs", "LanguageTool", "custom-rules-es.xml")
    if os.path.isfile(custom_rules): base_args += ["--rules", custom_rules]
    ngrams_dir = _detect_ngrams_dir()
    try_args = [base_args + (["--languageModel", ngrams_dir] if ngrams_dir else []), base_args]
    for args in try_args:
        print("[LT] cmd:", " ".join(args))
        try:
            _LT_PROC = _spawn_lt(args)
            for _ in range(100):
                if lt_is_running():
                    print("[LT] Servidor iniciado en", LT_PORT); return
                time.sleep(0.1)
        except Exception as e:
            print("[LT] Error al iniciar:", e)
    raise RuntimeError("No se pudo iniciar LanguageTool local.")

# ============ Helpers de resaltado anaranjado ============
def _shade_run_orange_exact(run):
    rPr = run._r.get_or_add_rPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), 'FFA500')  # naranja
    for old in rPr.findall(qn('w:shd')):
        rPr.remove(old)
    rPr.append(shd)
    try:
        run.font.highlight_color = WD_COLOR_INDEX.NONE
    except Exception:
        pass

def contiene_omml(run):
    r = run._r
    if r.xpath('.//m:oMath | .//m:oMathPara'):
        return True
    if r.xpath('.//w:drawing | .//w:pict | .//w:object | .//w:fldChar'):
        return True
    return False

def _split_run_keep_style(paragraph, run_idx, cut_pos):
    run = paragraph.runs[run_idx]
    txt = run.text or ""
    if cut_pos <= 0 or cut_pos >= len(txt):
        return run_idx
    left_txt, right_txt = txt[:cut_pos], txt[cut_pos:]
    new_r = deepcopy(run._r)
    run._r.addnext(new_r)
    from docx.text.run import Run
    right_run = Run(new_r, run._parent)
    run.text = left_txt
    right_run.text = right_txt
    return run_idx + 1

def _char_index_map(paragraph):
    index_map = []
    for i, r in enumerate(paragraph.runs):
        if contiene_omml(r): continue
        t = r.text or ""
        for k in range(len(t)):
            index_map.append((i, k))
    return index_map

def _highlight_range_by_char(paragraph, start_char, end_char):
    if start_char >= end_char: return
    index_map = _char_index_map(paragraph)
    n = len(index_map)
    if n == 0: return
    start_char = max(0, min(start_char, n))
    end_char   = max(0, min(end_char,   n))
    if start_char >= end_char: return

    start_run, start_off = index_map[start_char]
    end_run,   end_off   = index_map[end_char - 1]

    if start_off < len(paragraph.runs[start_run].text or ""):
        start_run = _split_run_keep_style(paragraph, start_run, start_off)

    index_map = _char_index_map(paragraph)
    end_char = max(0, min(end_char, len(index_map)))
    end_run, end_off = index_map[end_char - 1]
    end_txt_len = len(paragraph.runs[end_run].text or "")
    cut_pos = end_off + 1
    if cut_pos < end_txt_len:
        _ = _split_run_keep_style(paragraph, end_run, cut_pos)

    index_map = _char_index_map(paragraph)
    s_run = index_map[start_char][0]
    e_run = index_map[end_char - 1][0]

    for i in range(s_run, e_run + 1):
        r = paragraph.runs[i]
        if not contiene_omml(r) and (r.text or ""):
            _shade_run_orange_exact(r)

# --- Ayudas para decidir agrupación ---
_WORD_RE = re.compile(r'[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]')

def _is_word_char(ch: str) -> bool:
    return bool(_WORD_RE.match(ch))

def _is_single_word(s: str) -> bool:
    s = s.strip()
    if not s: return False
    if re.search(r'\s', s): return False
    return all(_is_word_char(c) for c in s)

def _is_two_or_more_words(s: str) -> bool:
    s = s.strip()
    if not s: return False
    if re.search(r'[^\wÁÉÍÓÚÜÑáéíóúüñ\s]', s):  # signos -> no agrupar
        return False
    tokens = [t for t in re.split(r'\s+', s) if t]
    if len(tokens) < 2: return False
    return all(all(_is_word_char(c) for c in t) for t in tokens)

def _highlight_tokens_in_range(paragraph, base_start, frag):
    if not frag: return
    visible = "".join(r.text or "" for r in paragraph.runs if not contiene_omml(r))
    start_global = base_start
    end_global   = base_start + len(frag)
    n_visible    = len(visible)
    if start_global < 0: start_global = 0
    if end_global   > n_visible: end_global = n_visible
    if start_global >= end_global: return
    frag_has_word = any(_is_word_char(c) for c in frag)
    if not frag_has_word:
        _highlight_range_by_char(paragraph, start_global, end_global)
        return
    def is_word_char_local(ch: str) -> bool:
        return _is_word_char(ch)
    for m in re.finditer(r'\S+', frag, flags=re.UNICODE):
        a_loc, b_loc = m.span()
        a = start_global + a_loc
        b = start_global + b_loc
        L = a
        R = b
        while L > 0 and is_word_char_local(visible[L - 1]): L -= 1
        while R < n_visible and is_word_char_local(visible[R]): R += 1
        if L < R:
            _highlight_range_by_char(paragraph, L, R)

def _highlight_replacement_smart(paragraph, base_start, oldfrag, newfrag):
    if oldfrag and _is_single_word(oldfrag) and _is_two_or_more_words(newfrag):
        _highlight_range_by_char(paragraph, base_start, base_start + len(newfrag))
    else:
        _highlight_tokens_in_range(paragraph, base_start, newfrag)

# ================================================================
def insertar_marcas_eliminacion(texto_original: str, texto_corregido: str) -> str:
    orig_toks = tokenize_preservando(texto_original)
    corr_toks = tokenize_preservando(texto_corregido)
    def _is_space(tok: str) -> bool: return bool(tok and tok.isspace())
    def _is_word(tok: str) -> bool:  return es_token_palabra(tok) and not _is_space(tok)
    salida: list[str] = []
    pending_space_after_marker = False
    def _append_token(tok: str, out: list[str]):
        nonlocal pending_space_after_marker
        if pending_space_after_marker:
            if not _is_space(tok): out.append(" ")
            pending_space_after_marker = False
        out.append(tok)
    def _emit_marker_for_deleted(deleted_tokens: list[str], out: list[str]) -> bool:
        nonlocal pending_space_after_marker
        has_word  = any(_is_word(t) for t in deleted_tokens)
        has_space = any(_is_space(t) for t in deleted_tokens)
        if has_word:
            if not out or not _is_space(out[-1]): out.append(" ")
            out.append(MARK_WORD_DELETE); pending_space_after_marker = True; return True
        elif has_space:
            if not out or out[-1] != MARK_SPACE_DELETE: out.append(MARK_SPACE_DELETE)
        return False
    sm = SequenceMatcher(a=orig_toks, b=corr_toks, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag in ("equal", "insert"):
            for tok in corr_toks[j1:j2]: _append_token(tok, salida)
        elif tag == "delete":
            _emit_marker_for_deleted(orig_toks[i1:i2], salida)
        elif tag == "replace":
            seg_o = orig_toks[i1:i2]; seg_c = corr_toks[j1:j2]
            tmp_out: list[str] = []
            inner = SequenceMatcher(a=seg_o, b=seg_c, autojunk=False)
            emitted_delete = False
            for t2, a1, a2, b1, b2 in inner.get_opcodes():
                if t2 in ("equal", "insert", "replace"):
                    for tok in seg_c[b1:b2]: _append_token(tok, tmp_out)
                if t2 == "delete":
                    if _emit_marker_for_deleted(seg_o[a1:a2], tmp_out): emitted_delete = True
            if not emitted_delete:
                words_o = sum(1 for t in seg_o if es_token_palabra(t) and not t.isspace())
                words_c = sum(1 for t in seg_c if es_token_palabra(t) and not t.isspace())
                if words_o > words_c:
                    left_idx = 0
                    while left_idx < len(tmp_out) and (tmp_out[left_idx].isspace() if tmp_out[left_idx] else False): left_idx += 1
                    while left_idx < len(tmp_out) and not (tmp_out[left_idx].isspace() if tmp_out[left_idx] else False): left_idx += 1
                    while left_idx < len(tmp_out) and (tmp_out[left_idx].isspace() if tmp_out[left_idx] else False): left_idx += 1
                    if left_idx == 0 or not (tmp_out[left_idx-1].isspace() if tmp_out[left_idx-1] else False):
                        tmp_out.insert(left_idx, " "); left_idx += 1
                    tmp_out.insert(left_idx, MARK_WORD_DELETE); left_idx += 1
                    if left_idx >= len(tmp_out) or not (tmp_out[left_idx].isspace() if tmp_out[left_idx] else False):
                        tmp_out.insert(left_idx, " ")
            for tok in tmp_out: _append_token(tok, salida)
    return "".join(salida)

# --- Sesión HTTP reutilizable para LT
LT_HTTP = requests.Session()
try:
    from requests.adapters import HTTPAdapter
    LT_HTTP.mount("http://", HTTPAdapter(pool_connections=4, pool_maxsize=4, max_retries=1))
except Exception:
    pass

LT_SOFT_CHUNK = 20000

def _lt_request(texto: str, lang: str, use_picky=True, use_variant=True) -> dict:
    if not lt_is_running(): lt_start_server()
    url = f"http://127.0.0.1:{LT_PORT}/v2/check"
    data = {"text": texto, "language": lang}
    if use_picky:   data["level"] = "picky"
    if use_variant: data["preferredVariants"] = "es-ES"
    try:
        resp = LT_HTTP.post(url, data=data, timeout=120)
    except requests.exceptions.ConnectionError:
        lt_start_server(); resp = LT_HTTP.post(url, data=data, timeout=120)
    if resp.status_code == 400: return {"_status": 400, "_body": resp.text}
    resp.raise_for_status(); out = resp.json(); out["_status"] = resp.status_code; return out

def lt_check_smart(texto: str, lang="es"):
    r1 = _lt_request(texto, lang, use_picky=True, use_variant=True)
    if r1.get("_status") != 400: return r1
    too_long = ("too long" in (r1.get("_body","")).lower()) or (len(texto) > LT_SOFT_CHUNK*1.2)
    r2 = _lt_request(texto, lang, use_picky=False, use_variant=False)
    if r2.get("_status") != 400 and not too_long: return r2
    matches_all = []; offset_base = 0; n = len(texto); start = 0
    while start < n:
        end = min(start + LT_SOFT_CHUNK, n)
        cut = texto.rfind("\n\n", start, end)
        if cut == -1 or cut <= start + 1000: cut = end
        chunk = texto[start:cut]
        r = _lt_request(chunk, lang, use_picky=False, use_variant=False)
        if r.get("_status") == 400:
            r = _lt_request(chunk, lang, use_picky=False, use_variant=True)
            if r.get("_status") == 400:
                raise RuntimeError(f"LT 400 en chunk {start}: {r.get('_body','')}")
        for m in r.get("matches", []):
            m2 = dict(m); m2["offset"] = m.get("offset", 0) + offset_base; matches_all.append(m2)
        offset_base += len(chunk); start = cut
    return {"matches": matches_all}

# ===== util doc/pdf =====
def extraer_texto_docx(path: str) -> str:
    doc = Document(path)
    return "\n".join(p.text for p in doc.paragraphs)

def extraer_texto_pdf(path: str) -> str:
    reader = PdfReader(path)
    return "\n".join((page.extract_text() or "") for page in reader.pages)

def crear_docx_desde_texto(texto: str) -> Document:
    doc = Document()
    for linea in texto.split("\n"):
        doc.add_paragraph(linea)
    return doc

def generar_diff_html(original: str, corregido: str) -> str:
    diff  = difflib.HtmlDiff(wrapcolumn=90)
    tabla = diff.make_table(original.splitlines(), corregido.splitlines(),
                            "Original", "Corregido", context=True, numlines=2)
    estilo = """
    <style>
      table.diff {font-family:monospace; font-size:13px; border:1px solid #ccc; width:100%}
      .diff_header {background:#f8f9fa} .diff_add {background:#d4edda}
      .diff_chg {background:#fff3cd} .diff_sub {background:#f8d7da}
      td,th {padding:4px 6px; border:1px solid #e9ecef; vertical-align:top}
    </style>"""
    return estilo + tabla

def now_mysql(): return dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def normalize_ocr_noise(t: str) -> str:
    if not t: return t
    t = (t.replace("\u00AD","").replace("\u200B","").replace("\u200C","")
           .replace("\u200D","").replace("\u2060",""))
    t = (t.replace("\u00A0"," ").replace("\u202F"," "))
    t = re.sub(r'[\u2000-\u200A]',' ', t)
    t = re.sub(r'(\w)-\n(\w)', r'\1\2', t)
    t = t.replace("\r\n","\n").replace("\r","\n")
    t = re.sub(r'[ \t]{2,}',' ', t)
    return t

def _strip_accents(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def _same_casing(src: str, dst: str) -> str:
    if src.isupper(): return dst.upper()
    if src.istitle(): return dst[:1].upper() + dst[1:]
    if src.islower(): return dst.lower()
    return dst

def _prev_token(texto: str, offset: int) -> str:
    izq = texto[:offset]
    m = _re.search(r'([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)\s*$', izq)
    return m.group(1) if m else ""

def _choose_best_suggestion(original: str, suggestions: list, prev: str) -> str | None:
    cand = [s.get("value","") for s in suggestions if s.get("value")]
    if not cand: return None
    base = _strip_accents(original.lower())
    solo_acento = [c for c in cand if _strip_accents(c.lower()) == base and c != original]
    if solo_acento: return solo_acento[0]
    prev_l = prev.lower()
    if prev.istitle() or prev_l in {"el","él","ella"}:
        pref_3a = [c for c in cand if c.endswith(("ó","a")) and not c.endswith("é")]
        if pref_3a: return pref_3a[0]
    same_len = [c for c in cand if len(c) == len(original)]
    if same_len: return same_len[0]
    return cand[0]

_MATH_VARS_1L = {"n","x","y","z","m","k","i","j","t"}

# ====== NUEVO: Detector de siglas en MAYÚSCULAS ======
_ACRONYM_LETTERS_RX = re.compile(r'^[A-ZÁÉÍÓÚÜÑ]{2,12}$')
def is_upper_acronym(token: str) -> bool:
    if not token: return False
    t = token.strip()
    if t.startswith("(") and t.endswith(")"): t = t[1:-1].strip()
    t = (t.replace(".", "").replace("-", "").replace("–", "").replace("—", "").replace("/", ""))
    if len(t) < 2 or len(t) > 12 or not t.isalpha(): return False
    return bool(_ACRONYM_LETTERS_RX.fullmatch(t))

# ====== NUEVO: No tocar números / dígitos (incluye superíndices) ======
_SUPERSCRIPT_DIGITS = set("⁰¹²³⁴⁵⁶⁷⁸⁹")
def _has_any_digit(s: str) -> bool:
    return any(ch.isdigit() or ch in _SUPERSCRIPT_DIGITS for ch in s or "")

# ====== NUEVO: filtro de “parecido razonable” ======
def _edit_distance(a: str, b: str) -> int:
    la, lb = len(a), len(b)
    if la == 0: return lb
    if lb == 0: return la
    prev = list(range(lb + 1))
    cur = [0] * (lb + 1)
    for i, ca in enumerate(a, 1):
        cur[0] = i
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            cur[j] = min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + cost)
        prev, cur = cur, prev
    return prev[-1]

def _looks_reasonable_replacement(src: str, dst: str) -> bool:
    if not src or not dst: return False
    if _strip_accents(src.lower()) == _strip_accents(dst.lower()) and src != dst:
        return True
    a = _strip_accents(src.lower())
    b = _strip_accents(dst.lower())
    if len(a) <= 3 or len(b) <= 3:
        return SequenceMatcher(None, a, b).ratio() >= 0.60
    sim = SequenceMatcher(None, a, b).ratio()
    ed  = _edit_distance(a, b)
    if sim < 0.80: return False
    max_ed = max(2, min(len(a), len(b)) // 4)
    if ed > max_ed: return False
    return True

# ====== NUEVO: spans de alternativas y utilidades ======
_RX_ALTERNATIVA = re.compile(r'^\s*[A-E]\)\s')  # PATRÓN pedido: Letra mayúscula A–E + ") " al inicio de línea

def detectar_spans_alternativas(texto: str):
    """Devuelve lista de (ini, fin) por cada línea que sea alternativa tipo 'A) '."""
    spans = []
    pos = 0
    for linea in texto.split("\n"):
        L = len(linea)
        if _RX_ALTERNATIVA.match(linea):
            spans.append((pos, pos + L))  # proteger toda la línea (sin el \n)
        pos += L + 1  # +1 por el salto de línea
    return spans

def intersecta_spans(o: int, ln: int, spans):
    """True si el rango [o, o+ln) toca algún (a,b) en spans."""
    if not spans or ln <= 0: return False
    r0, r1 = o, o + ln
    for a, b in spans:
        if not (r1 <= a or r0 >= b):
            return True
    return False

def restaurar_segmentos_protegidos(original: str, corregido: str, spans):
    """Copia desde 'original' los segmentos protegidos a 'corregido' (mismas posiciones)."""
    if not spans: return corregido
    out = []
    last = 0
    for a, b in sorted(spans):
        out.append(corregido[last:a])
        out.append(original[a:b])  # restaurar exactamente
        last = b
    out.append(corregido[last:])
    return "".join(out)

def apply_lt_corrections_smart(texto: str, matches: list, protected_spans=None) -> str:
    out = texto
    for m in sorted(matches, key=lambda x: x.get("offset",0), reverse=True):
        o = m.get("offset",0); ln = m.get("length",0)
        reps = m.get("replacements",[])
        if ln <= 0 or not reps: continue

        # NO tocar si cae en alternativa protegida
        if intersecta_spans(o, ln, protected_spans): 
            continue

        frag = out[o:o+ln]
        if len(frag) == 1 and frag.lower() in _MATH_VARS_1L: continue
        if _has_any_digit(frag): continue
        if is_upper_acronym(frag): continue
        prev = _prev_token(out, o)
        best = _choose_best_suggestion(frag, reps, prev)
        if best is None: continue
        if not _looks_reasonable_replacement(frag, best): continue
        best = _same_casing(frag, best)
        out = out[:o] + best + out[o+ln:]
    return out

# ===== PARCHE: modo clásico también ignora dígitos/siglas y exige parecido razonable
def apply_lt_corrections_classic(texto: str, matches: list, protected_spans=None) -> str:
    out = texto
    for m in sorted(matches, key=lambda x: x.get("offset",0), reverse=True):
        o = m.get("offset",0); ln = m.get("length",0)
        reps = m.get("replacements",[])
        if ln <= 0 or not reps:
            continue

        # NO tocar si cae en alternativa protegida
        if intersecta_spans(o, ln, protected_spans): 
            continue

        frag = out[o:o+ln]

        # Filtros de seguridad (mismos que smart)
        if len(frag) == 1 and frag.lower() in _MATH_VARS_1L:
            continue
        if _has_any_digit(frag):      # jamás tocar secuencias con dígitos
            continue
        if is_upper_acronym(frag):    # ni siglas mayúsculas
            continue

        prev = _prev_token(out, o)
        best = _choose_best_suggestion(frag, reps, prev)
        if best is None:
            continue

        if not _looks_reasonable_replacement(frag, best):
            continue

        best = _same_casing(frag, best)
        out = out[:o] + best + out[o+ln:]
    return out

def apply_lt_corrections(texto: str, matches: list, protected_spans=None) -> str:
    if USE_CLASSIC_LT:
        return apply_lt_corrections_classic(texto, matches, protected_spans=protected_spans)
    else:
        return apply_lt_corrections_smart(texto, matches, protected_spans=protected_spans)

# ====== REGLAS POST ======
POST_RULES = [
    (r'(?:(?<=^)|(?<=[\.\?\!]\s))((?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+|Él|El|Élla|Ella))\s+llegue\b', r'\1 llegó'),
    (r'\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+|Él|El|Élla|Ella)\s+llegue\b', r'\1 llegó'),
    (r'\bnumeros\b', 'números'),
    (r'\b(solo|sólo)\s+velos\b', r'\1 ve los'),
    (r'\benter(?:\s|[\u00AD\u200B\u200C\u200D\u2060])?s\b', 'enteros'),
]

def load_agreement_config():
    default = {
        "masc_nouns": ["número","vector","conjunto","ángulo","polígono","intervalo","resultado","valor","punto"],
        "fem_nouns":  ["fracción","suma","resta","potencia","matriz","media","mediana","varianza","raíz","medida"],
        "adjectives": ["entero","real","natural","primo","compuesto","racional","irracional",
                       "positivo","negativo","par","impar","mínimo","máximo","mayor","menor"]
    }
    path = os.path.join(DATA_DIR, "agreement_es.json")
    if os.path.isfile(path):
        try:
            with open(path,"r",encoding="utf-8") as f:
                cfg = json.load(f)
            for k in ["masc_nouns","fem_nouns","adjectives"]:
                if k not in cfg or not isinstance(cfg[k], list): cfg[k] = default[k]
            return cfg
        except Exception:
            return default
    else:
        try:
            with open(path,"w",encoding="utf-8") as f:
                json.dump(default,f,ensure_ascii=False,indent=2)
        except Exception:
            pass
        return default

_AGR_CFG   = load_agreement_config()
_MASC_NOUNS= set(_AGR_CFG["masc_nouns"])
_FEM_NOUNS = set(_AGR_CFG["fem_nouns"])
_ADJ       = set(_AGR_CFG["adjectives"])

def _agree_adj(noun: str, adj: str) -> str:
    def endcase(src, dst):
        if src.isupper(): return dst.upper()
        if src.istitle(): return dst[:1].upper() + dst[1:]
        return dst
    base = re.sub(r'(o|a|os|as)$', '', adj, flags=re.IGNORECASE)
    is_plural = noun.lower().endswith("s")
    noun_base = noun.lower().rstrip("s")
    if noun_base in _MASC_NOUNS: end = "os" if is_plural else "o"
    elif noun_base in _FEM_NOUNS: end = "as" if is_plural else "a"
    else: return adj
    fixed = base + end
    return endcase(adj, fixed)

def _fix_noun_adj_agreement(texto: str) -> str:
    if not texto: return texto
    def pluralize(w): return w + "s" if not w.endswith("s") else w
    masc = list(_MASC_NOUNS) + [pluralize(w) for w in _MASC_NOUNS]
    fem  = list(_FEM_NOUNS) + [pluralize(w) for w in _FEM_NOUNS]
    nouns_union = "|".join(sorted(set(masc + fem), key=len, reverse=True))
    adjs_union  = "|".join(sorted(_ADJ, key=len, reverse=True))
    patron = rf'\b({nouns_union})\s+(({adjs_union})(?:o|a|os|as)?)\b'
    def repl(m):
        noun = m.group(1); adj = m.group(2)
        base = re.sub(r'(o|a|os|as)$', '', adj, flags=re.IGNORECASE).lower()
        if base not in _ADJ: return m.group(0)
        return f"{noun} {_agree_adj(noun, adj)}"
    return re.sub(patron, repl, texto, flags=re.IGNORECASE)

def _fix_numero_entero_specific(t: str) -> str:
    t = re.sub(r'\bn[úu]mero\s+enter(?:a|as|os)\b', 'número entero', t, flags=re.IGNORECASE)
    t = re.sub(r'\bn[úu]meros\s+enter(?:o|a|as)\b', 'números enteros', t, flags=re.IGNORECASE)
    return t

_MATH_ADJ_NUMERO = {"entero","real","natural","primo","compuesto","racional",
                    "irracional","positivo","negativo","par","impar",
                    "mínimo","máximo","mayor","menor","cuadrado","cúbico"}

def _strip_gender_ending(w: str) -> str:
    wl = w.lower()
    for suf in ("os","as","o","a"):
        if wl.endswith(suf): return w[:-len(suf)]
    return w

def _fix_numero_fallback(texto: str) -> str:
    patron = rf'\b(n[uú]mero(?:s)?)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)\b'
    def repl(m):
        head = m.group(1)
        adj_full = m.group(2)
        lemma = _strip_gender_ending(adj_full).lower()
        if lemma not in _MATH_ADJ_NUMERO and (lemma + "o") not in _MATH_ADJ_NUMERO:
            return m.group(0)
        plural = head.lower().endswith("s")
        base = lemma if lemma in _MATH_ADJ_NUMERO else (lemma + "o")
        base = re.sub(r'enteroo$', 'entero', base)
        nuevo = base + ("os" if plural else "o")
        if adj_full.isupper(): nuevo = nuevo.upper()
        elif adj_full.istitle(): nuevo = nuevo[:1].upper() + nuevo[1:]
        return f"{head} {nuevo}"
    s = re.sub(patron, repl, texto, flags=re.IGNORECASE)
    s = re.sub(r'\benteroo(s)?\b', r'entero\1', s, flags=re.IGNORECASE)
    s = re.sub(r'\benteroos\b', 'enteros', s, flags=re.IGNORECASE)
    return s

# ------------------------
# Reglas de contexto + signos + mayúsculas
# ------------------------
_DIAS = ["lunes","martes","miércoles","jueves","viernes","sábado","domingo"]

def _lowercase_weekdays_mid_sentence(t: str) -> str:
    for d in _DIAS:
        pat = r'(?<!^)(?<![\.!\?\n]\s)'+d.capitalize()
        t = re.sub(pat, d, t)
    return t

def _context_fixes(t: str) -> str:
    if not t: return t
    t = re.sub(r'\b(Hay que)\s+de\s+', r'\1 ', t, flags=re.IGNORECASE)
    t = re.sub(r'(hasta[^.,;\n]*?)\s+avisa\b', r'\1, avisa', t, flags=re.IGNORECASE)
    t = re.sub(r'\bSe me olvidó\s+de\s+', 'Se me olvidó ', t, flags=re.IGNORECASE)
    t = _lowercase_weekdays_mid_sentence(t)
    return t

def _fix_del_contractions(t: str) -> str:
    return re.sub(
        r'\b([Dd])e\s+el\b',
        lambda m: ('D' if m.group(1) == 'D' else 'd') + 'el',
        t
    )

def _same_case_pair(src: str, dst_cap: str, dst_low: str) -> str:
    return dst_cap if src[:1].isupper() else dst_low

def _fix_aver_haber_context(t: str) -> str:
    def repl_haber_trigger(m):
        haber = m.group(1)
        trig  = m.group(2)
        return _same_case_pair(haber, "A ver", "a ver") + " " + trig
    t = re.sub(r'\b(Haber|haber)\s+(si|que|qué)\b', repl_haber_trigger, t)
    def repl_sentence_start(m):
        sep   = m.group(1)
        haber = m.group(2)
        after = m.group(3) or ""
        return f"{sep}{_same_case_pair(haber, 'A ver', 'a ver')}{after}"
    t = re.sub(r'(^|[\.!\?\n]\s)\b(Haber|haber)\b(\s*[,;:])', repl_sentence_start, t)
    return t

def _fix_cuyo_lado_agreement(t: str) -> str:
    def repl(m):
        lados = m.group(1)
        return 'cuyos lados' if lados.lower().endswith('s') else 'cuyo lado'
    t = re.sub(r'(?i)\bcuya(?:s)?\s+(lado|lados)\b', repl, t)
    t = re.sub(r'(?m)^(Cuya|Cuyas)\b', 'Cuyo', t)
    return t

# Prefijo de viñetas/numeración:  –  -  •   o bien  (1)  1)  1.
_BULLET_PREFIX_RX = re.compile(r'^\s*(?:[–\-•]\s*)?(?:\(?\d+[.)]\s*)?')

def _ensure_opening_mark(line: str) -> str:
    s = line
    def _do(close_mark, open_mark):
        nonlocal s
        if open_mark in s or close_mark not in s: return
        m = _BULLET_PREFIX_RX.match(s); pos = m.end() if m else 0
        s = s[:pos] + open_mark + s[pos:]
    _do("?", "¿"); _do("!", "¡")
    s = re.sub(r'\?{2,}\s*$', '?', s); s = re.sub(r'!{2,}\s*$', '!', s)
    m = _BULLET_PREFIX_RX.match(s); pos = m.end() if m else 0
    if s[pos:pos+2] == '¿¿': s = s[:pos] + '¿' + s[pos+2:]
    if s[pos:pos+2] == '¡¡': s = s[:pos] + '¡' + s[pos+2:]
    if '¿' in s and '?' not in s: s = s.rstrip() + '?'
    if '¡' in s and '!' not in s: s = s.rstrip() + '!'
    return s

def _add_opening_spanish_marks(t: str) -> str:
    return "\n".join(_ensure_opening_mark(ln) for ln in (t or "").split("\n"))

_LOWER_START_RX = re.compile(r'(^|(?<=[\.!\?]\s))([a-záéíóúñ])', flags=re.MULTILINE)
_NUM_BULLET_RX  = re.compile(r'^(\s*\d+\)\s*)([a-záéíóúñ])',      flags=re.MULTILINE)

def _capitalize_starts(t: str) -> str:
    t = _LOWER_START_RX.sub(lambda m: m.group(1) + m.group(2).upper(), t)
    t = _NUM_BULLET_RX.sub (lambda m: m.group(1) + m.group(2).upper(), t)
    return t

def post_correcciones(t: str) -> str:
    t = t or ""
    t = normalize_ocr_noise(t)
    for pat, repl in POST_RULES:
        t = re.sub(pat, repl, t, flags=re.IGNORECASE)
    t = _fix_numero_entero_specific(t)
    t = _fix_numero_fallback(t)
    t = _fix_noun_adj_agreement(t)
    t = _context_fixes(t)
    t = _fix_del_contractions(t)
    t = _fix_aver_haber_context(t)
    t = _fix_cuyo_lado_agreement(t)
    t = _add_opening_spanish_marks(t)
    t = _capitalize_starts(t)
    return t

# ====== DOCX → combinar con original preservando estilos (con opción de resaltado)
def tokenize_preservando(texto: str):
    if not texto: return []
    partes = TOKEN_RX.split(texto)
    return [t for t in partes if t is not None and t != ""]

def es_token_palabra(tok: str):
    return not TOKEN_RX.fullmatch(tok)

def reemplazo_en_runs_parciales(paragraph, old_txt: str, new_txt: str):
    if not old_txt: return False
    for run in paragraph.runs:
        if contiene_omml(run): continue
        t = run.text or ""
        idx = t.find(old_txt)
        if idx != -1:
            run.text = t[:idx] + new_txt + t[idx+len(old_txt):]
            return True
    return False

def reemplazo_en_runs_flexible(paragraph, old_txt: str, new_txt: str):
    if not old_txt: return False
    eligible = []
    for run in paragraph.runs:
        eligible.append((run, None if contiene_omml(run) else (run.text if run.text else "")))
    concat = []; index_map = []
    for idx, (run, txt) in enumerate(eligible):
        if txt is None: continue
        for k, ch in enumerate(txt):
            concat.append(ch); index_map.append((idx, k))
    full = "".join(concat); pos = full.find(old_txt)
    if pos == -1: return False
    start = pos; end = pos + len(old_txt)
    if start >= len(index_map) or end > len(index_map): return False
    first_run_idx = index_map[start][0]; last_run_idx  = index_map[end - 1][0]
    for idx in range(first_run_idx, last_run_idx + 1):
        _run, _txt = eligible[idx]
        if _txt is None: return False
    old_block = ""; per_run_text = []
    for idx in range(first_run_idx, last_run_idx + 1):
        _run, _txt = eligible[idx]; per_run_text.append(_txt); old_block += _txt
    acc_before = 0
    for idx in range(first_run_idx):
        _run, _txt = eligible[idx]
        if _txt is not None: acc_before += len(_txt)
    rel_start = start - acc_before; rel_end = rel_start + len(old_txt)
    new_block = old_block[:rel_start] + new_txt + old_block[rel_end:]
    lens = [len(x) for x in per_run_text]; rebuilt = []; cursor = 0
    for k, L in enumerate(lens):
        if k < len(lens) - 1:
            rebuilt.append(new_block[cursor: cursor + L]); cursor += L
        else:
            rebuilt.append(new_block[cursor:])
    for off, idx in enumerate(range(first_run_idx, last_run_idx + 1)):
        run, _txt = eligible[idx]; run.text = rebuilt[off]
    return True

def pares_reemplazo_palabra_a_palabra(texto_original: str, texto_corregido: str):
    orig_toks = tokenize_preservando(texto_original)
    corr_toks = tokenize_preservando(texto_corregido)
    sm = SequenceMatcher(a=orig_toks, b=corr_toks, autojunk=False)
    pares = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "replace":
            seg_o = orig_toks[i1:i2]; seg_c = corr_toks[j1:j2]
            if len(seg_o) == 1 and len(seg_c) == 1 and es_token_palabra(seg_o[0]) and es_token_palabra(seg_c[0]):
                if seg_o[0] != seg_c[0]: pares.append((seg_o[0], seg_c[0]))
            else:
                for so, sc in zip(seg_o, seg_c):
                    if es_token_palabra(so) and es_token_palabra(sc) and so != sc:
                        pares.append((so, sc))
    vistos = set(); dedup = []
    for a, b in pares:
        key = (a, b)
        if key not in vistos:
            dedup.append((a, b)); vistos.add(key)
    return dedup

def similitud_suave(a: str, b: str):
    return SequenceMatcher(None, a, b).ratio()

# ---------- Forzado de bloque “A ver” / “Por favor” ----------
def _force_block_highlight_phrases(paragraph, original_text: str, candidate_text: str):
    orig_l = (original_text or "").lower().replace("\u00ad","")
    cand   = candidate_text or ""
    need_aver  = any(w in orig_l for w in ["haber", "aver", "haver"]) and "a ver" in cand.lower()
    need_porf  = "porfavor" in orig_l and "por favor" in cand.lower()
    if not (need_aver or need_porf): return
    if need_aver:
        for m in re.finditer(r'\b[Aa]\s+ver\b', cand):
            a, b = m.span(); _highlight_range_by_char(paragraph, a, b)
    if need_porf:
        for m in re.finditer(r'\b[Pp]or\s+favor\b', cand):
            a, b = m.span(); _highlight_range_by_char(paragraph, a, b)
# -----------------------------------------------------------------

# ====== generar_docx_corregido (con anti-falsos positivos + highlight opcional) ======
def generar_docx_corregido(path_docx_original: str, texto_corregido: str, path_salida_docx: str,
                           highlight: bool = False, texto_original_para_highlight: str | None = None):
    from docx import Document as _Doc
    import unicodedata as _unic
    def nfc(s: str) -> str: return _unic.normalize("NFC", s or "")
    def simil(a: str, b: str) -> float: return SequenceMatcher(None, a, b).ratio()
    def parrafo_tiene_objetos(p) -> bool:
        r = p._p
        if r.xpath('.//m:oMath | .//m:oMathPara'): return True
        if r.xpath('.//w:drawing | .//w:pict | .//w:object | .//w:fldChar'): return True
        return False
    def _reemplazos_por_diff(original: str, candidato: str):
        rep = []; sm = SequenceMatcher(a=original, b=candidato, autojunk=False)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag != "replace": continue
            old = original[i1:i2]; new = candidato[j1:j2]
            if not old or not new: continue
            if max(len(old), len(new)) > 64: continue
            rep.append((old, new))
        vistos, out = set(), []
        for a, b in rep:
            k = (a, b)
            if k not in vistos: out.append((a, b)); vistos.add(k)
        return out
    def _reemplazo_en_runs_flexible(paragraph, old_txt: str, new_txt: str) -> bool:
        return reemplazo_en_runs_flexible(paragraph, old_txt, new_txt)
    def _reescribir_parrafo_preservando_runs(paragraph, new_text: str):
        runs = paragraph.runs; lens = [len(r.text or "") for r in runs]; total = sum(lens)
        if total == 0:
            for r in runs:
                if not contiene_omml(r): r.text = ""
            return
        cursor = 0
        for i, r in enumerate(runs):
            if contiene_omml(r): continue
            L = lens[i]
            if i < len(runs) - 1:
                r.text = new_text[cursor: cursor + L]; cursor += L
            else:
                r.text = new_text[cursor:]
    def _reemplazo_pequeno_valido(old: str, new: str) -> bool:
        if not old or not new: return False
        ratio_len = len(new) / max(1, len(old))
        if ratio_len < 0.40 or ratio_len > 1.60: return False
        if simil(old, new) < 0.60: return False
        return True

    # ---- Detectores y firmas de alternativas/viñetas ----
    _RX_LETTER_OPT = re.compile(r'^\s*([A-Ea-e])\)\s*')     # A) B) C) ...
    _RX_NUM_BULLET = re.compile(r'^\s*\(?(\d+)[\.)]\s*')    # (1) 1) 1. ...
    _RX_DIGITS     = re.compile(r'\d+')

    def _option_label(line: str) -> tuple[str, str] | None:
        if not line: return None
        m = _RX_LETTER_OPT.match(line)
        if m: return ('LETTER', m.group(1).upper())
        m = _RX_NUM_BULLET.match(line)
        if m: return ('NUM', m.group(1))
        return None

    def _same_option_label(a: str, b: str) -> bool:
        la = _option_label(a); lb = _option_label(b)
        if not la or not lb: return False
        return la == lb

    def _numbers_signature(s: str) -> tuple:
        return tuple(_RX_DIGITS.findall(s or ""))

    def _safe_option_rewrite_ok(original_line: str, candidate_line: str) -> bool:
        """
        Permite reescritura SOLO si:
        - misma etiqueta (ya se filtró),
        - misma firma numérica (mismos números y orden),
        - y similitud alta (>= 0.92).
        """
        if _numbers_signature(original_line) != _numbers_signature(candidate_line):
            return False
        sim = SequenceMatcher(None, original_line, candidate_line).ratio()
        return sim >= 0.92

    doc = _Doc(path_docx_original)
    parrafos_docx = doc.paragraphs
    parrafos_corregidos = [nfc(s) for s in texto_corregido.splitlines()]
    usados = set()

    for i, p in enumerate(parrafos_docx):
        original = p.text or ""; original_nfc = nfc(original)

        # --- Selección de candidato robusta y estable ---
        candidatos = []
        if i < len(parrafos_corregidos): candidatos.append((i, parrafos_corregidos[i]))
        for j in range(max(0, i-2), min(len(parrafos_corregidos), i+3)):
            if j != i: candidatos.append((j, parrafos_corregidos[j]))

        # Si es alternativa/viñeta, exige misma etiqueta y prioriza mismo índice.
        label_orig = _option_label(original_nfc)
        if label_orig:
            candidatos = [(j, c) for (j, c) in candidatos if _same_option_label(original_nfc, c)]
            if not candidatos:
                candidatos = [(i, original_nfc)]  # no tocar
            else:
                mismos_idx = [(j, c) for (j, c) in candidatos if j == i]
                if mismos_idx: candidatos = mismos_idx

        mejor_idx, mejor_score = None, -1.0
        for j, cand in candidatos:
            score = simil(original_nfc, cand) - 0.03 * abs(i - j)
            if score > mejor_score:
                mejor_score, mejor_idx = score, j

        if mejor_idx is None:
            continue

        candidato = parrafos_corregidos[mejor_idx]

        # Umbrales base
        score_crudo = simil(original_nfc, candidato)
        umbral = 0.55 if mejor_idx == i else 0.80
        if score_crudo < umbral:
            usados.add(mejor_idx); continue

        # Si cambió el índice y hay dígitos, no tocar
        if mejor_idx != i and any(ch.isdigit() for ch in original_nfc):
            usados.add(mejor_idx); continue

        # Diferencia de longitud controlada
        max_diff = 0.45 if mejor_idx == i else 0.30
        if len(original_nfc) > 0 and abs(len(candidato) - len(original_nfc)) / max(1, len(original_nfc)) > max_diff:
            usados.add(mejor_idx); continue

        # Reglas estrictas para alternativas/viñetas
        if label_orig:
            # Debe mantener misma firma numérica y ser casi idéntico
            if not _safe_option_rewrite_ok(original_nfc, candidato):
                usados.add(mejor_idx); continue

        tiene_obj = parrafo_tiene_objetos(p)

        if not tiene_obj:
            _reescribir_parrafo_preservando_runs(p, candidato)
            if highlight:
                try:
                    sm  = SequenceMatcher(a=original_nfc, b=candidato, autojunk=False)
                    ops = list(sm.get_opcodes())
                    def _has_old(op): return op[2] > op[1]
                    k = 0
                    while k < len(ops):
                        tag, i1, i2, j1, j2 = ops[k]
                        if k == 0 or ops[k-1][4] != j1:
                            q = k + 1; jL, jR = j1, j2; iL, iR = (i1, i2) if _has_old(ops[k]) else (None, None)
                            while q < len(ops) and ops[q][3] == jR:
                                _, qi1, qi2, qj1, qj2 = ops[q]
                                jR = qj2
                                if qi2 > qi1:
                                    if iL is None: iL, iR = qi1, qi2
                                    else: iL = min(iL, qi1); iR = max(iR, qi2)
                                q += 1
                            oldfrag = original_nfc[iL:iR] if iL is not None else ""
                            newfrag = candidato[jL:jR]
                            if oldfrag and _is_single_word(oldfrag) and _is_two_or_more_words(newfrag):
                                _highlight_range_by_char(p, jL, jR); k = q; continue
                        tag, i1, i2, j1, j2 = ops[k]
                        if tag == "insert":
                            if original_nfc.strip():
                                frag = candidato[j1:j2]; _highlight_tokens_in_range(p, j1, frag)
                        elif tag == "replace":
                            oldfrag = original_nfc[i1:i2]; newfrag = candidato[j1:j2]
                            _highlight_replacement_smart(p, j1, oldfrag, newfrag)
                        k += 1
                    _force_block_highlight_phrases(p, original_nfc, candidato)
                    pat = r'(?:' + re.escape(MARK_WORD_DELETE) + r'|' + re.escape(MARK_SPACE_DELETE) + r')'
                    for m in re.finditer(pat, candidato):
                        a, b = m.span(); _highlight_range_by_char(p, a, b)
                except Exception:
                    pass
        else:
            rep_palabra = pares_reemplazo_palabra_a_palabra(original_nfc, candidato)
            rep_diff    = _reemplazos_por_diff(original_nfc, candidato)
            vistos, reemplazos = set(), []
            for par in rep_palabra + rep_diff:
                if par not in vistos: reemplazos.append(par); vistos.add(par)
            for old, new in reemplazos:
                old_n, new_n = nfc(old), nfc(new)
                if not _reemplazo_pequeno_valido(old_n, new_n): continue
                changed = False
                if reemplazo_en_runs_parciales(p, old_n, new_n): changed = True
                elif _reemplazo_en_runs_flexible(p, old_n, new_n): changed = True
                if highlight and changed:
                    concat = "".join(r.text or "" for r in p.runs if not contiene_omml(r))
                    start = 0
                    while True:
                        pos = concat.find(new_n, start)
                        if pos == -1: break
                        if _is_single_word(old_n) and _is_two_or_more_words(new_n):
                            _highlight_range_by_char(p, pos, pos + len(new_n))
                        else:
                            _highlight_tokens_in_range(p, pos, new_n)
                        start = pos + len(new_n)
            if highlight:
                concat = "".join(r.text or "" for r in p.runs if not contiene_omml(r))
                _force_block_highlight_phrases(p, original_nfc, concat)
                pat = r'(?:' + re.escape(MARK_WORD_DELETE) + r'|' + re.escape(MARK_SPACE_DELETE) + r')'
                for m in re.finditer(pat, concat):
                    a, b = m.span(); _highlight_range_by_char(p, a, b)
        usados.add(mejor_idx)
    doc.save(path_salida_docx)

# ====== HELPERS DESCARGAS / CACHE ======
def _save_into_descargas(src_path: str, target_name: str) -> str:
    os.makedirs(DESCARGAS_DIR, exist_ok=True)
    dst = os.path.join(DESCARGAS_DIR, target_name); copy2(src_path, dst); return dst

def _sha1_file(path: str, block=1024*1024) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        while True:
            b = f.read(block)
            if not b: break
            h.update(b)
    return h.hexdigest()

# ====== Exportar vistas ======
def generar_pdf(ruta_word: str) -> str:
    ruta_word = os.path.abspath(ruta_word)
    tmp = tempfile.NamedTemporaryFile(prefix="ltpdf_", suffix=".pdf", delete=False)
    ruta_pdf = tmp.name; tmp.close()
    wdExportFormatPDF         = 17
    wdExportOptimizeForPrint  = 0
    wdExportAllDocument       = 0
    wdExportDocumentContent   = 0
    wdExportCreateNoBookmarks = 0
    pythoncom.CoInitialize()
    word = win32.DispatchEx("Word.Application"); word.Visible = False; word.DisplayAlerts = 0
    try:
        doc = word.Documents.Open(ruta_word, ReadOnly=True)
        doc.ExportAsFixedFormat(
            OutputFileName=ruta_pdf, ExportFormat=wdExportFormatPDF,
            OpenAfterExport=False, OptimizeFor=wdExportOptimizeForPrint,
            Range=wdExportAllDocument, From=1, To=1, Item=wdExportDocumentContent,
            IncludeDocProps=True, KeepIRM=True, CreateBookmarks=wdExportCreateNoBookmarks,
            DocStructureTags=True, BitmapMissingFonts=True, UseISO19005_1=False
        )
        doc.Close(False)
        for _ in range(20):
            if os.path.exists(ruta_pdf) and os.path.getsize(ruta_pdf) > 0: break
            time.sleep(0.1)
        if not os.path.exists(ruta_pdf) or os.path.getsize(ruta_pdf) == 0:
            raise RuntimeError("Word no generó el PDF (archivo vacío).")
        return ruta_pdf
    finally:
        try: word.Quit()
        except Exception: pass
        pythoncom.CoUninitialize()

# === NUEVO: generar PDF estable para previsualización (original/corregido) ===
def generar_pdf_preview(ruta_docx: str, nombre_base: str | None = None) -> str:
    """
    Genera (o reutiliza) un PDF en DESCARGAS_DIR a partir de un DOCX,
    pensado para previsualización en el navegador (iframe).
    """
    ruta_docx = os.path.abspath(ruta_docx)
    os.makedirs(DESCARGAS_DIR, exist_ok=True)

    # Nombre base estable por contenido
    h = _sha1_file(ruta_docx)[:12]
    base = nombre_base or f"{h}_preview"
    dst_pdf = os.path.join(DESCARGAS_DIR, f"{base}.pdf")

    # Si ya existe y es válido, reutilizar
    if os.path.exists(dst_pdf) and os.path.getsize(dst_pdf) > 0:
        return dst_pdf

    # Generar PDF temporal vía Word y copiar a descargas
    tmp_pdf = generar_pdf(ruta_docx)
    copy2(tmp_pdf, dst_pdf)
    try:
        os.remove(tmp_pdf)
    except Exception:
        pass

    return dst_pdf

def _force_utf8_html(html_path: str):
    import re
    try:
        try:
            txt = open(html_path, "r", encoding="utf-8").read()
            decoded_as = "utf-8"
        except UnicodeDecodeError:
            txt = open(html_path, "r", encoding="cp1252", errors="strict").read()
            decoded_as = "cp1252"
        # Normalizar declaración charset a utf-8
        txt = re.sub(r'(?i)charset\s*=\s*["\']?[-\w]+["\']?', 'charset=utf-8', txt, count=1)
        txt = re.sub(r'(?i)<meta\s+charset=["\']?[-\w]+["\']?\s*/?>', '<meta charset="utf-8">', txt, count=1)
        if '<meta' not in txt.lower():
            txt = txt.replace('<head>', '<head><meta charset="utf-8">', 1)
        with open(html_path, "w", encoding="utf-8", newline="") as f: f.write(txt)
        print(f"[HTML] {os.path.basename(html_path)} normalizado a UTF-8 (desde {decoded_as}).")
    except Exception as e:
        print("[HTML] No se pudo forzar UTF-8:", e)

def _postprocess_word_html(html_path: str):
    try:
        with open(html_path, "r", encoding="utf-8", errors="ignore") as f: txt = f.read()
        txt = re.sub(r'<!--\s*\[if\s+gte\s+vml\s+1\s*\]>.*?<!\s*\[endif\]\s*-->', '', txt, flags=re.I | re.S)
        txt = re.sub(r'<!--\s*\[if\s*!vml\s*\]-->', '', txt, flags=re.I)
        txt = re.sub(r'<!--\s*<!\s*\[endif\]\s*-->', '', txt, flags=re.I)
        extra_css = "<style>img{max-width:none!important;height:auto;}body{margin:0;}</style>"
        if "</head>" in txt.lower(): txt = re.sub(r'</head>', extra_css + '</head>', txt, flags=re.I, count=1)
        else: txt = extra_css + txt
        with open(html_path, "w", encoding="utf-8", newline="") as f: f.write(txt)
    except Exception as e:
        print("[HTML] Post-proceso fallido:", e)

def generar_html_desde_docx(ruta_docx: str, nombre_base: str | None = None) -> str:
    wdFormatFilteredHTML = 10; msoEncodingUTF8 = 65001
    ruta_docx = os.path.abspath(ruta_docx)
    h = _sha1_file(ruta_docx)[:12]; base = nombre_base or f"{h}_preview"
    dst_html = os.path.join(DESCARGAS_DIR, f"{base}.htm")
    pythoncom.CoInitialize()
    word = win32.DispatchEx("Word.Application"); word.Visible = False; word.DisplayAlerts = 0
    try:
        doc = word.Documents.Open(ruta_docx, ReadOnly=True)
        try:
            doc.WebOptions.AllowPNG = True; doc.WebOptions.OptimizeForBrowser = True; doc.WebOptions.RelyOnCSS = True
        except Exception: pass
        doc.SaveAs2(FileName=os.path.abspath(dst_html), FileFormat=wdFormatFilteredHTML, Encoding=msoEncodingUTF8)
        doc.Close(False)
    finally:
        try: word.Quit()
        except Exception: pass
        pythoncom.CoUninitialize()
    _force_utf8_html(dst_html); _postprocess_word_html(dst_html); return dst_html

# ====== RUTAS ======
@app.route("/login", methods=["POST"])
@cross_origin()
def login():
    data = request.json; usuario = data["usuario"]; clave = data["clave"]
    conn = get_connection(); cursor = conn.cursor()
    cursor.execute("SELECT * FROM usuarios WHERE username=%s AND password=%s", (usuario, clave))
    user = cursor.fetchone(); cursor.close(); conn.close()
    if user: return jsonify({"status": "ok", "mensaje": "Login correcto"})
    return jsonify({"status": "error", "mensaje": "Credenciales inválidas"}), 401

@app.route("/lt/status")
def lt_status(): return jsonify({"running": lt_is_running(), "dir": LT_DIR})

@app.route("/lt/ensure")
def lt_ensure():
    try:
        lt_start_server()
        return jsonify({"ok": True, "running": lt_is_running(), "dir": LT_DIR, "port": LT_PORT})
    except Exception as e:
        traceback.print_exc(); return jsonify({"ok": False, "error": str(e)}), 500

# Servir archivos de descargas INLINE
@app.route("/descargas/<path:subpath>")
def serve_descargas_inline(subpath):
    return send_from_directory(DESCARGAS_DIR, subpath)

# Descargar binario (docx limpio)
@app.route('/api/descargas/<path:nombre>', methods=['GET'])
def descargar(nombre):
    path = os.path.join(DESCARGAS_DIR, nombre)
    if not os.path.exists(path): return jsonify({"ok": False, "error": "No existe"}), 404
    return send_file(path, as_attachment=True)

@app.route("/api/descargar_pdf_corregido/<path:nombre_docx>", methods=["GET"])
def descargar_pdf_corregido(nombre_docx):
    try:
        docx_path = os.path.join(DESCARGAS_DIR, nombre_docx)
        if not os.path.exists(docx_path): return jsonify({"ok": False, "error": f"No existe DOCX: {nombre_docx}"}), 404
        pdf_tmp = generar_pdf(docx_path)
        base = os.path.splitext(os.path.basename(nombre_docx))[0]
        download_name = f"{base}.pdf"
        @after_this_request
        def _cleanup(response):
            try:
                if os.path.exists(pdf_tmp): os.remove(pdf_tmp)
            except Exception: pass
            return response
        return send_file(pdf_tmp, as_attachment=True, download_name=download_name,
                         mimetype="application/pdf", max_age=0)
    except Exception as e:
        traceback.print_exc(); return jsonify({"ok": False, "error": str(e)}), 500

# === Previsualización del original .docx como PDF (visor del navegador) ===
@app.route("/api/render_vista", methods=["POST"])
def render_vista():
    try:
        if "archivo" not in request.files:
            return jsonify({"ok": False, "error": "Falta 'archivo'"}), 400

        up = request.files["archivo"]
        if not up.filename:
            return jsonify({"ok": False, "error": "Nombre de archivo vacío"}), 400

        filename = secure_filename(up.filename)
        base, ext = os.path.splitext(filename); ext = ext.lower()

        if ext != ".docx":
            return jsonify({"ok": False, "error": "Ahora solo se admite .docx para la vista."}), 400

        # Guardar DOCX original en uploads
        tmp_path = os.path.join(UPLOAD_DIR, filename)
        up.save(tmp_path)

        # Generar PDF de preview a partir del DOCX original
        pdf_path = generar_pdf_preview(
            tmp_path,
            nombre_base=f"{_sha1_file(tmp_path)[:12]}_orig"
        )
        pdf_name = os.path.basename(pdf_path)

        # Mantenemos la clave 'html_url' para compatibilidad con el frontend
        return jsonify({"ok": True, "html_url": f"/descargas/{pdf_name}"})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500

# === Render de DOCX corregido (ahora como PDF para preview) ===
@app.route("/api/render_docx_guardado/<path:nombre_docx>")
def render_docx_guardado(nombre_docx):
    # Si piden el limpio, intentamos mostrar el de PREVIEW con resaltados
    if nombre_docx.endswith("_corregido_limpio.docx"):
        candidato_preview = nombre_docx.replace("_corregido_limpio.docx", "_corregido.docx")
        preview_path = os.path.join(DESCARGAS_DIR, candidato_preview)
        if os.path.exists(preview_path):
            nombre_docx = candidato_preview

    docx_path = os.path.join(DESCARGAS_DIR, nombre_docx)
    if not os.path.exists(docx_path): return jsonify({"ok": False, "error": "No existe DOCX"}), 404
    try:
        base_in = os.path.splitext(nombre_docx)[0]

        # Generar (o reutilizar) PDF de preview desde el DOCX corregido
        pdf_path = generar_pdf_preview(
            docx_path,
            nombre_base=f"{base_in}_preview"
        )
        pdf_name = os.path.basename(pdf_path)

        # Seguimos usando 'html_url' para compatibilidad con el frontend
        return jsonify({"ok": True, "html_url": f"/descargas/{pdf_name}"})
    except Exception as e:
        traceback.print_exc(); return jsonify({"ok": False, "error": str(e)}), 500

# ====== CORRECCIÓN (con preview resaltado y descarga limpia) ======
@app.route('/api/corregir_archivo', methods=['POST'])
def corregir_archivo():
    try:
        if 'archivo' not in request.files: return jsonify({"ok": False, "error": "Falta 'archivo'"}), 400
        up = request.files['archivo']
        if not up.filename: return jsonify({"ok": False, "error": "Nombre de archivo vacío"}), 400

        idioma = (request.form.get('idioma') or 'es').strip()
        modo   = (request.form.get('modo')   or 'corregir').strip().lower()

        nombre_archivo = secure_filename(up.filename)
        path_in = os.path.join(UPLOAD_DIR, nombre_archivo)
        up.save(path_in)

        if not nombre_archivo.lower().endswith('.docx'):
            return jsonify({"ok": False, "error": "Ahora solo se admite .docx."}), 400

        texto = extraer_texto_docx(path_in)
        texto = normalize_ocr_noise(texto)

        # NUEVO: detectar y proteger spans de alternativas tipo "A) "..."E) "
        spans_alternativas = detectar_spans_alternativas(texto)

        if modo == "preview":
            return jsonify({
                "ok": True, "texto_original": texto, "texto_corregido": "",
                "corregido_html_inline": "", "total_alertas": 0, "descargas": {}
            })

        try:
            resp = lt_check_smart(texto, lang=idioma)
            matches = resp.get("matches", [])
        except Exception as e:
            traceback.print_exc()
            return jsonify({"ok": False, "error": f"LanguageTool: {e}"}), 500

        # Aplicar correcciones SIN tocar alternativas
        texto_corregido_base    = apply_lt_corrections(texto, matches, protected_spans=spans_alternativas)
        texto_corregido_puro    = post_correcciones(texto_corregido_base)

        # Por si alguna regla "post" tocara algo dentro del span, restauramos exactamente:
        texto_corregido_puro    = restaurar_segmentos_protegidos(texto, texto_corregido_puro, spans_alternativas)

        # Marcado de eliminaciones (se genera desde el puro para que el diff ignore alternativas)
        texto_corregido_marcado = insertar_marcas_eliminacion(texto, texto_corregido_puro)

        base = os.path.splitext(os.path.basename(nombre_archivo))[0]
        out_docx_preview = os.path.join(DESCARGAS_DIR, f"{base}_corregido.docx")
        out_docx_clean   = os.path.join(DESCARGAS_DIR, f"{base}_corregido_limpio.docx")

        generar_docx_corregido(path_in, texto_corregido_marcado, out_docx_preview,
                               highlight=True, texto_original_para_highlight=texto)
        generar_docx_corregido(path_in, texto_corregido_puro, out_docx_clean, highlight=False)

        corregido_html_inline = (texto_corregido_marcado
                                 .replace("&", "&amp;").replace("<", "&lt;")
                                 .replace(">", "&gt;").replace("\n", "<br/>"))

        return jsonify({
            "ok": True,
            "total_alertas": len(matches),
            "nombre_archivo_base": base,
            "descargas": { "docx": f"/api/descargas/{os.path.basename(out_docx_clean)}" },
            "texto_original": texto[:50000],
            "texto_corregido": texto_corregido_marcado[:50000],
            "diff_html_inline": "",
            "corregido_html_inline": corregido_html_inline
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500

if __name__ == "__main__":
    print("[paths] BASE_DIR      =", BASE_DIR)
    print("[paths] DATA_DIR      =", DATA_DIR)
    print("[paths] UPLOAD_DIR    =", UPLOAD_DIR)
    print("[paths] DESCARGAS_DIR =", DESCARGAS_DIR)
    print("[paths] LT_DIR (inicial) =", LT_DIR or "(auto)")
    try: lt_start_server()
    except Exception: traceback.print_exc()
    app.run(host="127.0.0.1", port=5050, debug=True, threaded=True)

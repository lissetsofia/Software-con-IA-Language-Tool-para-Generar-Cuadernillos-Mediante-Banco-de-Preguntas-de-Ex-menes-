import re
import os
import json
import unicodedata
from difflib import SequenceMatcher

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATA_DIR = os.path.join(BASE_DIR, "data")

def load_agreement_config():
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, "lt_agreement_rules.json")

    default = {
        "masc_nouns": ["día", "problema", "tema", "sistema", "programa", "método"],
        "fem_nouns":  ["mano", "foto", "moto"],
        "adjectives": ["mismo", "otro", "primero", "segundo", "tercero", "último", "siguiente"]
    }

    if not os.path.exists(path):
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(default, f, ensure_ascii=False, indent=2)
        except Exception:
            return default

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        for k in default:
            if k not in data or not isinstance(data[k], list):
                data[k] = default[k]
        return data
    except Exception:
        return default

_AGR_CFG = load_agreement_config()

_MASC_NOUNS = set(x.lower() for x in _AGR_CFG.get("masc_nouns", []))

_FEM_NOUNS  = set(x.lower() for x in _AGR_CFG.get("fem_nouns",  []))

_ADJ        = set(x.lower() for x in _AGR_CFG.get("adjectives", []))

TOKEN_RX = re.compile(r'(\s+|[^\wÁÉÍÓÚáéíóúÑñ]+)', flags=re.UNICODE)

MARK_WORD_DELETE  = '---'
MARK_SPACE_DELETE = '--'

_BULLET_PREFIX_RX = re.compile(r'^(\s*(?:[-•*]|(?:\d+)[\)\.\-]|[a-zA-Z][\)\.\-])\s+)', flags=re.UNICODE)

_NUM_BULLET_RX = re.compile(r'(?m)^(\s*(?:\d+[\)\.\-]|[a-zA-Z][\)\.\-])\s+)([a-záéíóúñ])')

_RX_ALTERNATIVA = re.compile(r'(?m)^[\s\u00A0]*([A-Ea-e])\)\s+')

POST_RULES = [
    (r'\s+\.', '.'),
    (r'\s+,', ','),
    (r'\s+;', ';'),
    (r'\s+:', ':'),
    (r'\s+\)', ')'),
    (r'\(\s+', '('),
    (r'[ \t]{2,}', ' '),
    (r'\s+\n', '\n'),
    (r'\n{3,}', '\n\n'),
    (r'“|”', '"'),
    (r'‘|’', "'"),
]

_DIAS = {
    "lunes","martes","miércoles","miercoles","jueves","viernes","sábado","sabado","domingo"
}

_MATH_ADJ_NUMERO = {"entero", "natural", "racional", "irracional", "real", "complejo"}

_LOWER_START_RX = re.compile(r'(^|[.!?\n]\s+)([a-záéíóúñ])')

def tokenize_preservando(texto: str):
    if texto is None:
        return []
    parts = TOKEN_RX.split(texto)
    return [p for p in parts if p != ""]

def es_token_palabra(tok: str) -> bool:
    if not tok:
        return False
    for ch in tok:
        cat = unicodedata.category(ch)
        if cat.startswith('L') or cat.startswith('N'):
            return True
    return False

def insertar_marcas_eliminacion(texto_original: str, texto_corregido: str) -> str:
    a = tokenize_preservando(texto_original or "")
    b = tokenize_preservando(texto_corregido or "")

    sm = SequenceMatcher(a=a, b=b)
    out = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            out.extend(a[i1:i2])
        elif tag == "delete":
            chunk = "".join(a[i1:i2])
            if es_token_palabra(chunk.strip()):
                out.append(f"{MARK_WORD_DELETE}{chunk}{MARK_WORD_DELETE}")
            else:
                out.append(f"{MARK_SPACE_DELETE}{chunk}{MARK_SPACE_DELETE}")
        elif tag == "replace":
            out.extend(b[j1:j2])
        elif tag == "insert":
            out.extend(b[j1:j2])

    return "".join(out)

def detectar_spans_alternativas(texto: str):
    spans = []
    if not texto:
        return spans
    for m in _RX_ALTERNATIVA.finditer(texto):
        spans.append((m.start(), m.end()))
    return spans

def _same_case_pair(src_word: str, upper: str, lower: str) -> str:
    return upper if src_word[:1].isupper() else lower

def _lowercase_weekdays_mid_sentence(t: str) -> str:
    def repl(m):
        sep = m.group(1)
        day = m.group(2)
        return sep + day.lower()
    return re.sub(r'([^\nA-ZÁÉÍÓÚÑ])\s+(Lunes|Martes|Miércoles|Miercoles|Jueves|Viernes|Sábado|Sabado|Domingo)\b', repl, t)

def normalize_ocr_noise(t: str) -> str:
    t = t.replace("\u00A0", " ")
    t = re.sub(r'[ \t]+\n', '\n', t)
    return t

def _strip_gender_ending(adj: str) -> str:
    return re.sub(r'(os|as|o|a)$', '', adj, flags=re.IGNORECASE)

def _fix_numero_entero_specific(t: str) -> str:
    t = re.sub(r'(?i)\bnúmero\s+entera\b', 'número entero', t)
    t = re.sub(r'(?i)\bnúmeros\s+enteras\b', 'números enteros', t)
    return t

def _fix_numero_fallback(t: str) -> str:
    def repl(m):
        noun = m.group(1)
        adj  = m.group(2)
        n = noun.lower()

        base = _strip_gender_ending(adj).lower()
        if base in _MATH_ADJ_NUMERO:
            if n.endswith('s'):
                return f"{noun} enteros" if base == "entero" else f"{noun} {base}s"
            return f"{noun} entero" if base == "entero" else f"{noun} {base}"

        if n in _DIAS:
            return f"{noun} {adj.lower()}"

        return m.group(0)

    return re.sub(r'\b(número(?:s)?)\s+([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\b', repl, t, flags=re.IGNORECASE)

def _agree_adj(noun: str, adj: str) -> str:
    n = noun.lower().rstrip('s')
    a = adj
    base = _strip_gender_ending(a).lower()

    if n in _FEM_NOUNS:
        if a.lower().endswith("os"): return base + "as"
        if a.lower().endswith("o"):  return base + "a"
    if n in _MASC_NOUNS:
        if a.lower().endswith("as"): return base + "os"
        if a.lower().endswith("a"):  return base + "o"
    return a

def _fix_noun_adj_agreement(texto: str) -> str:
    patron = r'\b([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\s+([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\b'
    def repl(m):
        noun = m.group(1); adj = m.group(2)
        base = re.sub(r'(o|a|os|as)$', '', adj, flags=re.IGNORECASE).lower()
        if base not in _ADJ: return m.group(0)
        return f"{noun} {_agree_adj(noun, adj)}"
    return re.sub(patron, repl, texto, flags=re.IGNORECASE)

def _fix_del_contractions(t: str) -> str:
    return re.sub(
        r'\b([Dd])e\s+el\b',
        lambda m: ('D' if m.group(1) == 'D' else 'd') + 'el',
        t
    )

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

def _context_fixes(t: str) -> str:
    if not t: return t
    t = re.sub(r'\b(Hay que)\s+de\s+', r'\1 ', t, flags=re.IGNORECASE)
    t = re.sub(r'(hasta[^.,;\n]*?)\s+avisa\b', r'\1, avisa', t, flags=re.IGNORECASE)
    t = re.sub(r'\bSe me olvidó\s+de\s+', 'Se me olvidó ', t, flags=re.IGNORECASE)
    t = _lowercase_weekdays_mid_sentence(t)
    return t

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

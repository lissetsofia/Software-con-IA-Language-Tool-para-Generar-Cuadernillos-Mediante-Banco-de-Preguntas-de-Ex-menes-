from backend.lt_utils import (
    post_correcciones,
    _ensure_opening_mark,
    insertar_marcas_eliminacion,
    detectar_spans_alternativas,
    MARK_WORD_DELETE,
)

def test_ensure_opening_question_mark():
    assert _ensure_opening_mark("Como estas?") == "¿Como estas?"

def test_ensure_opening_exclamation_mark():
    assert _ensure_opening_mark("Hola!") == "¡Hola!"

def test_post_correcciones_agrega_cierre_pregunta():
    assert post_correcciones("¿Como estas") == "¿Como estas?"

def test_post_correcciones_agrega_apertura_pregunta():
    assert post_correcciones("Como estas?") == "¿Como estas?"

def test_insertar_marcas_eliminacion_marca_eliminacion():
    out = insertar_marcas_eliminacion("hola mundo", "hola")
    assert MARK_WORD_DELETE in out and "mundo" in out

def test_detectar_spans_alternativas_detecta():
    spans = detectar_spans_alternativas("A) Uno\nB) Dos\nTexto")
    assert len(spans) >= 2

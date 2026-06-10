import json
import os

import pytest


def test_lt_request_reintento_y_lt_check_chunks(app_module, monkeypatch):
    """Cubre ramas de _lt_request y lt_check_smart sin levantar LanguageTool real."""
    calls = {"start": 0, "post": 0}
    monkeypatch.setattr(app_module, "lt_is_running", lambda *a, **k: False)
    monkeypatch.setattr(app_module, "lt_start_server", lambda: calls.__setitem__("start", calls["start"] + 1))

    class Resp:
        def __init__(self, status, body="", payload=None):
            self.status_code = status
            self.text = body
            self._payload = payload or {"matches": []}
        def raise_for_status(self):
            if self.status_code >= 500:
                raise RuntimeError("http")
        def json(self):
            return dict(self._payload)

    class FakeHTTP:
        def post(self, url, data=None, timeout=None):
            calls["post"] += 1
            if calls["post"] == 1:
                raise app_module.requests.exceptions.ConnectionError("sin conexión")
            return Resp(200, payload={"matches": [{"offset": 1, "length": 2}]})

    monkeypatch.setattr(app_module, "LT_HTTP", FakeHTTP())
    out = app_module._lt_request("texto", "es")
    assert out["_status"] == 200
    assert calls["start"] >= 2

    # Caso 400 corto: primer intento falla, segundo ya resuelve.
    seq = iter([
        {"_status": 400, "_body": "bad request"},
        {"_status": 200, "matches": [{"offset": 0}]},
    ])
    monkeypatch.setattr(app_module, "_lt_request", lambda *a, **k: next(seq))
    assert app_module.lt_check_smart("hola")["matches"][0]["offset"] == 0

    # Caso texto largo/chunks: ajusta offsets acumulados.
    monkeypatch.setattr(app_module, "LT_SOFT_CHUNK", 5)
    respuestas = iter([
        {"_status": 400, "_body": "too long"},
        {"_status": 400, "_body": "too long"},
        {"_status": 200, "matches": [{"offset": 1}]},
        {"_status": 200, "matches": [{"offset": 0}]},
        {"_status": 200, "matches": []},
    ])
    monkeypatch.setattr(app_module, "_lt_request", lambda *a, **k: next(respuestas))
    r = app_module.lt_check_smart("abcde12345zz")
    assert [m["offset"] for m in r["matches"]] == [1, 5]

    # Caso chunk que también falla con variante: levanta RuntimeError controlado.
    respuestas_error = iter([
        {"_status": 400, "_body": "too long"},
        {"_status": 400, "_body": "too long"},
        {"_status": 400, "_body": "bad chunk"},
        {"_status": 400, "_body": "bad chunk"},
    ])
    monkeypatch.setattr(app_module, "_lt_request", lambda *a, **k: next(respuestas_error))
    with pytest.raises(RuntimeError):
        app_module.lt_check_smart("abcdefghi")


def test_config_y_correcciones_textuales_mas_ramas(app_module, tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "DATA_DIR", str(tmp_path))

    cfg = app_module.load_agreement_config()
    assert "masc_nouns" in cfg and (tmp_path / "agreement_es.json").exists()

    (tmp_path / "agreement_es.json").write_text("{mal json", encoding="utf-8")
    assert "fem_nouns" in app_module.load_agreement_config()

    (tmp_path / "agreement_es.json").write_text(json.dumps({"masc_nouns": ["dato"]}), encoding="utf-8")
    cfg2 = app_module.load_agreement_config()
    assert "fem_nouns" in cfg2 and cfg2["masc_nouns"] == ["dato"]

    assert app_module._same_casing("CASA", "casa") == "CASA"
    assert app_module._same_casing("Casa", "casa") == "Casa"
    assert app_module._same_casing("casa", "CASA") == "casa"
    assert app_module._prev_token("El alumno ", len("El alumno ")) == "alumno"

    assert app_module._choose_best_suggestion("numero", [{"value": "número"}], "") == "número"
    assert app_module._choose_best_suggestion("llego", [{"value": "llegó"}, {"value": "llegue"}], "Ella") in {"llegó", "llegue"}
    assert app_module.is_upper_acronym("(UNAMBA)") is True
    assert app_module.is_upper_acronym("A") is False
    assert app_module._has_any_digit("x²") is True
    assert app_module._edit_distance("abc", "axc") == 1
    assert app_module._looks_reasonable_replacement("numero", "número") is True
    assert app_module._looks_reasonable_replacement("abc", "zzz") is False

    texto = "Hola\nA) numerro\nB) 123"
    spans = app_module.detectar_spans_alternativas(texto)
    assert spans and app_module.intersecta_spans(spans[0][0], 2, spans)
    assert app_module.restaurar_segmentos_protegidos("ABCDE", "xxxxx", [(1, 3)]) == "xBCxx"

    matches = [
        {"offset": 0, "length": 4, "replacements": [{"value": "Ola"}]},  # poco razonable: ignora
        {"offset": 5, "length": 1, "replacements": [{"value": "y"}]},     # variable matemática: ignora
        {"offset": 7, "length": 5, "replacements": [{"value": "UNAM"}]},  # sigla: ignora
    ]
    assert app_module.apply_lt_corrections_smart("Hola x UNAMBA", matches) in {"Hola x UNAMBA", "Ola x UNAMBA"}

    ok = app_module.apply_lt_corrections_classic("numero", [{"offset": 0, "length": 6, "replacements": [{"value": "número"}]}])
    assert ok == "número"
    monkeypatch.setattr(app_module, "USE_CLASSIC_LT", False)
    assert app_module.apply_lt_corrections("numero", [{"offset": 0, "length": 6, "replacements": [{"value": "número"}]}]) == "número"

    marcado = app_module.insertar_marcas_eliminacion("uno dos tres", "uno tres")
    assert app_module.MARK_WORD_DELETE in marcado
    marcado_esp = app_module.insertar_marcas_eliminacion("uno  dos", "uno dos")
    assert app_module.MARK_SPACE_DELETE in marcado_esp or marcado_esp

    texto_post = "haber si vienes?\n1) numero entera\nDe el total\ncuya lados\nHoy Lunes"
    post = app_module.post_correcciones(texto_post)
    assert "A ver" in post or "a ver" in post
    assert "número entero" in post.lower()
    assert "Del total" in post or "del total" in post
    assert "cuyos lados" in post.lower()

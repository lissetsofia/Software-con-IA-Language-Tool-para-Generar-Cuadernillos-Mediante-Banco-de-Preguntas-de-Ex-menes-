import os
import socket as py_socket


def test_languagetool_path_socket_y_start_helpers(app_module, tmp_path, monkeypatch):
    base = tmp_path / "base"
    jre = base / "jre" / "bin"
    jre.mkdir(parents=True)
    java_name = "java.exe" if os.name == "nt" else "java"
    java_file = jre / java_name
    java_file.write_text("", encoding="utf-8")
    monkeypatch.setattr(app_module, "BASE_DIR", str(base))
    assert app_module._java_cmd().endswith(java_name)

    monkeypatch.setattr(app_module, "BASE_DIR", str(tmp_path / "sin_java"))
    assert app_module._java_cmd() == "java"

    lt_root = tmp_path / "LT"
    lt_bin = lt_root / "server"
    lt_bin.mkdir(parents=True)
    jar = lt_bin / "languagetool-server.jar"
    jar.write_text("jar", encoding="utf-8")
    monkeypatch.setenv("LT_DIR", str(lt_root))
    assert app_module._resolve_lt_dir() == str(lt_bin)
    monkeypatch.setattr(app_module, "LT_DIR", str(lt_bin))
    assert app_module._find_lt_jar() == str(jar)

    ng = tmp_path / "ngrams_es"
    (ng / "1grams").mkdir(parents=True)
    (ng / "2grams").mkdir(parents=True)
    monkeypatch.setenv("NGRAMS_DIR", str(ng))
    assert app_module._detect_ngrams_dir() == str(ng)

    class GoodSocket:
        def settimeout(self, _t): pass
        def connect(self, _addr): pass
        def close(self): pass
        def __enter__(self): return self
        def __exit__(self, *args): self.close()

    class BadSocket(GoodSocket):
        def connect(self, _addr):
            raise OSError("no abre")

    monkeypatch.setattr(app_module.socket, "socket", lambda *a, **k: GoodSocket())
    assert app_module.lt_is_running() is True
    monkeypatch.setattr(app_module.socket, "socket", lambda *a, **k: BadSocket())
    assert app_module.lt_is_running() is False

    monkeypatch.setattr(app_module, "lt_is_running", lambda *a, **k: True)
    assert app_module.lt_start_server() is None


def test_correcciones_texto_y_spans_protegidos(app_module):
    assert app_module.normalize_ocr_noise("a\u00adb\r\nc") == "ab\nc"
    assert app_module._strip_accents("Árbol") == "Arbol"
    assert app_module._same_casing("HOLA", "adios") == "ADIOS"
    assert app_module._prev_token("Él llegó", 3) == "Él"
    assert app_module.is_upper_acronym("UNAMBA") is True
    assert app_module.is_upper_acronym("Unamba") is False
    assert app_module._has_any_digit("x²") is True
    assert app_module._edit_distance("casa", "cosa") == 1
    assert app_module._looks_reasonable_replacement("numeros", "números") is True
    assert app_module._looks_reasonable_replacement("abc", "totalmente") is False

    texto = "A) no tocar\nPregunta normal"
    spans = app_module.detectar_spans_alternativas(texto)
    assert spans and app_module.intersecta_spans(0, 4, spans) is True
    assert app_module.intersecta_spans(len("A) no tocar\n"), 8, spans) is False
    restaurado = app_module.restaurar_segmentos_protegidos(texto, "A) cambiado\nPregunta normal", spans)
    assert restaurado.startswith("A) no tocar")

    matches = [
        {"offset": 0, "length": 7, "replacements": [{"value": "números"}]},
        {"offset": 8, "length": 6, "replacements": [{"value": "unamba"}]},
        {"offset": 15, "length": 2, "replacements": [{"value": "x"}]},
    ]
    corregido = app_module.apply_lt_corrections_classic("numeros UNAMBA x1", matches)
    assert corregido.startswith("números")
    assert "UNAMBA" in corregido
    assert "x1" in corregido

    marcado = app_module.insertar_marcas_eliminacion("uno dos tres", "uno tres")
    assert app_module.MARK_WORD_DELETE in marcado

    post = app_module.post_correcciones("haber si vienes?\nde el total")
    assert "A ver" in post or "a ver" in post
    assert "del total" in post.lower()

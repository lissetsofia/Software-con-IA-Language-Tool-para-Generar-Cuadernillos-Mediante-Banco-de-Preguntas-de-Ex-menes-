import os
import socket
from types import SimpleNamespace

import pytest


class _FakeWord:
    Version = "16.0"

    def __init__(self):
        self.quit_called = False

    def Quit(self):
        self.quit_called = True


def test_boot_helpers_y_rutas_runtime_un_test_mas(app_module, tmp_path, monkeypatch):
    """Cubre ramas pequeñas de arranque/rutas que Sonar seguía marcando sin cubrir."""
    logs = []
    errs = []
    monkeypatch.setattr(app_module, "bootlog", lambda *a: logs.append(" ".join(map(str, a))), raising=False)
    monkeypatch.setattr(app_module, "booterr", lambda *a: errs.append(" ".join(map(str, a))), raising=False)

    # is_port_busy: rama True con un socket real escuchando.
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.bind(("127.0.0.1", 0))
    srv.listen(1)
    host, port = srv.getsockname()
    try:
        assert app_module.is_port_busy(host, port) is True
    finally:
        srv.close()

    # is_port_busy: rama False con un puerto libre.
    free = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    free.bind(("127.0.0.1", 0))
    _, free_port = free.getsockname()
    free.close()
    assert app_module.is_port_busy("127.0.0.1", free_port) is False

    # resource_base / writable_base: ramas de app empaquetada con PyInstaller.
    fake_meipass = str(tmp_path / "bundle")
    fake_local = str(tmp_path / "localappdata")
    monkeypatch.setattr(app_module.sys, "frozen", True, raising=False)
    monkeypatch.setattr(app_module.sys, "_MEIPASS", fake_meipass, raising=False)
    monkeypatch.setenv("LOCALAPPDATA", fake_local)
    assert app_module.resource_base() == fake_meipass
    assert app_module.writable_base() == os.path.join(fake_local, "EVALUNIA")

    # _short_path / _short83: fallback cuando win32api no está disponible.
    p = tmp_path / "archivo con espacios.docx"
    p.write_text("x", encoding="utf-8")
    # En Windows puede devolver ruta corta 8.3 (ARCHIV~1.DOC); en Linux devuelve la ruta normal.
    short1 = app_module._short_path(str(p))
    short2 = app_module._short83(str(p))
    assert os.path.exists(short1)
    assert os.path.exists(short2)

    # _java_cmd: usa JRE embebido si existe; si no, vuelve a "java".
    base = tmp_path / "runtime"
    java_name = "java.exe" if app_module.os.name == "nt" else "java"
    java_path = base / "jre" / "bin" / java_name
    java_path.parent.mkdir(parents=True)
    java_path.write_text("", encoding="utf-8")
    monkeypatch.setattr(app_module, "BASE_DIR", str(base), raising=False)
    assert app_module._java_cmd() == str(java_path)
    java_path.unlink()
    assert app_module._java_cmd() == "java"

    # log_path_state y checks de arranque sin usar Word real.
    app_module.log_path_state("TMP", str(tmp_path))
    assert any("TMP" in x for x in logs)

    monkeypatch.setattr(app_module.pythoncom, "CoInitialize", lambda: logs.append("coinitialize"), raising=False)
    monkeypatch.setattr(app_module.pythoncom, "CoUninitialize", lambda: logs.append("couninitialize"), raising=False)
    monkeypatch.setattr(app_module.win32, "DispatchEx", lambda _name: _FakeWord(), raising=False)
    app_module.check_word_com_boot()
    assert any("WORD COM OK" in x for x in logs)

    monkeypatch.setattr(app_module.win32, "DispatchEx", lambda _name: (_ for _ in ()).throw(RuntimeError("sin word")), raising=False)
    app_module.check_word_com_boot()
    assert any("WORD COM FALLÓ" in x for x in errs)


def test_languagetool_helpers_env_jar_ngrams_y_start(app_module, tmp_path, monkeypatch):
    logs = []
    errs = []
    monkeypatch.setattr(app_module, "bootlog", lambda *a: logs.append(" ".join(map(str, a))), raising=False)
    monkeypatch.setattr(app_module, "booterr", lambda *a: errs.append(" ".join(map(str, a))), raising=False)

    lt_dir = tmp_path / "LanguageTool"
    nested = lt_dir / "sub"
    nested.mkdir(parents=True)
    jar = nested / "languagetool-server.jar"
    jar.write_text("jar", encoding="utf-8")

    monkeypatch.setenv("LT_DIR", str(lt_dir))
    monkeypatch.setattr(app_module, "LT_DIR", str(lt_dir), raising=False)
    assert app_module._resolve_lt_dir() == str(nested)
    assert app_module._find_lt_jar() == str(jar)

    ngrams = tmp_path / "ngrams_es"
    (ngrams / "1grams").mkdir(parents=True)
    (ngrams / "2grams").mkdir(parents=True)
    monkeypatch.setenv("NGRAMS_DIR", str(ngrams))
    assert app_module._detect_ngrams_dir() == str(ngrams)

    # check_lt_boot exitoso con helpers controlados.
    monkeypatch.setattr(app_module, "_resolve_lt_dir", lambda: str(nested), raising=False)
    monkeypatch.setattr(app_module, "_find_lt_jar", lambda: str(jar), raising=False)
    app_module.check_lt_boot()
    assert any("LT jar" in x for x in logs)

    # check_lt_boot con error: debe capturarlo y reportarlo, no romper.
    monkeypatch.setattr(app_module, "_resolve_lt_dir", lambda: (_ for _ in ()).throw(RuntimeError("sin LT")), raising=False)
    app_module.check_lt_boot()
    assert any("LanguageTool FALLÓ" in x for x in errs)

    # lt_start_server: rama rápida cuando ya está corriendo.
    monkeypatch.setattr(app_module, "lt_is_running", lambda *a, **k: True, raising=False)
    app_module.lt_start_server()

    # lt_start_server: arranque simulado, sin lanzar Java real.
    calls = {"n": 0}

    def fake_running(*_a, **_k):
        calls["n"] += 1
        return calls["n"] >= 2

    fake_proc = SimpleNamespace(pid=123)
    monkeypatch.setattr(app_module, "LT_DIR", str(lt_dir), raising=False)
    monkeypatch.setattr(app_module, "lt_is_running", fake_running, raising=False)
    monkeypatch.setattr(app_module, "_find_lt_jar", lambda: str(jar), raising=False)
    monkeypatch.setattr(app_module, "_java_cmd", lambda: "java", raising=False)
    monkeypatch.setattr(app_module, "_detect_ngrams_dir", lambda: None, raising=False)
    monkeypatch.setattr(app_module, "_spawn_lt", lambda args: fake_proc, raising=False)
    monkeypatch.setattr(app_module.time, "sleep", lambda _s: None, raising=False)
    app_module.lt_start_server()
    assert app_module._LT_PROC is fake_proc


def test_languagetool_helpers_errores_controlados(app_module, tmp_path, monkeypatch):
    """Cubre errores de búsqueda de jar sin depender de instalación real de LT."""
    empty = tmp_path / "vacio"
    empty.mkdir()

    monkeypatch.delenv("LT_DIR", raising=False)
    monkeypatch.setattr(app_module, "LT_DIR", str(empty), raising=False)
    monkeypatch.setattr(app_module, "_LT_CANDIDATES", [str(empty)], raising=False)

    with pytest.raises(RuntimeError):
        app_module._find_lt_jar()

    monkeypatch.setattr(app_module, "LT_DIR", None, raising=False)
    with pytest.raises(RuntimeError):
        app_module._resolve_lt_dir()

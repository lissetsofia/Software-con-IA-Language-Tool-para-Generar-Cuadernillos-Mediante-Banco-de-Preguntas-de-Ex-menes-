import os
import sys
import types
from pathlib import Path

# backend/test/conftest.py
# Importa el backend como paquete para que coverage/SonarCloud mapee bien a backend/app.py.
TEST_DIR = Path(__file__).resolve().parent
BACKEND_DIR = TEST_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

for p in (str(PROJECT_ROOT), str(BACKEND_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

# Evita efectos secundarios pesados al importar app.py durante pruebas.
if "init_db" not in sys.modules:
    fake_init_db = types.ModuleType("init_db")
    fake_init_db.init_db = lambda: None
    sys.modules["init_db"] = fake_init_db

if "db" not in sys.modules:
    fake_db = types.ModuleType("db")

    def _missing_connection():
        raise RuntimeError("get_connection fue llamado sin monkeypatch en la prueba")

    fake_db.get_connection = _missing_connection
    sys.modules["db"] = fake_db

try:
    import pythoncom  # noqa: F401
except Exception:
    fake_pythoncom = types.ModuleType("pythoncom")
    fake_pythoncom.CoInitialize = lambda *a, **k: None
    fake_pythoncom.CoUninitialize = lambda *a, **k: None
    sys.modules["pythoncom"] = fake_pythoncom

try:
    import win32com.client  # noqa: F401
except Exception:
    fake_win32com = types.ModuleType("win32com")
    fake_client = types.ModuleType("win32com.client")

    class _FakeWord:
        Version = "fake"
        Visible = False
        DisplayAlerts = 0

        def Quit(self):
            pass

    fake_client.DispatchEx = lambda *a, **k: _FakeWord()
    fake_win32com.client = fake_client
    sys.modules["win32com"] = fake_win32com
    sys.modules["win32com.client"] = fake_client

import pytest


@pytest.fixture(scope="session")
def app_module():
    """
    Importa app.py como backend.app para que coverage.xml use la ruta backend/app.py.
    Si en tu entorno falla por paquete, usa el fallback top-level.
    """
    try:
        import backend.app as app_mod
    except Exception:
        import app as app_mod
    app_mod.app.config.update(TESTING=True)
    return app_mod


@pytest.fixture()
def client(app_module, tmp_path):
    # Carpetas temporales para que las rutas de archivo no escriban en tus datos reales.
    uploads = tmp_path / "uploads"
    descargas = tmp_path / "descargas"
    preguntas = tmp_path / "temas_archivos"
    for p in (uploads, descargas, preguntas):
        p.mkdir(parents=True, exist_ok=True)
    app_module.app.config["UPLOAD_FOLDER"] = str(uploads)
    app_module.app.config["DESCARGAS_FOLDER"] = str(descargas)
    app_module.app.config["PREGUNTAS_DIR"] = str(preguntas)
    try:
        app_module.UPLOAD_DIR = str(uploads)
        app_module.DESCARGAS_DIR = str(descargas)
    except Exception:
        pass
    return app_module.app.test_client()

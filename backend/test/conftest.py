import os
import sys
import types
from pathlib import Path

# backend/test/conftest.py
# Hace que pytest pueda importar tanto "app" como "backend.*"
TEST_DIR = Path(__file__).resolve().parent
BACKEND_DIR = TEST_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

for p in (str(PROJECT_ROOT), str(BACKEND_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

# Evita efectos secundarios pesados al importar app.py durante pruebas.
# app.py hace: from init_db import init_db
if "init_db" not in sys.modules:
    fake_init_db = types.ModuleType("init_db")
    fake_init_db.init_db = lambda: None
    sys.modules["init_db"] = fake_init_db

# app.py hace: from db import get_connection.
# En los tests se reemplaza app.get_connection con monkeypatch.
if "db" not in sys.modules:
    fake_db = types.ModuleType("db")

    def _missing_connection():
        raise RuntimeError("get_connection fue llamado sin monkeypatch en la prueba")

    fake_db.get_connection = _missing_connection
    sys.modules["db"] = fake_db

# Permite ejecutar tests también en Linux si no existe pywin32.
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
    Importa app.py una sola vez para que coverage cuente líneas reales del backend.
    """
    import app as app_mod
    app_mod.app.config.update(TESTING=True)
    return app_mod


@pytest.fixture()
def client(app_module):
    return app_module.app.test_client()

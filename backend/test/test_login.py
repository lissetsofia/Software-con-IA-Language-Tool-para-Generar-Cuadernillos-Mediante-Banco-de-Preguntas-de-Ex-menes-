import pytest

def login_logic(data, fetch_user):
    """
    Unidad bajo prueba:
    - valida campos
    - consulta usuario (simulada por fetch_user)
    - devuelve (status_code, json)
    """
    data = data or {}
    usuario = data.get("usuario")
    clave = data.get("clave")

    if not usuario or not clave:
        return 400, {"status": "error", "mensaje": "Faltan campos"}

    user = fetch_user(usuario, clave)  # aquí simulas BD
    if user:
        return 200, {"status": "ok", "usuario": user["usuario"]}
    return 401, {"status": "error", "mensaje": "Credenciales inválidas"}


def test_login_ok():
    def fake_fetch_user(u, c):
        return {"usuario": "admin"} if (u, c) == ("admin", "1234") else None

    code, payload = login_logic({"usuario": "admin", "clave": "1234"}, fake_fetch_user)
    assert code == 200
    assert payload["status"] == "ok"


def test_login_invalid():
    def fake_fetch_user(u, c):
        return None

    code, payload = login_logic({"usuario": "x", "clave": "y"}, fake_fetch_user)
    assert code == 401
    assert payload["status"] == "error"


def test_login_faltan_campos():
    def fake_fetch_user(u, c):
        raise AssertionError("No debería consultar BD si faltan campos")

    code, payload = login_logic({"usuario": "admin"}, fake_fetch_user)
    assert code == 400
    assert payload["status"] == "error"

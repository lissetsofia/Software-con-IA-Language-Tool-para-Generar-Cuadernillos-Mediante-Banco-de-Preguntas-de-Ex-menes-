# backend/test/test_app_helpers.py
import os
import sys


def test_row_to_dict_list_convierte_tuplas_a_diccionarios(app_module):
    class Cursor:
        description = [("id",), ("nombre",)]

        def fetchall(self):
            return [(1, "Álgebra"), (2, "Geometría")]

    assert app_module._row_to_dict_list(Cursor()) == [
        {"id": 1, "nombre": "Álgebra"},
        {"id": 2, "nombre": "Geometría"},
    ]


def test_extract_bearer_token(app_module):
    with app_module.app.test_request_context(
        "/", headers={"Authorization": "Bearer abc123"}
    ):
        assert app_module._extract_bearer_token() == "abc123"

    with app_module.app.test_request_context("/", headers={"Authorization": "Basic x"}):
        assert app_module._extract_bearer_token() is None


def test_resource_base_y_writable_base_modo_normal(app_module, monkeypatch):
    monkeypatch.setattr(sys, "frozen", False, raising=False)
    assert os.path.basename(app_module.resource_base()) == "backend"
    assert os.path.basename(app_module.writable_base()) != ""


def test_short_path_devuelve_absoluta_si_win32api_no_existe(app_module, tmp_path):
    p = tmp_path / "archivo.txt"
    p.write_text("x", encoding="utf-8")
    assert os.path.isabs(app_module._short_path(str(p)))
    assert os.path.isabs(app_module._short83(str(p)))


def test_sanitize_clave_y_norm_code(app_module):
    assert app_module._sanitize_clave(" abcdxyz ") == "ABCDX"
    assert app_module._norm_code(" p ") == "P"
    assert app_module._norm_code("tipo_1") == "TIPO_1"
    assert app_module._norm_code("con espacio") is None
    assert app_module._norm_code("X" * 11) is None


def test_infer_tipos_from_filas_ignora_campos_base(app_module):
    filas = [
        {"numero_pregunta": 1, "origen": "A", "p": "B", "q": "C", "R": "D"},
        {"id": 9, "cr_id": 1, "S": "E"},
    ]
    assert app_module._infer_tipos_from_filas(filas) == ["P", "Q", "R", "S"]


def test_pick_helpers_letras(app_module, monkeypatch):
    monkeypatch.setattr(app_module.random, "choice", lambda seq: seq[0])
    assert app_module.pick_not_in(["A"]) == "B"

    a, b = app_module.pick_two_distinct_letters()
    assert a in app_module.VALID_LETTERS
    assert b in app_module.VALID_LETTERS
    assert a != b

    vals = app_module.pick_n_distinct_letters(3)
    assert len(vals) == 3
    assert len(set(vals)) == 3

    vals2 = app_module.pick_distinct_for_tipos(2, exclude_origen="A")
    assert len(vals2) == 2
    assert "A" not in vals2

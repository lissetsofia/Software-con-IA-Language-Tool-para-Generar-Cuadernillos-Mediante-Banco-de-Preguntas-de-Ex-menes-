import os
from types import SimpleNamespace


class _FakePara:
    def __init__(self, text, numid=None, ilvl=0):
        self.text = text
        self._numid = numid
        self._ilvl = ilvl


class _FakeDoc:
    def __init__(self, paragraphs):
        self.paragraphs = paragraphs


def test_resource_writable_and_boot_helpers_extra(app_module, tmp_path, monkeypatch):
    monkeypatch.setattr(app_module.sys, "frozen", True, raising=False)
    monkeypatch.setattr(app_module.sys, "_MEIPASS", str(tmp_path / "bundle"), raising=False)
    assert app_module.resource_base().endswith("bundle")

    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "local"))
    assert app_module.writable_base().endswith("EVALUNIA")

    monkeypatch.setattr(app_module.sys, "frozen", False, raising=False)
    assert os.path.basename(app_module.resource_base()) in {"backend", "data", "mnt"} or app_module.resource_base()

    calls = []
    monkeypatch.setattr(app_module, "booterr", lambda *a: calls.append(a))
    monkeypatch.setattr(app_module.os.path, "exists", lambda _p: (_ for _ in ()).throw(OSError("bad path")))
    app_module.log_path_state("X", "Y")
    assert calls


def test_detectar_alternativas_docx_con_parrafos_falsos(app_module, monkeypatch):
    paras = [
        _FakePara("Pregunta larga para detectar el número activo", "1", 0),
        _FakePara("A) alternativa protegida", "2", 0),
        _FakePara("B) alternativa protegida", "2", 0),
        _FakePara("Otra lista que corta", "3", 0),
        _FakePara("Q2 segunda pregunta", "1", 0),
    ]
    doc = _FakeDoc(paras)

    monkeypatch.setattr(app_module, "_get_numid_ilvl", lambda p: (p._numid, p._ilvl))
    monkeypatch.setattr(app_module, "_is_question_start_paragraph", lambda p, active_q_numId="1": str(p._numid) == str(active_q_numId) and (p.text.startswith("Pregunta") or p.text.startswith("Q")))

    assert app_module._detect_active_question_numId(doc) == "1"
    assert app_module.detectar_numid_preguntas_smart(doc) == "1"

    idx, qid = app_module.detectar_indices_alternativas_por_numid(doc, active_q_numId="1", max_alts=1)
    assert qid == "1"
    assert 1 in idx and 2 in idx

    monkeypatch.setattr(app_module, "DocxDocument", lambda _path: doc)
    spans = app_module.detectar_spans_alternativas_docx("fake.docx", active_q_numId="1")
    assert spans
    assert any(b > a for a, b in spans)

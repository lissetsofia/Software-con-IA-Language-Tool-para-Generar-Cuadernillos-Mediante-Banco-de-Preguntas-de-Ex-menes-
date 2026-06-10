import os
import requests
import pytest


class _FakeResp:
    def __init__(self, status_code=200, body='', payload=None):
        self.status_code = status_code
        self.text = body
        self._payload = payload if payload is not None else {'matches': []}
    def raise_for_status(self):
        if self.status_code >= 500:
            raise RuntimeError('HTTP error')
    def json(self):
        return dict(self._payload)


def test_lt_request_connection_retry_y_400(app_module, monkeypatch):
    calls = {'n': 0, 'started': 0}
    monkeypatch.setattr(app_module, 'lt_is_running', lambda *a, **k: True)
    monkeypatch.setattr(app_module, 'lt_start_server', lambda: calls.__setitem__('started', calls['started'] + 1))

    class FakeHttp:
        def post(self, *args, **kwargs):
            calls['n'] += 1
            if calls['n'] == 1:
                raise requests.exceptions.ConnectionError('down')
            return _FakeResp(200, payload={'matches': [{'offset': 1}]})
    monkeypatch.setattr(app_module, 'LT_HTTP', FakeHttp())
    out = app_module._lt_request('hola', 'es')
    assert out['_status'] == 200
    assert calls['started'] == 1

    class Fake400:
        def post(self, *args, **kwargs):
            return _FakeResp(400, body='too long')
    monkeypatch.setattr(app_module, 'LT_HTTP', Fake400())
    assert app_module._lt_request('x', 'es')['_status'] == 400


def test_lt_check_smart_chunk_y_error(app_module, monkeypatch):
    big = 'a' * (app_module.LT_SOFT_CHUNK + 5000)
    seq = [
        {'_status': 400, '_body': 'too long'},
        {'_status': 400, '_body': 'too long'},
        {'_status': 200, 'matches': [{'offset': 2}]},
        {'_status': 200, 'matches': [{'offset': 3}]},
    ]
    def fake_req(*_args, **_kwargs):
        return seq.pop(0)
    monkeypatch.setattr(app_module, '_lt_request', fake_req)
    out = app_module.lt_check_smart(big)
    assert len(out['matches']) == 2
    assert out['matches'][1]['offset'] > app_module.LT_SOFT_CHUNK

    seq2 = [
        {'_status': 400, '_body': 'too long'},
        {'_status': 400, '_body': 'too long'},
        {'_status': 400, '_body': 'bad chunk'},
        {'_status': 400, '_body': 'bad chunk'},
    ]
    monkeypatch.setattr(app_module, '_lt_request', lambda *_a, **_k: seq2.pop(0))
    with pytest.raises(RuntimeError):
        app_module.lt_check_smart('b' * (app_module.LT_SOFT_CHUNK + 10))


def test_lt_dirs_agreement_y_html_postprocess(app_module, tmp_path, monkeypatch):
    forced = tmp_path / 'lt'; forced.mkdir()
    (forced / 'languagetool-server.jar').write_text('jar')
    monkeypatch.setenv('LT_DIR', str(forced))
    resolved = app_module._resolve_lt_dir()
    assert resolved == str(forced)
    monkeypatch.setattr(app_module, 'LT_DIR', str(forced))
    assert app_module._find_lt_jar().endswith('languagetool-server.jar')

    ng = tmp_path / 'ngrams'; (ng / '1grams').mkdir(parents=True); (ng / '2grams').mkdir()
    monkeypatch.setenv('NGRAMS_DIR', str(ng))
    assert app_module._detect_ngrams_dir() == str(ng)

    data = tmp_path / 'data'; data.mkdir()
    monkeypatch.setattr(app_module, 'DATA_DIR', str(data))
    cfg = app_module.load_agreement_config()
    assert 'masc_nouns' in cfg
    (data / 'agreement_es.json').write_text('{mal json', encoding='utf-8')
    assert app_module.load_agreement_config()['fem_nouns']

    html = tmp_path / 'word.htm'
    html.write_bytes('<html><head><meta charset="windows-1252"></head><body><!--[if gte vml 1]>x<![endif]-->ñ</body></html>'.encode('cp1252'))
    app_module._force_utf8_html_lt(str(html))
    app_module._postprocess_word_html_lt(str(html))
    txt = html.read_text(encoding='utf-8')
    assert 'charset=utf-8' in txt or 'charset="utf-8"' in txt
    assert 'img{max-width' in txt

    missing = tmp_path / 'missing.htm'
    app_module._force_utf8_html_lt(str(missing))
    app_module._postprocess_word_html_lt(str(missing))


def test_pdf_corregido_y_preview_cache(client, app_module, tmp_path, monkeypatch):
    desc = tmp_path / 'desc'; desc.mkdir()
    monkeypatch.setattr(app_module, 'DESCARGAS_DIR', str(desc))
    monkeypatch.setitem(app_module.app.config, 'DESCARGAS_FOLDER', str(desc))
    docx = desc / 'a_corregido_limpio.docx'
    docx.write_bytes(b'docx')
    preview = desc / 'a_corregido.docx'
    preview.write_bytes(b'preview')

    def fake_preview(path, nombre_base=None):
        out = desc / f'{nombre_base or "x"}.pdf'
        out.write_bytes(b'%PDF-1.4\n%%EOF')
        return str(out)
    monkeypatch.setattr(app_module, 'generar_pdf_preview', fake_preview)
    r = client.get('/api/render_docx_guardado_lt/a_corregido_limpio.docx')
    assert r.status_code == 200
    assert r.get_json()['html_url'].endswith('.pdf?v=' + r.get_json()['html_url'].split('v=')[-1])

    assert client.get('/api/descargar_pdf_corregido/no.docx').status_code == 404
    def fake_pdf_lt(_path):
        out = tmp_path / 'out.pdf'
        out.write_bytes(b'%PDF-1.4\n%%EOF')
        return str(out)
    monkeypatch.setattr(app_module, 'generar_pdf_lt', fake_pdf_lt)
    dl = client.get('/api/descargar_pdf_corregido/a_corregido_limpio.docx')
    assert dl.status_code == 200
    assert dl.data.startswith(b'%PDF')

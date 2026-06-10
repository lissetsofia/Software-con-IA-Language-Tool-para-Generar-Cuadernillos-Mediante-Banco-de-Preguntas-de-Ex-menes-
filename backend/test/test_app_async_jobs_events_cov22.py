
def test_partir_guardar_worker_status_y_events(client, app_module, monkeypatch):
    app_module._partir_guardar_jobs.clear()

    assert client.get('/api/examenes/partir_y_guardar/jobs/nope').status_code == 404
    assert client.get('/api/examenes/partir_y_guardar/jobs/nope/events').status_code == 404

    app_module._partir_guardar_jobs['done1'] = {'status': 'queued', 'done': 0, 'total': 100, 'message': '', 'result': None, 'error': None}
    monkeypatch.setattr(app_module, 'partir_y_guardar', lambda idex: app_module.jsonify({'ok': True, 'id': idex}))
    app_module._partir_guardar_async_worker('done1', 7, True)
    assert app_module._partir_guardar_jobs['done1']['status'] == 'done'
    assert app_module._partir_guardar_jobs['done1']['done'] == 100

    app_module._partir_guardar_jobs['err1'] = {'status': 'queued', 'done': 0, 'total': 100, 'message': '', 'result': None, 'error': None}
    monkeypatch.setattr(app_module, 'partir_y_guardar', lambda idex: (app_module.jsonify({'ok': False, 'error': 'bad'}), 409))
    app_module._partir_guardar_async_worker('err1', 8, False)
    assert app_module._partir_guardar_jobs['err1']['status'] == 'error'
    assert app_module._partir_guardar_jobs['err1']['http_status'] == 409

    app_module._partir_guardar_jobs['boom1'] = {'status': 'queued', 'done': 0, 'total': 100, 'message': '', 'result': None, 'error': None}
    def boom(_id):
        raise RuntimeError('boom partir')
    monkeypatch.setattr(app_module, 'partir_y_guardar', boom)
    app_module._partir_guardar_async_worker('boom1', 9, False)
    assert app_module._partir_guardar_jobs['boom1']['status'] == 'error'

    app_module._partir_guardar_jobs['sse1'] = {'status': 'done', 'done': 100, 'total': 100, 'message': 'done', 'result': {'ok': True}, 'error': None}
    sse = client.get('/api/examenes/partir_y_guardar/jobs/sse1/events')
    assert sse.status_code == 200
    assert b'event: progress' in sse.data


def test_generar_doc_worker_status_y_events(client, app_module, monkeypatch):
    app_module._generar_doc_jobs.clear()
    assert client.get('/api/grupos/generar_doc/jobs/nope').status_code == 404
    assert client.get('/api/grupos/generar_doc/jobs/nope/events').status_code == 404

    app_module._generar_doc_jobs['gdone'] = {'status': 'queued', 'done': 0, 'total': 1, 'message': '', 'result': None, 'error': None, 'http_status': None}
    monkeypatch.setattr(app_module, '_grupos_generar_doc_run', lambda idg, fmt, args, cb: ('ok', {'ok': True, 'grupo': idg}))
    app_module._grupos_generar_doc_async_worker('gdone', 4, 'word', {})
    assert app_module._generar_doc_jobs['gdone']['status'] == 'done'

    app_module._generar_doc_jobs['gerr'] = {'status': 'queued', 'done': 0, 'total': 1, 'message': '', 'result': None, 'error': None, 'http_status': None}
    monkeypatch.setattr(app_module, '_grupos_generar_doc_run', lambda idg, fmt, args, cb: ('err', 409, {'error': 'faltan'}))
    app_module._grupos_generar_doc_async_worker('gerr', 4, 'word', {})
    assert app_module._generar_doc_jobs['gerr']['status'] == 'error'
    assert app_module._generar_doc_jobs['gerr']['http_status'] == 409

    app_module._generar_doc_jobs['gboom'] = {'status': 'queued', 'done': 0, 'total': 1, 'message': '', 'result': None, 'error': None, 'http_status': None}
    def boom(*_a, **_k):
        raise RuntimeError('boom doc')
    monkeypatch.setattr(app_module, '_grupos_generar_doc_run', boom)
    app_module._grupos_generar_doc_async_worker('gboom', 4, 'word', {})
    assert app_module._generar_doc_jobs['gboom']['status'] == 'error'

    app_module._generar_doc_jobs['gsse'] = {'status': 'done', 'done': 1, 'total': 1, 'message': 'done', 'result': {'ok': True}, 'error': None}
    sse = client.get('/api/grupos/generar_doc/jobs/gsse/events')
    assert sse.status_code == 200
    assert b'event: progress' in sse.data

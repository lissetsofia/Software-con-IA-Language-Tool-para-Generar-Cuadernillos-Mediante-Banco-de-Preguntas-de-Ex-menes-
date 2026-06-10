import io
import os
import sqlite3


def _connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / "cov22_crud.sqlite3"
    if db_path.exists():
        db_path.unlink()
    uploads = tmp_path / "uploads"; uploads.mkdir(exist_ok=True)
    desc = tmp_path / "desc"; desc.mkdir(exist_ok=True)
    preguntas_dir = tmp_path / "temas_archivos"; preguntas_dir.mkdir(exist_ok=True)
    conn = _connect(db_path)
    conn.executescript(
        """
        CREATE TABLE usuarios(id INTEGER PRIMARY KEY, username TEXT, password TEXT);
        CREATE TABLE sesiones_app(token TEXT, username TEXT);
        CREATE TABLE examenes(
            idexamenes INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT, numero TEXT, institucion TEXT, anio INTEGER,
            archivo_nombre TEXT, archivo_ruta TEXT
        );
        CREATE TABLE temario(id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, activo INTEGER DEFAULT 1);
        CREATE TABLE preguntas(
            idpreguntas INTEGER PRIMARY KEY AUTOINCREMENT,
            examenes_idexamenes INTEGER, tema_id INTEGER, numero_p INTEGER,
            archivo_nombre TEXT, archivo_ruta TEXT
        );
        CREATE TABLE grupos(
            idgrupo INTEGER PRIMARY KEY AUTOINCREMENT,
            clave TEXT UNIQUE, nombre TEXT, activo INTEGER DEFAULT 1,
            fecha_creacion TEXT DEFAULT '2025-01-01'
        );
        CREATE TABLE grupo_tema(
            idgrupo_tema INTEGER PRIMARY KEY AUTOINCREMENT,
            grupos_idgrupo INTEGER, tema_id INTEGER, cantidad INTEGER, orden INTEGER DEFAULT 0,
            UNIQUE(grupos_idgrupo, tema_id)
        );
        INSERT INTO usuarios(id,username,password) VALUES(1,'admin','123');
        INSERT INTO temario(id,nombre,activo) VALUES(1,'Álgebra',1),(2,'Geometría',0);
        """
    )
    conn.commit(); conn.close()
    monkeypatch.setattr(app_module, "get_connection", lambda: _connect(db_path))
    monkeypatch.setitem(app_module.app.config, "UPLOAD_FOLDER", str(uploads))
    monkeypatch.setitem(app_module.app.config, "DESCARGAS_FOLDER", str(desc))
    monkeypatch.setitem(app_module.app.config, "PREGUNTAS_DIR", str(preguntas_dir))
    app_module.UPLOAD_DIR = str(uploads)
    app_module.DESCARGAS_DIR = str(desc)
    return db_path, uploads, desc, preguntas_dir


def test_login_session_logout_y_probar_conexion(client, app_module, tmp_path, monkeypatch):
    _patch_db(app_module, tmp_path, monkeypatch)

    assert client.get('/probar-conexion').get_json()['conexion'] == 'ok'
    assert client.get('/api/session').status_code == 401
    assert client.post('/login', json={'usuario': 'admin', 'clave': 'bad'}).status_code == 401

    ok = client.post('/login', json={'usuario': 'admin', 'clave': '123'})
    assert ok.status_code == 200
    token = ok.get_json()['token']

    ses = client.get('/api/session', headers={'Authorization': f'Bearer {token}'})
    assert ses.status_code == 200
    assert ses.get_json()['usuario'] == 'admin'

    assert client.post('/logout', headers={'Authorization': f'Bearer {token}'}).status_code == 200
    assert client.get('/api/session', headers={'Authorization': f'Bearer {token}'}).status_code == 401
    assert client.post('/logout').status_code == 200


def test_importar_exportar_nombre_y_eliminar_examen(client, app_module, tmp_path, monkeypatch):
    db_path, uploads, desc, preguntas_dir = _patch_db(app_module, tmp_path, monkeypatch)

    assert client.post('/api/importar_examen', data={}, content_type='multipart/form-data').status_code == 400
    bad_name = client.post(
        '/api/importar_examen',
        data={'archivo': (io.BytesIO(b'docx'), 'sin_formato.docx')},
        content_type='multipart/form-data',
    )
    assert bad_name.status_code == 400

    ok = client.post(
        '/api/importar_examen',
        data={'archivo': (io.BytesIO(b'docx'), 'examen admision I unamba 2025.docx')},
        content_type='multipart/form-data',
    )
    assert ok.status_code == 200
    dup = client.post(
        '/api/importar_examen',
        data={'archivo': (io.BytesIO(b'docx2'), 'examen admision I unamba 2025.docx')},
        content_type='multipart/form-data',
    )
    assert dup.status_code == 400

    assert client.get('/api/examen_nombre/1').get_json()['archivo_nombre'].endswith('.docx')
    assert client.get('/api/examen_nombre/999').status_code == 404
    assert client.get('/api/exportar_examen/1?formato=txt').status_code == 400
    assert client.get('/api/exportar_examen/999?formato=word').status_code == 404

    word = client.get('/api/exportar_examen/1?formato=word')
    assert word.status_code == 200

    def fake_pdf(src):
        out = tmp_path / 'fake.pdf'
        out.write_bytes(b'%PDF-1.4\n%%EOF')
        return str(out)
    monkeypatch.setattr(app_module, 'generar_pdf', fake_pdf)
    pdf = client.get('/api/exportar_examen/1?formato=pdf')
    assert pdf.status_code == 200
    assert pdf.data.startswith(b'%PDF')

    (preguntas_dir / 'examen_1').mkdir(exist_ok=True)
    conn = _connect(db_path)
    conn.execute("INSERT INTO preguntas(examenes_idexamenes,tema_id,numero_p,archivo_nombre,archivo_ruta) VALUES(1,1,1,'p.docx','x')")
    conn.commit(); conn.close()
    deleted = client.delete('/api/examenes/1')
    assert deleted.status_code == 200
    assert client.delete('/api/examenes/1').status_code == 404


def test_temas_y_grupos_crud_cuotas(client, app_module, tmp_path, monkeypatch):
    db_path, *_ = _patch_db(app_module, tmp_path, monkeypatch)

    assert len(client.get('/api/temas').get_json()) == 1
    assert len(client.get('/api/temas?all=1').get_json()) == 2
    assert client.post('/api/temas', json={}).status_code == 400
    assert client.post('/api/temas', json={'nombre': 'X' * 101}).status_code == 400
    created = client.post('/api/temas', json={'nombre': 'Biología'})
    assert created.status_code == 201
    assert client.post('/api/temas', json={'nombre': 'biología'}).status_code == 409
    tid = created.get_json()['id']
    assert client.put(f'/api/temas/{tid}', json={'nombre': 'Álgebra'}).status_code == 409
    assert client.put(f'/api/temas/{tid}', json={'nombre': 'Biología II'}).status_code == 200
    assert client.patch(f'/api/temas/{tid}/toggle').status_code == 200

    conn = _connect(db_path)
    conn.execute("INSERT INTO preguntas(tema_id,numero_p) VALUES(1,1)")
    conn.commit(); conn.close()
    assert client.delete('/api/temas/1').status_code == 409
    assert client.delete('/api/temas/1?force=1').status_code == 200

    assert client.post('/api/grupos', json={'nombre': 'Sin clave'}).status_code == 400
    assert client.post('/api/grupos', json={'clave': 'abcdeFG', 'nombre': 'N' * 101}).status_code == 400
    g = client.post('/api/grupos', json={'clave': ' a ', 'nombre': 'Grupo A', 'cuotas': [{'tema_id': 2, 'cantidad': 3}]})
    assert g.status_code == 200
    gid = g.get_json()['idgrupo']
    assert client.post('/api/grupos', json={'clave': 'A'}).status_code == 409
    assert client.get('/api/grupos').status_code == 200
    assert client.get(f'/api/grupos/{gid}/cuotas').status_code == 200
    assert client.get('/api/grupos/A/cuotas').status_code == 200
    assert client.put(f'/api/grupos/{gid}', json={}).status_code == 400
    assert client.put(f'/api/grupos/{gid}', json={'activo': 'x'}).status_code == 400
    assert client.put(f'/api/grupos/{gid}', json={'clave': 'B', 'nombre': 'Grupo B', 'activo': 0}).status_code == 200
    assert client.patch(f'/api/grupos/{gid}/toggle').status_code == 200
    assert client.put(f'/api/grupos/{gid}/cuotas', json={'cuotas': [{'tema_id': 2, 'cantidad': 4, 'orden': 7}]}).status_code == 200
    assert client.delete(f'/api/grupos/{gid}').status_code == 409
    assert client.delete(f'/api/grupos/{gid}?force=1').status_code == 200

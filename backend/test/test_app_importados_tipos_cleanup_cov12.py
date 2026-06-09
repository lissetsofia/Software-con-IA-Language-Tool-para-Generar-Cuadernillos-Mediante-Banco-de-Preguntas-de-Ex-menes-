import io
import os
import sqlite3
from pathlib import Path

from docx import Document as DocxDocument


def _connect(db_path: Path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _docx_bytes(text='examen'):
    bio = io.BytesIO()
    doc = DocxDocument()
    doc.add_paragraph(text)
    doc.save(bio)
    bio.seek(0)
    return bio


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / 'cov12_importados.sqlite3'

    def get_connection():
        return _connect(db_path)

    monkeypatch.setattr(app_module, 'get_connection', get_connection)
    uploads_exam = tmp_path / 'uploads_examenes'
    uploads_exam.mkdir(parents=True, exist_ok=True)
    app_module.app.config['UPLOADS_EXAM_DIR'] = str(uploads_exam)

    conn = _connect(db_path)
    cur = conn.cursor()
    cur.executescript('''
        CREATE TABLE examenes_importados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            ruta TEXT,
            extension TEXT,
            total_preguntas INTEGER DEFAULT 0,
            fuente TEXT,
            hash_archivo TEXT UNIQUE,
            fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE claves_tipo (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examen_id INTEGER,
            grupo_id INTEGER,
            codigo TEXT,
            orden INTEGER DEFAULT 0,
            activo INTEGER DEFAULT 1,
            UNIQUE(examen_id, grupo_id, codigo)
        );
        CREATE TABLE claves_respuesta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            examen_id INTEGER,
            grupo_id INTEGER,
            numero_pregunta INTEGER,
            origen TEXT,
            fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(examen_id, grupo_id, numero_pregunta)
        );
        CREATE TABLE claves_respuesta_detalle (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            claves_respuesta_id INTEGER,
            tipo_id INTEGER,
            clave TEXT,
            fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(claves_respuesta_id, tipo_id)
        );
    ''')
    conn.commit(); cur.close(); conn.close()
    return db_path, uploads_exam


def test_importar_examenes_tipos_y_limpieza(client, app_module, tmp_path, monkeypatch):
    _db, uploads_exam = _patch_db(app_module, tmp_path, monkeypatch)
    monkeypatch.setattr(app_module, 'contar_preguntas_docx', lambda _p: 3, raising=False)

    assert client.options('/api/examenes/importar').status_code == 204
    assert client.get('/api/examenes/importados').status_code == 200
    assert client.post('/api/examenes/importar', data={}).status_code == 400

    bad = client.post('/api/examenes/importar', data={
        'files': (io.BytesIO(b'bad'), 'no_permitido.txt'),
    }, content_type='multipart/form-data')
    assert bad.status_code == 415

    ok = client.post('/api/examenes/importar', data={
        'files': (_docx_bytes('1. pregunta'), 'grupo_A.docx'),
    }, content_type='multipart/form-data')
    assert ok.status_code == 200, ok.get_data(as_text=True)
    item = ok.get_json()['items'][0]
    assert item['total_preguntas'] == 3

    # Repetir el mismo contenido cubre el ON CONFLICT(hash_archivo).
    ok2 = client.post('/api/examenes/importar', data={
        'files[]': (_docx_bytes('1. pregunta'), 'grupo_A_copia.docx'),
    }, content_type='multipart/form-data')
    assert ok2.status_code == 200

    missing = client.get('/api/temas/tipos')
    assert missing.status_code == 400

    assert client.get('/api/temas/tipos?examen_id=1&grupo_id=1').status_code == 200
    assert client.post('/api/temas/tipos', json={}).status_code == 400

    created = client.post('/api/temas/tipos', json={'examen_id': 1, 'grupo_id': 1, 'codigo': ' p '})
    assert created.status_code == 200, created.get_data(as_text=True)
    tipo_id = created.get_json()['id']
    assert created.get_json()['codigo'] == 'P'

    assert client.post(f'/api/temas/tipos/{tipo_id}/toggle', json={'activo': 0}).status_code == 200
    # Crearlo de nuevo debe reactivarlo si estaba inactivo.
    reactivated = client.post('/api/temas/tipos', json={'examen_id': 1, 'grupo_id': 1, 'codigo': 'P'})
    assert reactivated.status_code == 200
    assert reactivated.get_json()['id'] == tipo_id

    renamed = client.post(f'/api/temas/tipos/{tipo_id}/rename', json={'codigo': 'q'})
    assert renamed.status_code == 200
    assert renamed.get_json()['codigo'] == 'Q'
    assert client.post(f'/api/temas/tipos/{tipo_id}/rename', json={'codigo': 'mal codigo'}).status_code == 400

    imported = client.get('/api/examenes/importados').get_json()
    assert len(imported) >= 1
    delete_keep = client.delete(f"/api/examenes/importados/{imported[0]['id']}?delete_file=0")
    assert delete_keep.status_code in (200, 404)

    # Vuelve a crear uno y prueba limpieza completa.
    left_file = uploads_exam / 'sobrante.docx'
    left_file.write_bytes(b'sobrante')
    conn = app_module.get_connection(); cur = conn.cursor()
    cur.execute("INSERT INTO examenes_importados(nombre, ruta, extension, total_preguntas, fuente, hash_archivo) VALUES (?,?,?,?,?,?)",
                ('sobrante.docx', str(left_file), 'docx', 1, 'upload', 'hash-sobrante'))
    conn.commit(); cur.close(); conn.close()

    clean = client.post('/api/examenes/importados/limpiar')
    assert clean.status_code == 200
    assert clean.get_json()['ok'] is True
    assert not left_file.exists()
    assert client.get('/api/examenes/importados').get_json() == []

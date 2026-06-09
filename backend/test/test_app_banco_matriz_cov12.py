import io
import os
import sqlite3
from pathlib import Path

from docx import Document as DocxDocument


def _connect(db_path: Path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _docx_bytes(text='contenido'):
    bio = io.BytesIO()
    doc = DocxDocument()
    doc.add_paragraph(text)
    doc.save(bio)
    bio.seek(0)
    return bio


def _patch_db(app_module, tmp_path, monkeypatch):
    db_path = tmp_path / 'cov12_banco_matriz.sqlite3'

    def get_connection():
        return _connect(db_path)

    monkeypatch.setattr(app_module, 'get_connection', get_connection)

    banco_preg = tmp_path / 'banco_preguntas'
    banco_sol = tmp_path / 'banco_solucionarios'
    descargas = tmp_path / 'descargas'
    uploads = tmp_path / 'uploads'
    for p in (banco_preg, banco_sol, descargas, uploads):
        p.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(app_module, 'BANCO_PREG_DIR', str(banco_preg), raising=False)
    monkeypatch.setattr(app_module, 'BANCO_SOL_DIR', str(banco_sol), raising=False)
    monkeypatch.setattr(app_module, 'DESCARGAS_DIR', str(descargas), raising=False)
    app_module.app.config['DESCARGAS_FOLDER'] = str(descargas)
    app_module.app.config['UPLOAD_FOLDER'] = str(uploads)

    conn = _connect(db_path)
    cur = conn.cursor()
    cur.executescript('''
        CREATE TABLE temario (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            activo INTEGER DEFAULT 1
        );
        CREATE TABLE tema_docs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tema_id INTEGER,
            doc_preguntas_nombre TEXT,
            doc_preguntas_ruta TEXT,
            doc_sol_nombre TEXT,
            doc_sol_ruta TEXT,
            fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE preguntas (
            idpreguntas INTEGER PRIMARY KEY AUTOINCREMENT,
            examenes_idexamenes INTEGER NULL,
            tema_id INTEGER,
            numero_p INTEGER,
            archivo_nombre TEXT,
            archivo_ruta TEXT
        );
        CREATE TABLE matriz (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE matriz_detalle (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            matriz_id INTEGER,
            tema_id INTEGER,
            cantidad INTEGER DEFAULT 0,
            orden INTEGER DEFAULT 0,
            archivo_ruta TEXT,
            UNIQUE(matriz_id, tema_id)
        );
    ''')
    cur.execute("INSERT INTO temario(nombre, activo) VALUES ('Álgebra', 1)")
    tema_id = int(cur.lastrowid)
    conn.commit()
    cur.close(); conn.close()
    return db_path, tema_id, descargas


def test_banco_preguntas_crud_preview_descargas(client, app_module, tmp_path, monkeypatch):
    _db, tema_id, descargas = _patch_db(app_module, tmp_path, monkeypatch)

    monkeypatch.setattr(app_module, 'contar_preguntas_docx', lambda _p: 1, raising=False)
    monkeypatch.setattr(app_module, '_validar_docx_real', lambda _p: None, raising=False)

    def fake_pdf_preview(path, nombre_base=None):
        pdf = Path(descargas) / f"{nombre_base or Path(path).stem}.pdf"
        pdf.write_bytes(b'%PDF-1.4\n%%EOF')
        return str(pdf)

    monkeypatch.setattr(app_module, 'generar_pdf_preview', fake_pdf_preview, raising=False)

    assert client.get('/api/banco_preguntas').status_code == 200
    assert client.post('/api/banco_preguntas', data={}).status_code == 400

    r = client.post('/api/banco_preguntas', data={
        'tema_id': str(tema_id),
        'doc_preguntas': (_docx_bytes('1. Pregunta del banco'), 'pregunta.docx'),
    }, content_type='multipart/form-data')
    assert r.status_code == 200, r.get_data(as_text=True)
    assert r.get_json()['ok'] is True

    lista = client.get('/api/banco_preguntas').get_json()
    assert len(lista) == 1
    banco_id = lista[0]['id']

    prev = client.get(f'/api/banco_preguntas/{banco_id}/preview')
    assert prev.status_code == 200
    assert prev.get_json()['ok'] is True

    sol = client.post('/api/banco_preguntas/solucionario', data={
        'tema_id': str(tema_id),
        'doc_solucionario': (_docx_bytes('Solución'), 'solucionario.docx'),
    }, content_type='multipart/form-data')
    assert sol.status_code == 200, sol.get_data(as_text=True)

    assert client.get(f'/api/banco_preguntas/{banco_id}/download/preguntas').status_code == 200
    assert client.get(f'/api/banco_preguntas/{banco_id}/download/solucionario').status_code == 200
    assert client.get(f'/api/banco_preguntas/{banco_id}/download').status_code == 200

    edit = client.put(f'/api/banco_preguntas/{banco_id}', json={'tema_id': tema_id})
    assert edit.status_code == 200

    rep_p = client.post(f'/api/banco_preguntas/{banco_id}/reemplazar/preguntas', data={
        'doc_preguntas': (_docx_bytes('1. Nueva pregunta'), 'pregunta_nueva.docx'),
    }, content_type='multipart/form-data')
    assert rep_p.status_code == 200, rep_p.get_data(as_text=True)

    rep_s = client.post(f'/api/banco_preguntas/{banco_id}/reemplazar/solucionario', data={
        'doc_solucionario': (_docx_bytes('Nueva solución'), 'sol_nueva.docx'),
    }, content_type='multipart/form-data')
    assert rep_s.status_code == 200, rep_s.get_data(as_text=True)

    deleted = client.delete(f'/api/banco_preguntas/{banco_id}')
    assert deleted.status_code == 200
    assert deleted.get_json()['ok'] is True
    assert client.get(f'/api/banco_preguntas/{banco_id}/download').status_code == 404


def test_matriz_crud_upload_y_detalle(client, app_module, tmp_path, monkeypatch):
    _db, tema_id, _descargas = _patch_db(app_module, tmp_path, monkeypatch)
    monkeypatch.setattr(app_module, '_validar_docx_real', lambda _p: None, raising=False)

    assert client.post('/api/matriz', json={'nombre': 'sin items', 'items': []}).status_code == 400
    assert client.post('/api/matriz', json={'items': [{'tema_id': 'x', 'cantidad': 1}]}).status_code == 400

    created = client.post('/api/matriz', json={
        'nombre': 'Matriz de prueba',
        'items': [{'tema_id': tema_id, 'cantidad': 2, 'orden': 1}],
    })
    assert created.status_code == 200, created.get_data(as_text=True)
    mid = created.get_json()['matriz_id']

    listed = client.get('/api/matriz?detail=1&search=Matriz')
    assert listed.status_code == 200
    assert listed.get_json()[0]['items'][0]['tema_id'] == tema_id

    got = client.get(f'/api/matriz/{mid}')
    assert got.status_code == 200
    assert got.get_json()['n_items'] == 1
    assert client.get('/api/matriz/9999').status_code == 404

    assert client.post(f'/api/matriz/{mid}/upload', data={}).status_code == 400
    bad_ext = client.post(f'/api/matriz/{mid}/upload', data={
        'tema_id': str(tema_id),
        'file': (io.BytesIO(b'txt'), 'archivo.txt'),
    }, content_type='multipart/form-data')
    assert bad_ext.status_code == 400

    up = client.post(f'/api/matriz/{mid}/upload', data={
        'tema_id': str(tema_id),
        'cantidad': '5',
        'file': (_docx_bytes('documento matriz'), 'tema.docx'),
    }, content_type='multipart/form-data')
    assert up.status_code == 200, up.get_data(as_text=True)
    assert up.get_json()['ok'] is True

    got2 = client.get(f'/api/matriz/{mid}').get_json()
    assert got2['n_archivos_subidos'] == 1
    assert got2['items'][0]['cantidad'] == 5

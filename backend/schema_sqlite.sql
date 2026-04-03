PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS examenes (
    idexamenes INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    numero TEXT,
    institucion TEXT,
    anio INTEGER,
    archivo_nombre TEXT,
    fecha_registro TEXT DEFAULT CURRENT_TIMESTAMP,
    archivo_ruta TEXT
);

CREATE TABLE IF NOT EXISTS examenes_importados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    ruta TEXT NOT NULL,
    extension TEXT NOT NULL,
    total_preguntas INTEGER NOT NULL DEFAULT 0,
    fuente TEXT,
    hash_archivo TEXT UNIQUE,
    fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS grupos (
    idgrupo INTEGER PRIMARY KEY AUTOINCREMENT,
    clave TEXT NOT NULL UNIQUE,
    nombre TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS temario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS matriz (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gen_lote (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matriz_id INTEGER,
    nombre TEXT NOT NULL,
    usuario TEXT,
    fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (matriz_id) REFERENCES matriz(id) ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS grupo_tema (
    idgrupo_tema INTEGER PRIMARY KEY AUTOINCREMENT,
    grupos_idgrupo INTEGER NOT NULL,
    tema_id INTEGER NOT NULL,
    cantidad INTEGER NOT NULL,
    orden INTEGER NOT NULL DEFAULT 0,
    UNIQUE(grupos_idgrupo, tema_id),
    FOREIGN KEY (grupos_idgrupo) REFERENCES grupos(idgrupo) ON DELETE CASCADE,
    FOREIGN KEY (tema_id) REFERENCES temario(id)
);

CREATE TABLE IF NOT EXISTS matriz_detalle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matriz_id INTEGER NOT NULL,
    tema_id INTEGER NOT NULL,
    cantidad INTEGER NOT NULL DEFAULT 0,
    archivo_ruta TEXT,
    UNIQUE(matriz_id, tema_id),
    FOREIGN KEY (matriz_id) REFERENCES matriz(id) ON DELETE CASCADE,
    FOREIGN KEY (tema_id) REFERENCES temario(id)
);

CREATE TABLE IF NOT EXISTS preguntas (
    idpreguntas INTEGER PRIMARY KEY AUTOINCREMENT,
    examenes_idexamenes INTEGER,
    tema_id INTEGER,
    numero_p INTEGER,
    archivo_nombre TEXT,
    archivo_ruta TEXT NOT NULL,
    fecha_registro TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(examenes_idexamenes, tema_id, numero_p),
    FOREIGN KEY (examenes_idexamenes) REFERENCES examenes(idexamenes) ON DELETE SET NULL,
    FOREIGN KEY (tema_id) REFERENCES temario(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tema_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tema_id INTEGER NOT NULL,
    doc_preguntas_nombre TEXT NOT NULL,
    doc_preguntas_ruta TEXT NOT NULL,
    doc_sol_nombre TEXT,
    doc_sol_ruta TEXT,
    fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuarios (
    idusuarios INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    password TEXT NOT NULL
);

-- Tokens de sesión (app de escritorio / Electron)
CREATE TABLE IF NOT EXISTS sesiones_app (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sesiones_app_username ON sesiones_app(username);

CREATE TABLE IF NOT EXISTS claves_tipo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    examen_id INTEGER NOT NULL,
    grupo_id INTEGER NOT NULL,
    codigo TEXT NOT NULL,
    orden INTEGER NOT NULL DEFAULT 1,
    activo INTEGER NOT NULL DEFAULT 1,
    fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(examen_id, grupo_id, codigo)
);

CREATE TABLE IF NOT EXISTS claves_respuesta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    examen_id INTEGER NOT NULL,
    grupo_id INTEGER NOT NULL,
    numero_pregunta INTEGER NOT NULL,
    origen TEXT NOT NULL,
    fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TEXT,
    UNIQUE(examen_id, grupo_id, numero_pregunta),
    FOREIGN KEY (examen_id) REFERENCES examenes_importados(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (grupo_id) REFERENCES grupos(idgrupo) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS claves_respuesta_detalle (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claves_respuesta_id INTEGER NOT NULL,
    tipo_id INTEGER NOT NULL,
    clave TEXT NOT NULL CHECK (clave IN ('A','B','C','D','E')),
    fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(claves_respuesta_id, tipo_id),
    FOREIGN KEY (claves_respuesta_id) REFERENCES claves_respuesta(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (tipo_id) REFERENCES claves_tipo(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS gen_examen_grupo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gen_lote_id INTEGER NOT NULL,
    grupos_idgrupo INTEGER NOT NULL,
    clave_cache TEXT,
    nombre_cache TEXT,
    total_preguntas INTEGER NOT NULL DEFAULT 0,
    archivo_nombre TEXT,
    archivo_ruta TEXT,
    fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (gen_lote_id) REFERENCES gen_lote(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (grupos_idgrupo) REFERENCES grupos(idgrupo) ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_claves_grupo
ON claves_respuesta(grupo_id);

CREATE INDEX IF NOT EXISTS idx_cr
ON claves_respuesta_detalle(claves_respuesta_id);

CREATE INDEX IF NOT EXISTS idx_tipo_det
ON claves_respuesta_detalle(tipo_id);

CREATE INDEX IF NOT EXISTS idx_tipo
ON claves_tipo(examen_id, grupo_id, activo, orden);

CREATE INDEX IF NOT EXISTS idx_geng_lote
ON gen_examen_grupo(gen_lote_id);

CREATE INDEX IF NOT EXISTS idx_geng_grupo
ON gen_examen_grupo(grupos_idgrupo);

CREATE INDEX IF NOT EXISTS idx_preguntas_examen_temaid
ON preguntas(examenes_idexamenes, tema_id);

CREATE INDEX IF NOT EXISTS idx_preguntas_temaid_num
ON preguntas(tema_id, numero_p);

CREATE INDEX IF NOT EXISTS idx_preguntas_examen
ON preguntas(examenes_idexamenes);

CREATE INDEX IF NOT EXISTS idx_preguntas_tema
ON preguntas(tema_id);

INSERT OR IGNORE INTO usuarios (idusuarios, username, password)
VALUES (0, 'admin', '1234');

INSERT OR IGNORE INTO grupos (idgrupo, clave, nombre, activo, fecha_creacion) VALUES
(1, 'A', 'Ingenierías', 1, '2025-09-23 22:11:37'),
(2, 'B', 'Biomédicas', 1, '2025-09-23 22:57:19'),
(5, 'C', 'Sociales', 1, '2025-09-26 17:36:05');


INSERT OR IGNORE INTO temario (id, nombre, activo) VALUES
(1, 'MATEMÁTICA I',1 ),
(2, 'ARITMÉTICA', 1),
(3, 'COMPETENCIA LINGÜÍSTICA', 1),
(4, 'ÁLGEBRA', 1),
(5, 'TRIGONOMETRÍA', 1),
(6, 'GEOMETRÍA', 1),
(7, 'RAZONAMIENTO MATEMÁTICA', 1),
(8, 'FÍSICA', 1),
(9, 'QUÍMICA', 1),
(10, 'BIOLOGÍA', 1),
(11, 'ZOOLOGÍA', 1),
(12, 'ECOLOGÍA Y MEDIO AMBIENTE', 1),
(13, 'EDUCACÍON CÍVICA', 1),
(14, 'GEOGRAFÍA DEL PERÚ Y EL MUNDO', 1),
(15, 'HISTORIA DEL PERÚ EN EL CONTEXTO MUNDIAL', 1),
(16, 'ECONOMÍA', 1),
(17, 'COMUNICACIÓN', 1),
(18, 'RAZONAMIENTO VERBAL', 1),
(19, 'LITERATURA', 1);


# backend/test/test_temas_grupos_banco.py
import pytest


# =========================
# Fakes (simulan MySQL)
# =========================
class FakeCursor:
    def __init__(self, fetchall_return=None, fetchone_return=None, lastrowid=1):
        self.fetchall_return = fetchall_return if fetchall_return is not None else []
        self.fetchone_return = fetchone_return
        self.lastrowid = lastrowid
        self.calls = []  # guarda (query, params)

    def execute(self, query, params=None):
        self.calls.append((query, params))

    def fetchall(self):
        return self.fetchall_return

    def fetchone(self):
        return self.fetchone_return

    def close(self):
        pass


class FakeConn:
    def __init__(self, cursor: FakeCursor):
        self._cursor = cursor
        self.commits = 0
        self.closed = False

    def cursor(self, dictionary=False):
        # en tu app a veces usas dictionary=True; aquí no cambia nada
        return self._cursor

    def commit(self):
        self.commits += 1

    def close(self):
        self.closed = True


# =========================
# “Servicios” (lógica a testear)
# (copian el comportamiento de tus endpoints)
# =========================
def api_temas_listar(get_connection):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT ... FROM temario t LEFT JOIN preguntas_test p ON ... GROUP BY ... ORDER BY ...")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return 200, rows, cur


def api_temas_crear(data, get_connection):
    data = data or {}
    nombre = data.get("nombre")
    if not nombre:
        return 400, {"error": "Falta nombre"}, None

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("INSERT INTO temario (nombre, activo) VALUES (%s, 1)", (nombre,))
    idtema = cur.lastrowid
    conn.commit()
    cur.close()
    conn.close()
    return 201, {"exito": True, "idtema": idtema}, cur


def api_temas_editar(tema_id, data, get_connection):
    data = data or {}
    nombre = data.get("nombre")
    if not nombre:
        return 400, {"error": "Falta nombre"}, None

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE temario SET nombre=%s WHERE id=%s", (nombre, tema_id))
    conn.commit()
    cur.close()
    conn.close()
    return 200, {"exito": True}, cur


def api_temas_toggle(tema_id, get_connection):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE temario SET activo = NOT activo WHERE id=%s", (tema_id,))
    conn.commit()
    cur.close()
    conn.close()
    return 200, {"exito": True}, cur


def api_temas_cuad(get_connection):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT id AS idtema, nombre FROM temario WHERE activo=1 ORDER BY nombre")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return 200, rows, cur


def api_resumen_temas(get_connection):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT tema_id, tema_nombre, n_docs, n_docs_con_sol FROM ...")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return 200, rows, cur


def _sanitize_clave(clave: str) -> str:
    return (clave or "").strip().upper()[:5]


def api_grupos_listar(include_all: bool, get_connection):
    conn = get_connection()
    cur = conn.cursor(dictionary=True)
    sql = (
        "SELECT g.idgrupo, g.clave, g.nombre, g.activo, "
        "IFNULL(SUM(gt.cantidad),0) AS total_preguntas "
        "FROM grupos g LEFT JOIN grupo_tema gt ON g.idgrupo = gt.idgrupo"
    )
    if not include_all:
        sql += " WHERE g.activo=1"
    sql += " GROUP BY g.idgrupo ORDER BY g.idgrupo DESC"

    cur.execute(sql)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return 200, rows, cur


def api_grupos_crear(data, get_connection):
    data = data or {}
    clave = _sanitize_clave(data.get("clave"))
    nombre = (data.get("nombre") or "").strip()
    cuotas = data.get("cuotas") or []

    if not clave or not nombre:
        return 400, {"error": "Faltan clave o nombre"}, None, 0

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("INSERT INTO grupos (clave, nombre, activo) VALUES (%s,%s,1)", (clave, nombre))
    idgrupo = cur.lastrowid

    for c in cuotas:
        idtema = int(c.get("idtema"))
        cantidad = int(c.get("cantidad", 0))
        cur.execute(
            "INSERT INTO grupo_tema (idgrupo, idtema, cantidad) VALUES (%s,%s,%s)",
            (idgrupo, idtema, cantidad),
        )

    conn.commit()
    cur.close()
    conn.close()
    return 201, {"exito": True, "idgrupo": idgrupo}, cur, 1


# =========================
# TESTS
# =========================
def test_temas_listar_ok():
    fake_cur = FakeCursor(fetchall_return=[{"id": 1, "nombre": "Álgebra", "activo": 1, "n_preguntas": 10}])
    fake_conn = FakeConn(fake_cur)
    status, rows, cur = api_temas_listar(lambda: fake_conn)

    assert status == 200
    assert isinstance(rows, list)
    assert rows[0]["nombre"] == "Álgebra"
    assert "FROM temario" in cur.calls[0][0]


def test_temas_crear_ok():
    fake_cur = FakeCursor(lastrowid=7)
    fake_conn = FakeConn(fake_cur)
    status, payload, cur = api_temas_crear({"nombre": "Geometría"}, lambda: fake_conn)

    assert status == 201
    assert payload["exito"] is True
    assert payload["idtema"] == 7
    assert "INSERT INTO temario" in cur.calls[0][0]
    assert fake_conn.commits == 1


def test_temas_crear_falta_nombre():
    status, payload, cur = api_temas_crear({}, lambda: None)
    assert status == 400
    assert payload["error"] == "Falta nombre"
    assert cur is None


def test_temas_editar_ok():
    fake_cur = FakeCursor()
    fake_conn = FakeConn(fake_cur)
    status, payload, cur = api_temas_editar(5, {"nombre": "Aritmética"}, lambda: fake_conn)

    assert status == 200
    assert payload["exito"] is True
    assert "UPDATE temario" in cur.calls[0][0]
    assert cur.calls[0][1] == ("Aritmética", 5)
    assert fake_conn.commits == 1


def test_temas_editar_falta_nombre():
    status, payload, cur = api_temas_editar(5, {}, lambda: None)
    assert status == 400
    assert payload["error"] == "Falta nombre"
    assert cur is None


def test_temas_toggle_ok():
    fake_cur = FakeCursor()
    fake_conn = FakeConn(fake_cur)
    status, payload, cur = api_temas_toggle(9, lambda: fake_conn)

    assert status == 200
    assert payload["exito"] is True
    assert "NOT activo" in cur.calls[0][0]
    assert cur.calls[0][1] == (9,)
    assert fake_conn.commits == 1


def test_temas_cuad_ok():
    fake_cur = FakeCursor(fetchall_return=[{"idtema": 1, "nombre": "Biología"}])
    fake_conn = FakeConn(fake_cur)
    status, rows, cur = api_temas_cuad(lambda: fake_conn)

    assert status == 200
    assert rows[0]["idtema"] == 1
    assert "WHERE activo=1" in cur.calls[0][0]


def test_resumen_temas_ok():
    fake_cur = FakeCursor(fetchall_return=[{"tema_id": 1, "tema_nombre": "Historia", "n_docs": 20, "n_docs_con_sol": 5}])
    fake_conn = FakeConn(fake_cur)
    status, rows, cur = api_resumen_temas(lambda: fake_conn)

    assert status == 200
    assert rows[0]["n_docs"] == 20
    assert "SELECT tema_id" in cur.calls[0][0]


def test_grupos_listar_filtra_activo_por_defecto():
    fake_cur = FakeCursor(fetchall_return=[])
    fake_conn = FakeConn(fake_cur)
    status, rows, cur = api_grupos_listar(False, lambda: fake_conn)

    assert status == 200
    assert "WHERE g.activo=1" in cur.calls[0][0]


def test_grupos_listar_include_all_no_filtra():
    fake_cur = FakeCursor(fetchall_return=[])
    fake_conn = FakeConn(fake_cur)
    status, rows, cur = api_grupos_listar(True, lambda: fake_conn)

    assert status == 200
    assert "WHERE g.activo=1" not in cur.calls[0][0]


def test_grupos_crear_ok_con_cuotas():
    fake_cur = FakeCursor(lastrowid=12)
    fake_conn = FakeConn(fake_cur)

    data = {
        "clave": " a1 ",
        "nombre": "Grupo A",
        "cuotas": [{"idtema": 3, "cantidad": 10}, {"idtema": 4, "cantidad": 5}],
    }
    status, payload, cur, commits = api_grupos_crear(data, lambda: fake_conn)

    assert status == 201
    assert payload["exito"] is True
    assert payload["idgrupo"] == 12

    # 1 insert de grupo + 2 inserts de cuotas
    assert len(cur.calls) == 3
    assert "INSERT INTO grupos" in cur.calls[0][0]
    assert cur.calls[0][1] == ("A1", "Grupo A")  # sanitizado + strip
    assert fake_conn.commits == 1
    assert commits == 1


def test_grupos_crear_faltan_campos():
    status, payload, cur, commits = api_grupos_crear({"clave": "A"}, lambda: None)
    assert status == 400
    assert payload["error"] == "Faltan clave o nombre"
    assert cur is None
    assert commits == 0

# backend/test/test_app_routes_basicas.py
from collections import deque


class FakeCursor:
    def __init__(
        self,
        *,
        fetchone=None,
        fetchall=None,
        description=None,
        lastrowid=10,
    ):
        self.fetchone_values = deque(fetchone or [])
        self.fetchall_values = deque(fetchall or [])
        self.description = description or []
        self.lastrowid = lastrowid
        self.calls = []
        self.closed = False

    def execute(self, query, params=None):
        self.calls.append((query, params))

    def fetchone(self):
        return self.fetchone_values.popleft() if self.fetchone_values else None

    def fetchall(self):
        return self.fetchall_values.popleft() if self.fetchall_values else []

    def close(self):
        self.closed = True


class FakeConn:
    def __init__(self, *cursors):
        self.cursors = deque(cursors)
        self.used = []
        self.commits = 0
        self.rollbacks = 0
        self.closed = False

    def cursor(self, *args, **kwargs):
        cur = self.cursors.popleft() if self.cursors else FakeCursor()
        self.used.append(cur)
        return cur

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closed = True


def patch_conn(monkeypatch, app_module, conn):
    monkeypatch.setattr(app_module, "get_connection", lambda: conn)
    return conn


def rows_description(*cols):
    return [(c,) for c in cols]


def test_login_ok_crea_sesion(client, app_module, monkeypatch):
    cur = FakeCursor(fetchone=[(1, "admin", "1234")])
    conn = patch_conn(monkeypatch, app_module, FakeConn(cur))
    monkeypatch.setattr(app_module.secrets, "token_urlsafe", lambda n: "token-fijo")

    r = client.post("/login", json={"usuario": "admin", "clave": "1234"})

    assert r.status_code == 200
    data = r.get_json()
    assert data["status"] == "ok"
    assert data["token"] == "token-fijo"
    assert conn.commits == 1
    assert "INSERT INTO sesiones_app" in cur.calls[1][0]


def test_login_credenciales_invalidas(client, app_module, monkeypatch):
    cur = FakeCursor(fetchone=[None])
    patch_conn(monkeypatch, app_module, FakeConn(cur))

    r = client.post("/login", json={"usuario": "x", "clave": "y"})

    assert r.status_code == 401
    assert r.get_json()["status"] == "error"


def test_api_session_sin_token_y_con_token(client, app_module, monkeypatch):
    assert client.get("/api/session").status_code == 401

    cur = FakeCursor(fetchone=[("admin",)])
    patch_conn(monkeypatch, app_module, FakeConn(cur))
    r = client.get("/api/session", headers={"Authorization": "Bearer t1"})

    assert r.status_code == 200
    assert r.get_json()["usuario"] == "admin"


def test_logout_elimina_token_si_llega_authorization(client, app_module, monkeypatch):
    cur = FakeCursor()
    conn = patch_conn(monkeypatch, app_module, FakeConn(cur))

    r = client.post("/logout", headers={"Authorization": "Bearer t1"})

    assert r.status_code == 200
    assert r.get_json()["status"] == "ok"
    assert conn.commits == 1
    assert "DELETE FROM sesiones_app" in cur.calls[0][0]


def test_probar_conexion_ok(client, app_module, monkeypatch):
    cur = FakeCursor(fetchone=[("usuarios",)])
    patch_conn(monkeypatch, app_module, FakeConn(cur))

    r = client.get("/probar-conexion")

    assert r.status_code == 200
    assert r.get_json()["conexion"] == "ok"


def test_temas_listar_activos_y_todos(client, app_module, monkeypatch):
    cur = FakeCursor(
        fetchall=[
            [(1, "Álgebra", 1, 5)],
        ],
        description=rows_description("id", "nombre", "activo", "n_preguntas"),
    )
    patch_conn(monkeypatch, app_module, FakeConn(cur))

    r = client.get("/api/temas")

    assert r.status_code == 200
    assert r.get_json()[0]["nombre"] == "Álgebra"
    assert "WHERE t.activo = 1" in cur.calls[0][0]

    cur2 = FakeCursor(fetchall=[[]], description=rows_description("id", "nombre", "activo", "n_preguntas"))
    patch_conn(monkeypatch, app_module, FakeConn(cur2))
    r2 = client.get("/api/temas?all=1")
    assert r2.status_code == 200
    assert "WHERE t.activo = 1" not in cur2.calls[0][0]


def test_temas_crear_validaciones_y_ok(client, app_module, monkeypatch):
    assert client.post("/api/temas", json={}).status_code == 400

    cur_dup = FakeCursor(fetchone=[(1,)])
    patch_conn(monkeypatch, app_module, FakeConn(cur_dup))
    assert client.post("/api/temas", json={"nombre": "Álgebra"}).status_code == 409

    cur_ok = FakeCursor(fetchone=[None], lastrowid=22)
    conn = patch_conn(monkeypatch, app_module, FakeConn(cur_ok))
    r = client.post("/api/temas", json={"nombre": "Geometría"})

    assert r.status_code == 201
    assert r.get_json()["id"] == 22
    assert conn.commits == 1


def test_temas_editar_toggle_y_eliminar(client, app_module, monkeypatch):
    assert client.put("/api/temas/5", json={}).status_code == 400

    cur_edit = FakeCursor(fetchone=[None])
    patch_conn(monkeypatch, app_module, FakeConn(cur_edit))
    assert client.put("/api/temas/5", json={"nombre": "Aritmética"}).status_code == 200
    assert "UPDATE temario" in cur_edit.calls[-1][0]

    cur_toggle = FakeCursor()
    patch_conn(monkeypatch, app_module, FakeConn(cur_toggle))
    assert client.patch("/api/temas/5/toggle").status_code == 200

    cur_block = FakeCursor(fetchone=[(3,)])
    patch_conn(monkeypatch, app_module, FakeConn(cur_block))
    assert client.delete("/api/temas/5").status_code == 409

    cur_force = FakeCursor(fetchone=[(3,)])
    patch_conn(monkeypatch, app_module, FakeConn(cur_force))
    assert client.delete("/api/temas/5?force=1").status_code == 200
    assert any("DELETE FROM preguntas" in q for q, _ in cur_force.calls)


def test_grupos_crear_editar_toggle_eliminar(client, app_module, monkeypatch):
    assert client.post("/api/grupos", json={}).status_code == 400

    cur_ok = FakeCursor(fetchone=[None], lastrowid=7)
    conn = patch_conn(monkeypatch, app_module, FakeConn(cur_ok))
    r = client.post(
        "/api/grupos",
        json={
            "clave": " grupoA ",
            "nombre": "Grupo A",
            "cuotas": [{"tema_id": 1, "cantidad": 10}, {"tema_id": 2, "cantidad": 0}],
        },
    )

    assert r.status_code == 200
    assert r.get_json()["idgrupo"] == 7
    assert conn.commits == 1
    assert cur_ok.calls[1][1] == ("GRUPO", "Grupo A")

    assert client.put("/api/grupos/7", json={}).status_code == 400
    assert client.put("/api/grupos/7", json={"activo": "x"}).status_code == 400

    cur_edit = FakeCursor(fetchone=[None])
    patch_conn(monkeypatch, app_module, FakeConn(cur_edit))
    assert client.put("/api/grupos/7", json={"clave": "B", "nombre": "Grupo B", "activo": 1}).status_code == 200

    cur_toggle = FakeCursor()
    patch_conn(monkeypatch, app_module, FakeConn(cur_toggle))
    assert client.patch("/api/grupos/7/toggle").status_code == 200

    cur_block = FakeCursor(fetchone=[(2,)])
    patch_conn(monkeypatch, app_module, FakeConn(cur_block))
    assert client.delete("/api/grupos/7").status_code == 409

    cur_force = FakeCursor(fetchone=[(2,)])
    patch_conn(monkeypatch, app_module, FakeConn(cur_force))
    assert client.delete("/api/grupos/7?force=1").status_code == 200
    assert any("DELETE FROM grupo_tema" in q for q, _ in cur_force.calls)


def test_grupo_cuotas_get_put(client, app_module, monkeypatch):
    cur_get = FakeCursor(
        fetchall=[[(1, "Álgebra", 10, 1)]],
        description=rows_description("tema_id", "tema", "cantidad", "orden"),
    )
    patch_conn(monkeypatch, app_module, FakeConn(cur_get))
    r = client.get("/api/grupos/7/cuotas")
    assert r.status_code == 200
    assert r.get_json()[0]["tema"] == "Álgebra"

    cur_put = FakeCursor()
    conn = patch_conn(monkeypatch, app_module, FakeConn(cur_put))
    r2 = client.put(
        "/api/grupos/7/cuotas",
        json={"cuotas": [{"tema_id": 1, "cantidad": 10, "orden": 2}]},
    )
    assert r2.status_code == 200
    assert r2.get_json()["status"] == "ok"
    assert conn.commits == 1


def test_tipos_endpoint_validaciones_y_crud(client, app_module, monkeypatch):
    assert client.get("/api/temas/tipos").status_code == 400
    assert client.post("/api/temas/tipos", json={}).status_code == 400

    cur_list = FakeCursor(
        fetchall=[[(1, "P", 1, 1)]],
        description=rows_description("id", "codigo", "orden", "activo"),
    )
    patch_conn(monkeypatch, app_module, FakeConn(cur_list))
    r = client.get("/api/temas/tipos?examen_id=1&grupo_id=2")
    assert r.status_code == 200
    assert r.get_json()["tipos"][0]["codigo"] == "P"

    cur_existing_inactive = FakeCursor(fetchone=[{"id": 5, "activo": 0}])
    conn = patch_conn(monkeypatch, app_module, FakeConn(cur_existing_inactive))
    r2 = client.post("/api/temas/tipos", json={"examen_id": 1, "grupo_id": 2, "codigo": "r"})
    assert r2.status_code == 200
    assert r2.get_json()["codigo"] == "R"
    assert conn.commits == 1

    cur_new = FakeCursor(fetchone=[None, {"m": 2}], lastrowid=9)
    patch_conn(monkeypatch, app_module, FakeConn(cur_new))
    r3 = client.post("/api/temas/tipos", json={"examen_id": 1, "grupo_id": 2, "codigo": "S"})
    assert r3.status_code == 200
    assert r3.get_json()["id"] == 9

    cur_toggle = FakeCursor()
    patch_conn(monkeypatch, app_module, FakeConn(cur_toggle))
    assert client.post("/api/temas/tipos/9/toggle", json={"activo": 0}).status_code == 200

    assert client.post("/api/temas/tipos/9/rename", json={"codigo": "mal codigo"}).status_code == 400

    cur_rename = FakeCursor()
    patch_conn(monkeypatch, app_module, FakeConn(cur_rename))
    r4 = client.post("/api/temas/tipos/9/rename", json={"codigo": "q2"})
    assert r4.status_code == 200
    assert r4.get_json()["codigo"] == "Q2"

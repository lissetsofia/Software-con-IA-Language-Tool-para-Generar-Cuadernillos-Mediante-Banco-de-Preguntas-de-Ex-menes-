
def test_rutas_error_db_basicas(client, app_module, monkeypatch):
    monkeypatch.setattr(app_module, "get_connection", lambda: (_ for _ in ()).throw(RuntimeError("db rota")))

    assert client.get("/probar-conexion").json["conexion"] == "error"
    assert client.get("/api/examenes").status_code == 500
    assert client.get("/api/examen_nombre/1").status_code == 500
    assert client.get("/api/temas").status_code == 500
    assert client.post("/api/temas", json={"nombre": "Nuevo"}).status_code == 500
    assert client.put("/api/temas/1", json={"nombre": "Editado"}).status_code == 500
    assert client.patch("/api/temas/1/toggle").status_code == 500
    assert client.delete("/api/temas/1").status_code == 500
    assert client.get("/api/preguntas").status_code == 500
    assert client.get("/api/grupos").status_code == 500
    assert client.post("/api/grupos", json={"clave": "Z", "nombre": "Zona"}).status_code == 500
    assert client.patch("/api/grupos/1/toggle").status_code == 500
    assert client.delete("/api/grupos/1").status_code == 500
    assert client.get("/api/grupos/A/cuotas").status_code == 500
    assert client.get("/api/grupos/1/cuotas").status_code == 500
    assert client.put("/api/grupos/1/cuotas", json={"cuotas": []}).status_code == 500
    assert client.get("/api/temas/tipos?examen_id=1&grupo_id=1").status_code == 500
    assert client.post("/api/temas/tipos/1/toggle", json={"activo": 1}).status_code == 500
    assert client.post("/api/temas/tipos/1/rename", json={"codigo": "Z"}).status_code == 500


def test_rutas_validaciones_sin_bd(client):
    assert client.post("/api/temas", json={"nombre": ""}).status_code == 400
    assert client.post("/api/temas", json={"nombre": "x" * 101}).status_code == 400
    assert client.put("/api/temas/1", json={"nombre": ""}).status_code == 400
    assert client.post("/api/grupos", json={"clave": "", "nombre": ""}).status_code == 400
    assert client.put("/api/grupos/1", json={}).status_code == 400
    assert client.put("/api/grupos/1", json={"clave": ""}).status_code == 400
    assert client.put("/api/grupos/1", json={"nombre": "x" * 101}).status_code == 400
    assert client.put("/api/grupos/1", json={"activo": "bad"}).status_code == 400
    assert client.get("/api/temas/tipos").status_code == 400
    assert client.post("/api/temas/tipos", json={"examen_id": 0, "grupo_id": 1, "codigo": ""}).status_code == 400
    assert client.post("/api/temas/tipos/1/rename", json={"codigo": ""}).status_code == 400
    assert client.get("/__ping__").data == b"ok"

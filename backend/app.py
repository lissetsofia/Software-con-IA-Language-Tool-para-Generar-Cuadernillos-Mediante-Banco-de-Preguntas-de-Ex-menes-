from flask import Flask, request, jsonify
from db import get_connection

app = Flask(__name__)

@app.route("/login", methods=["POST"])
def login():
    data = request.json
    usuario = data["usuario"]
    clave = data["clave"]

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM usuarios WHERE username=%s AND password=%s", (usuario, clave))
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    #if user:
    #    return jsonify({"status": "ok", "mensaje": "Login correcto"})
    #else:
     #   return jsonify({"status": "error", "mensaje": "Credenciales inválidas"}), 401

@app.route("/probar-conexion")
def probar_conexion():
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT DATABASE()")
        nombre_bd = cursor.fetchone()[0]
        cursor.close()
        conn.close()
        return jsonify({"conexion": "ok", "base_datos": nombre_bd})
    except Exception as e:
        return jsonify({"conexion": "error", "detalle": str(e)})
if __name__ == "__main__":
    app.run(port=5050)

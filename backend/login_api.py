# backend/login_api.py
from flask import request, jsonify

def handle_login(get_connection):
    """
    Handler testeable para /login.
    - No depende de MySQL directamente: recibe get_connection() inyectado.
    - Retorna JSON con ok/status + códigos HTTP claros.
    """
    data = request.get_json(silent=True) or {}

    usuario = (data.get("usuario") or "").strip()
    clave = data.get("clave") or ""

    if not usuario or not clave:
        return jsonify(ok=False, status="error", mensaje="Faltan campos: usuario y clave"), 400

    conn = get_connection()
    cur = None
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT idusuario, usuario, rol "
            "FROM usuarios "
            "WHERE usuario=%s AND clave=%s "
            "LIMIT 1",
            (usuario, clave),
        )
        user = cur.fetchone()
    finally:
        try:
            if cur:
                cur.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

    if user:
        return jsonify(ok=True, status="ok", user=user, mensaje="Login correcto"), 200

    return jsonify(ok=False, status="error", mensaje="Credenciales inválidas"), 401


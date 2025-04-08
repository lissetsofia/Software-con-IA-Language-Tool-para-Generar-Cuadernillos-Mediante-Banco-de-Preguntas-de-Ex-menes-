import mysql.connector

def get_connection():
    return mysql.connector.connect(
        host="127.0.0.1",
        user="root",
        password="",
        database="banco_preguntas"
    )
    # Test directo (solo para prueba)
if __name__ == "__main__":
    try:
        conn = get_connection()
        print("✅ Conexión a la base de datos exitosa.")
        conn.close()
    except Exception as e:
        print("❌ Error al conectar a la base de datos:")
        print(e)
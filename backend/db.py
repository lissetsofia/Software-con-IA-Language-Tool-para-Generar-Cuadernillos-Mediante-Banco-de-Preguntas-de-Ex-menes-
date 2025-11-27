import mysql.connector

def get_connection():
    return mysql.connector.connect(
        host="127.0.0.1",
        user="root",
        password="root",  # Agrega tu contraseña si tienes
        database="banco_preguntas"
    )

# Test directo (solo para prueba)
if __name__ == "__main__":
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES;")
        tablas = cursor.fetchall()
        print("✅ Conexión exitosa. Tablas en la base de datos:")
        for tabla in tablas:
            print(" -", tabla[0])
        conn.close()
    except Exception as e:
        print("❌ Error al conectar a la base de datos:")
        print(e)

from pathlib import Path
from db import get_connection

def init_db():
    schema_path = Path(__file__).resolve().parent / "schema_sqlite.sql"
    conn = get_connection()
    with open(schema_path, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()
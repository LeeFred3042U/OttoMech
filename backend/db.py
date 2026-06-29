import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


def get_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set in environment")
    return psycopg2.connect(DATABASE_URL)


@contextmanager
def get_db():
    conn = None
    try:
        conn = get_connection()
        yield conn
        conn.commit()
    except Exception:
        if conn is not None:
            conn.rollback()
        raise
    finally:
        if conn is not None:
            conn.close()


def init_db():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS postgis;")

            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    phone VARCHAR(20) UNIQUE NOT NULL,
                    name VARCHAR(100),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS otp_store (
                    phone VARCHAR(20) PRIMARY KEY,
                    otp_code VARCHAR(6) NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL
                );
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS mechanics (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    phone VARCHAR(20) UNIQUE NOT NULL,
                    garage_name VARCHAR(150) NOT NULL,
                    lat DOUBLE PRECISION NOT NULL,
                    lng DOUBLE PRECISION NOT NULL,
                    location GEOGRAPHY(POINT, 4326) NOT NULL,
                    zone VARCHAR(100),
                    is_available BOOLEAN DEFAULT TRUE,
                    rating NUMERIC(3, 2) DEFAULT 4.00,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    id SERIAL PRIMARY KEY,
                    driver_id INTEGER REFERENCES users(id),
                    mechanic_id INTEGER REFERENCES mechanics(id),
                    issue_type VARCHAR(100) NOT NULL,
                    status VARCHAR(30) DEFAULT 'pending',
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    accepted_at TIMESTAMPTZ,
                    completed_at TIMESTAMPTZ,
                    lat DOUBLE PRECISION NOT NULL,
                    lng DOUBLE PRECISION NOT NULL
                );
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_mechanics_location
                ON mechanics USING GIST (location);
            """)

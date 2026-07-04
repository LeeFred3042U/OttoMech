import os
from contextlib import contextmanager

import psycopg2
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
load_dotenv(env_path)

DATABASE_URL = os.getenv("DATABASE_URL")

DROP_TABLES_SQL = """
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS receipts CASCADE;
DROP TABLE IF EXISTS mri_events CASCADE;
DROP TABLE IF EXISTS job_broadcasts CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS otp_store CASCADE;
DROP TABLE IF EXISTS mechanics CASCADE;
DROP TABLE IF EXISTS password_setup_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;
"""

CREATE_TABLES_SQL = """
CREATE TABLE users (
    user_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name       VARCHAR(50) NOT NULL,
    last_name        VARCHAR(50),
    display_name     VARCHAR(100),
    email            VARCHAR(255) UNIQUE,
    phone_number     VARCHAR(20) UNIQUE NOT NULL,
    country          CHAR(2) NOT NULL,
    language         VARCHAR(10) DEFAULT 'en',
    profile_photo    TEXT,
    date_created     TIMESTAMPTZ DEFAULT NOW(),
    status           VARCHAR(20) DEFAULT 'PENDING_PASSWORD' CHECK (status IN ('PENDING_PASSWORD', 'ACTIVE', 'PASSWORD_REQUIRED', 'SUSPENDED', 'DELETED')),
    password_hash    TEXT,
    password_deadline TIMESTAMPTZ NULL,
    phone_verified   BOOLEAN DEFAULT TRUE,
    email_verified   BOOLEAN DEFAULT FALSE,
    last_login       TIMESTAMPTZ,
    two_fa_enabled   BOOLEAN DEFAULT FALSE,
    two_fa_method    VARCHAR(20)
);

CREATE TABLE mechanics (
    mechanic_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name       VARCHAR(50) NOT NULL,
    last_name        VARCHAR(50),
    display_name     VARCHAR(100),
    gender           VARCHAR(20),
    email            VARCHAR(255) UNIQUE,
    phone_number     VARCHAR(20) UNIQUE NOT NULL,
    country          CHAR(2) NOT NULL,
    language         VARCHAR(10) DEFAULT 'en',
    profile_photo    TEXT,
    workshop_name    VARCHAR(150) NOT NULL,
    address          TEXT,
    zone             VARCHAR(50),
    is_available     BOOLEAN DEFAULT FALSE,
    rating           NUMERIC(3,2) DEFAULT 0.00,
    review_count     INT DEFAULT 0,
    mri_score        NUMERIC(5,2) DEFAULT 50.00,
    date_created     TIMESTAMPTZ DEFAULT NOW(),
    status           VARCHAR(20) DEFAULT 'ACTIVE',
    password_hash    TEXT,
    phone_verified   BOOLEAN DEFAULT TRUE,
    email_verified   BOOLEAN DEFAULT FALSE,
    last_login       TIMESTAMPTZ,
    two_fa_enabled   BOOLEAN DEFAULT FALSE,
    two_fa_method    VARCHAR(20)
);

CREATE TABLE password_setup_tokens (
    token       TEXT PRIMARY KEY,
    user_id     UUID REFERENCES users(user_id),
    mechanic_id UUID REFERENCES mechanics(mechanic_id),
    created_at  TIMESTAMPTZ DEFAULT now(),
    expires_at  TIMESTAMPTZ,
    used_at     TIMESTAMPTZ NULL
);

CREATE TABLE otp_store (
    email        VARCHAR(255) PRIMARY KEY,
    otp_code     CHAR(6) NOT NULL,
    purpose      VARCHAR(20) DEFAULT 'login'
                 CHECK (purpose IN ('registration', 'login')),
    expires_at   TIMESTAMPTZ NOT NULL
);

CREATE TABLE jobs (
    job_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id        UUID REFERENCES users(user_id),
    mechanic_id      UUID REFERENCES mechanics(mechanic_id),
    issue_type       TEXT NOT NULL,
    vehicle_model    VARCHAR(100),
    status           VARCHAR(30) DEFAULT 'pending',
    lat              NUMERIC(9,6),
    lng              NUMERIC(9,6),
    photos           JSONB,
    cash_amount      NUMERIC(8,2),
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    accepted_at      TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    job_rating       INT
);

CREATE TABLE job_broadcasts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id       UUID REFERENCES jobs(job_id),
    mechanic_id  UUID REFERENCES mechanics(mechanic_id),
    sent_at      TIMESTAMPTZ DEFAULT NOW(),
    responded    BOOLEAN DEFAULT FALSE,
    accepted     BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_job_broadcasts_job ON job_broadcasts(job_id);

CREATE INDEX idx_jobs_pending ON jobs(job_id) WHERE status = 'pending';

CREATE TABLE mri_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mechanic_id   UUID REFERENCES mechanics(mechanic_id),
    event_type    VARCHAR(30) NOT NULL,
    value         NUMERIC(5,2),
    recorded_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mri_events_mechanic ON mri_events(mechanic_id);

CREATE TABLE receipts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID REFERENCES jobs(job_id) UNIQUE,
    pdf_base64      TEXT,
    cash_amount     NUMERIC(8,2),
    warranty_days   INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    job_id UUID REFERENCES jobs(job_id),
    sender_id UUID NOT NULL,
    sender_role VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_chat_messages_job ON chat_messages(job_id);

CREATE TABLE push_subscriptions (
    id SERIAL PRIMARY KEY,
    entity_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL,
    subscription_json JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_push_subs_entity ON push_subscriptions(entity_id);
"""


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


def _schema_is_v2(cur):
    cur.execute(
        """
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'user_id';
        """
    )
    return cur.fetchone() is not None


def init_db(force_reset=False):
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
            cur.execute("CREATE EXTENSION IF NOT EXISTS postgis;")

            if force_reset or not _schema_is_v2(cur):
                cur.execute(DROP_TABLES_SQL)
                cur.execute(CREATE_TABLES_SQL)
            else:
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_jobs_pending
                    ON jobs(job_id) WHERE status = 'pending';
                    """
                )
                try:
                    cur.execute("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS vehicle_model VARCHAR(100);")
                    cur.execute("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS photos JSONB;")
                    cur.execute("ALTER TABLE jobs ALTER COLUMN issue_type TYPE TEXT;")
                    cur.execute("ALTER TABLE password_setup_tokens ADD COLUMN IF NOT EXISTS mechanic_id UUID REFERENCES mechanics(mechanic_id);")
                except Exception:
                    pass

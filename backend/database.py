from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

import os

DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL:
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
else:
    BASE_DIR = Path(__file__).resolve().parent
    DB_PATH = BASE_DIR / "vidya_ai.db"
    DATABASE_URL = f"sqlite+pysqlite:///{DB_PATH.as_posix()}"

connect_args = {}
if "sqlite" in DATABASE_URL:
    connect_args["check_same_thread"] = False

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    future=True,
)

try:
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE study_plans ADD COLUMN extracted_topics JSON"))
except Exception:
    pass

try:
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE study_plans ADD COLUMN num_pages INTEGER DEFAULT 1"))
except Exception:
    pass

try:
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE study_plans ADD COLUMN estimated_hours INTEGER DEFAULT 10"))
except Exception:
    pass

try:
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE study_plans ADD COLUMN summary TEXT"))
except Exception:
    pass

try:
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE study_plans ADD COLUMN raw_text TEXT"))
except Exception:
    pass

try:
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE study_plans ADD COLUMN title VARCHAR(255) DEFAULT 'Study Plan'"))
except Exception:
    pass

try:
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE study_plans ADD COLUMN updated_at DATETIME"))
except Exception:
    pass

try:
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text("UPDATE study_plans SET updated_at = created_at WHERE updated_at IS NULL"))
except Exception:
    pass

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    future=True,
)


class Base(DeclarativeBase):
    pass


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


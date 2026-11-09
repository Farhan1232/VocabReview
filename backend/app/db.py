"""Database connection setup: one SQLAlchemy engine, with SQLite tuned for safety and concurrent reads."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """Parent class of every table in models.py."""


def make_engine(url: str) -> Engine:
    """Create an engine that applies the SQLite settings to every new connection."""
    engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 15})

    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_conn, _record):  # noqa: ANN001
        """Per-connection SQLite settings."""
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")  # crash-safe and lets reads run during writes
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=15000")
        cursor.close()

    return engine


class Database:
    """Holds the engine so a restore can swap the file and reconnect."""

    def __init__(self, url: str):
        """Connect to the database at this address."""
        self.url = url
        self.engine = make_engine(url)
        self.session_factory = sessionmaker(self.engine, expire_on_commit=False)

    def reconnect(self) -> None:
        """Drop every connection and open fresh ones (needed after a restore swaps the file)."""
        self.engine.dispose()
        self.engine = make_engine(self.url)
        self.session_factory = sessionmaker(self.engine, expire_on_commit=False)

    def session(self) -> Iterator[Session]:
        """Yield one session for the length of a request."""
        with self.session_factory() as session:
            yield session

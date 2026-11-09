"""Database migrations (Alembic). Run automatically on every start.

If the database is behind the code (an app update), a 'pre-update' backup is taken first, so a failed
update can always be rolled back by restoring that file. FSRS state is never reset by a migration.
"""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine

from .config import Config
from .services import backup

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def alembic_config(cfg: Config) -> AlembicConfig:
    """Alembic settings built in code, so the packaged app needs no alembic.ini."""
    alembic_cfg = AlembicConfig()
    # Alembic treats % as interpolation, and a Windows user folder may contain one.
    alembic_cfg.set_main_option("script_location", str(MIGRATIONS_DIR).replace("%", "%%"))
    alembic_cfg.set_main_option("sqlalchemy.url", cfg.db_url.replace("%", "%%"))
    return alembic_cfg


def current_revision(cfg: Config) -> str | None:
    """Schema version of the database file, or None if it has none yet."""
    if not cfg.db_path.exists():
        return None
    engine = create_engine(cfg.db_url)
    try:
        with engine.connect() as conn:
            return MigrationContext.configure(conn).get_current_revision()
    finally:
        engine.dispose()


def head_revision(cfg: Config) -> str | None:
    """Newest schema version this build of the app knows about."""
    return ScriptDirectory.from_config(alembic_config(cfg)).get_current_head()


def upgrade(cfg: Config, keep_backups: int = 30) -> None:
    """Bring the database up to the newest schema, backing it up first if it already holds data."""
    current, head = current_revision(cfg), head_revision(cfg)
    if current == head:
        return
    if current is not None:
        backup.create_backup(cfg, "pre-update", keep_backups)
    command.upgrade(alembic_config(cfg), "head")

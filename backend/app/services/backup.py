"""Backups are consistent SQLite copies made with SQLite's online backup API (safe while running).

File name: lexis-<UTC timestamp>-<reason>.db in <data dir>/backups. The newest N are kept (Settings).
Restore: validate the file, take a 'pre-restore' backup of the current data, swap the file in,
reconnect, then run migrations so an older backup is upgraded automatically.
"""

from __future__ import annotations

import os
import re
import shutil
import sqlite3
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from ..config import Config
from .common import bad

NAME = re.compile(r"^lexis-(\d{8}T\d{6}(?:\d{3})?Z)-(startup|manual|pre-restore|pre-update)\.db$")
REQUIRED_TABLES = {"vocab_items", "students", "student_cards", "review_logs"}


def _info(path: Path) -> dict | None:
    """Backup details read from the file name, or None if it is not a backup file."""
    matched = NAME.match(path.name)
    if not matched:
        return None
    raw = matched.group(1)
    at = datetime.strptime(raw[:15], "%Y%m%dT%H%M%S").replace(tzinfo=UTC)
    return {
        "id": path.name,
        "fileName": path.name,
        "at": at.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "sizeBytes": path.stat().st_size,
        "reason": matched.group(2),
    }


def list_backups(cfg: Config) -> list[dict]:
    """All backups, newest first."""
    out = [info for path in cfg.backup_dir.glob("lexis-*.db") if (info := _info(path))]
    return sorted(out, key=lambda info: info["fileName"], reverse=True)


def create_backup(cfg: Config, reason: str, keep: int = 30) -> dict:
    """Copy the database with SQLite's backup API, then remove old automatic backups."""
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%f")[:-3] + "Z"
    dest = cfg.backup_dir / f"lexis-{stamp}-{reason}.db"
    if cfg.db_path.exists():
        src = sqlite3.connect(cfg.db_path)
        dst = sqlite3.connect(dest)
        try:
            with dst:
                src.backup(dst)
        finally:
            dst.close()
            src.close()
    else:
        sqlite3.connect(dest).close()
    prune(cfg, keep)
    return _info(dest)  # type: ignore[return-value]


def prune(cfg: Config, keep: int) -> None:
    """Keep the newest automatic backups. Manual and pre-restore backups are never removed."""
    autos = [info for info in list_backups(cfg) if info["reason"] in ("startup", "pre-update")]
    for info in autos[keep:]:
        (cfg.backup_dir / info["fileName"]).unlink(missing_ok=True)


def backup_path(cfg: Config, backup_id: str) -> Path:
    """Path of a backup by id. The name check stops a request reaching files outside the folder."""
    if not NAME.match(backup_id):
        raise bad("Unknown backup")
    path = cfg.backup_dir / backup_id
    if not path.is_file():
        raise bad("Unknown backup")
    return path


def validate_backup_file(path: Path) -> None:
    """Raise a clear error unless the file is a healthy Lexis database."""
    with open(path, "rb") as file:
        if file.read(16) != b"SQLite format 3\x00":
            raise bad("This file is not a Lexis backup (not a SQLite database)")
    # immutable: read the file as it is, without creating -wal/-shm files beside it.
    connection = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro&immutable=1", uri=True)
    try:
        if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise bad("The backup file is damaged (integrity check failed)")
        tables = {table[0] for table in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    except sqlite3.DatabaseError as e:
        raise bad("The backup file is damaged and cannot be read") from e
    finally:
        connection.close()
    if not tables >= REQUIRED_TABLES:
        raise bad("This file is not a Lexis backup (tables missing)")


def _retry_locked(action: Callable[[], None], attempts: int = 25, delay: float = 0.2) -> None:
    """Windows refuses to replace a file while anything has it open: a request still finishing,
    or antivirus scanning it. Those locks clear in moments, so wait for them."""
    for attempt in range(attempts):
        try:
            action()
            return
        except PermissionError:
            if attempt == attempts - 1:
                raise bad(
                    "The database is busy, so the backup was not restored. Your data is unchanged. Please try again."
                ) from None
            time.sleep(delay)


def restore_file(cfg: Config, uploaded: Path) -> None:
    """Caller must dispose all DB connections before and reconnect after."""
    validate_backup_file(uploaded)
    tmp = cfg.db_path.with_suffix(".restore-tmp")
    shutil.copyfile(uploaded, tmp)
    try:
        for suffix in ("-wal", "-shm"):
            sidecar = Path(str(cfg.db_path) + suffix)
            _retry_locked(lambda path=sidecar: path.unlink(missing_ok=True))
        _retry_locked(lambda: os.replace(tmp, cfg.db_path))
    finally:
        tmp.unlink(missing_ok=True)

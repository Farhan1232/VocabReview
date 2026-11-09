"""Runtime configuration. Everything is local: the server binds to 127.0.0.1 only."""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path


def _default_data_dir() -> Path:
    """Where the database lives. LEXIS_DATA_DIR overrides the per-user default."""
    if env := os.environ.get("LEXIS_DATA_DIR"):
        return Path(env)
    if sys.platform == "win32":
        # %LOCALAPPDATA%\Lexis — inside the teacher's own Windows profile, not readable by other users.
        return Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "Lexis"
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "lexis"


@dataclass(frozen=True)
class Config:
    """Paths and network address for one running copy of the app."""

    data_dir: Path
    host: str = "127.0.0.1"
    port: int = 8000

    @property
    def db_path(self) -> Path:
        """The SQLite database file."""
        return self.data_dir / "lexis.db"

    @property
    def backup_dir(self) -> Path:
        """The folder that holds backup files."""
        return self.data_dir / "backups"

    @property
    def db_url(self) -> str:
        """SQLAlchemy connection address for the database file."""
        return f"sqlite:///{self.db_path.as_posix()}"


def load_config() -> Config:
    """Read settings from the environment and make sure the data folders exist."""
    cfg = Config(
        data_dir=_default_data_dir(),
        host=os.environ.get("LEXIS_HOST", "127.0.0.1"),
        port=int(os.environ.get("LEXIS_PORT", "8000")),
    )
    cfg.data_dir.mkdir(parents=True, exist_ok=True)
    cfg.backup_dir.mkdir(parents=True, exist_ok=True)
    return cfg


def frontend_dir() -> Path | None:
    """Find the built frontend: the packaged app's "web" folder or, in development, frontend/dist."""
    candidates = [
        Path(os.environ["LEXIS_WEB_DIR"]) if os.environ.get("LEXIS_WEB_DIR") else None,
        Path(getattr(sys, "_MEIPASS", "")) / "web" if getattr(sys, "_MEIPASS", None) else None,
        Path(__file__).resolve().parent.parent / "web",
        Path(__file__).resolve().parents[2] / "frontend" / "dist",
    ]
    for candidate in candidates:
        if candidate and (candidate / "index.html").is_file():
            return candidate
    return None

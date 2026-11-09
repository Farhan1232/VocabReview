from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Config
from app.main import create_app


@pytest.fixture
def cfg(tmp_path: Path) -> Config:
    c = Config(data_dir=tmp_path)
    c.backup_dir.mkdir(parents=True, exist_ok=True)
    return c


@pytest.fixture
def client(cfg: Config):
    with TestClient(create_app(cfg, startup_backup=False)) as c:
        yield c


def draft(english: str, **kw) -> dict:
    return {
        "english": english,
        "polish": [],
        "definition": None,
        "partOfSpeech": None,
        "cefr": None,
        "example": None,
        "topics": [],
        "notes": None,
        **kw,
    }


@pytest.fixture
def seeded(client: TestClient):
    client.post("/api/demo/sample").raise_for_status()
    students = {s["student"]["name"]: s["student"]["id"] for s in client.get("/api/students").json()}
    return client, students

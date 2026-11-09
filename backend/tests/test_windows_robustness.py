"""Things that behave differently on the teacher's Windows PC than on a development machine."""

from __future__ import annotations

import io
import os
import socket
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.__main__ import choose_port
from app.config import Config
from app.main import create_app
from app.services import backup


def _backup_bytes(client: TestClient) -> bytes:
    url = client.post("/api/backups").json()["url"]
    return client.get(url).content


def _upload(client: TestClient, data: bytes):
    return client.post("/api/restore", files={"file": ("b.db", io.BytesIO(data), "application/octet-stream")})


def test_restore_leaves_no_stray_files(seeded, cfg):
    client, _ = seeded
    assert _upload(client, _backup_bytes(client)).status_code == 200
    names = {p.name for p in cfg.data_dir.iterdir()}
    assert not [n for n in names if ".upload" in n or "restore-tmp" in n], names


def test_restore_rejects_damaged_database_with_a_clear_message(client, cfg):
    before = cfg.db_path.read_bytes()
    r = _upload(client, b"SQLite format 3\x00" + b"\xff" * 8192)
    assert r.status_code == 400
    assert "damaged" in r.json()["detail"]
    assert cfg.db_path.read_bytes() == before


def test_restore_waits_for_a_briefly_locked_file(seeded, monkeypatch):
    client, _ = seeded
    data = _backup_bytes(client)
    real, calls = os.replace, []

    def locked_twice(src, dst):
        calls.append(dst)
        if len(calls) <= 2:
            raise PermissionError(13, "in use")
        real(src, dst)

    monkeypatch.setattr(backup.os, "replace", locked_twice)
    monkeypatch.setattr(backup.time, "sleep", lambda _: None)
    assert _upload(client, data).status_code == 200
    assert len(calls) == 3


def test_restore_reports_a_lasting_lock_and_keeps_the_data(seeded, monkeypatch, cfg):
    client, _ = seeded
    data = _backup_bytes(client)
    words = client.get("/api/vocab/facets").json()["totalItems"]

    def always_locked(src, dst):
        raise PermissionError(13, "in use")

    monkeypatch.setattr(backup.os, "replace", always_locked)
    monkeypatch.setattr(backup.time, "sleep", lambda _: None)
    r = _upload(client, data)
    assert r.status_code == 400 and "unchanged" in r.json()["detail"]
    monkeypatch.undo()
    assert client.get("/api/vocab/facets").json()["totalItems"] == words
    assert not cfg.db_path.with_suffix(".restore-tmp").exists()


@pytest.mark.parametrize("folder", ["Łukasz Żółć", "with space", "100% done", "a#b"])
def test_user_folder_names(tmp_path: Path, folder: str):
    c = Config(data_dir=tmp_path / folder)
    c.backup_dir.mkdir(parents=True)
    with TestClient(create_app(c)) as client:
        client.post("/api/demo/sample").raise_for_status()
        assert client.get("/api/system").json()["schemaRevision"] == "0001"
        data = _backup_bytes(client)
        assert _upload(client, data).status_code == 200
        assert client.get("/api/vocab/facets").json()["totalItems"] > 0


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_choose_port_skips_a_port_held_by_another_program():
    port = _free_port()
    with socket.socket() as other:
        other.bind(("127.0.0.1", port))
        other.listen()
        chosen, running = choose_port(port, attempts=5)
    assert chosen != port and port < chosen < port + 5 and running is False


def test_choose_port_fails_clearly_when_nothing_is_free():
    port = _free_port()
    with socket.socket() as other:
        other.bind(("127.0.0.1", port))
        other.listen()
        with pytest.raises(RuntimeError, match="in use"):
            choose_port(port, attempts=1)


@pytest.mark.skipif(sys.platform == "win32", reason="Windows has no such wait for listening ports")
def test_choose_port_uses_a_port_that_is_just_cooling_down():
    """A quick restart must keep the same address, not drift to the next port."""
    with socket.socket() as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind(("127.0.0.1", 0))
        port = server.getsockname()[1]
        server.listen()
        client = socket.create_connection(("127.0.0.1", port))
        accepted, _ = server.accept()
        accepted.close()  # the side that closes first leaves the port in TIME_WAIT
        client.close()
    assert choose_port(port, attempts=1) == (port, False)

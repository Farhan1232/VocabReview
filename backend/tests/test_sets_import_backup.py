import io

from conftest import draft
from fastapi.testclient import TestClient

from app.config import Config
from app.main import create_app


def test_sets_never_duplicate_items(client):
    items = client.post("/api/vocab", json=[draft("a1"), draft("b1")]).json()
    ids = [i["id"] for i in items]
    s1 = client.post("/api/sets", json={"name": "Exam", "itemIds": ids}).json()
    s2 = client.post("/api/sets", json={"name": "Warm-up", "itemIds": ids[:1]}).json()
    assert client.post(f"/api/sets/{s1['id']}/items", json={"itemIds": ids}).json() == {"added": 0, "already": 2}
    assert client.post("/api/sets", json={"name": "exam"}).status_code == 400  # case-insensitive unique
    client.patch(f"/api/sets/{s1['id']}", json={"name": "Exam 2026"}).raise_for_status()
    assert client.get("/api/vocab/facets").json()["totalItems"] == 2
    assert client.post(f"/api/sets/{s2['id']}/items/remove", json={"itemIds": ids}).json() == 1
    client.delete(f"/api/sets/{s1['id']}").raise_for_status()
    assert client.get("/api/vocab/facets").json()["totalItems"] == 2


ROWS = [
    ["kettle", "czajnik", "a pot for boiling water", "A2", "Cooking"],
    ["bank", "brzeg", "the land along the side of a river", "B1", "Nature"],
    ["bank", "ławka", "a long seat", "B2", ""],
    ["", "x", "", "", ""],
    ["kettle", "czajnik", "a pot for boiling water", "A2", "Cooking"],
    ["stove", "kuchenka", "", "Z9", ""],
]
MAP = ["english", "polish", "definition", "cefr", "topics"]


def test_import_preview_commit_and_reimport(seeded):
    c, _ = seeded
    before = c.get("/api/vocab/facets").json()["totalItems"]
    prev = c.post("/api/import/preview", json={"rows": ROWS, "mapping": MAP}).json()
    assert [r["status"] for r in prev] == [
        "new",
        "exact_duplicate",
        "possible_duplicate",
        "error",
        "exact_duplicate",
        "new",
    ]
    assert prev[5]["draft"]["cefr"] is None and "Unknown CEFR" in prev[5]["messages"][0]
    # Same English, no part of speech: added by default and flagged as a duplicate.
    assert prev[2]["action"] == "add"
    res = c.post("/api/import/commit", json={"fileName": "words.csv", "rows": prev}).json()
    assert (res["added"], res["updated"], res["skipped"], res["rejected"]) == (3, 0, 2, 1)
    assert c.get("/api/vocab/facets").json()["totalItems"] == before + 3
    again = c.post("/api/import/preview", json={"rows": ROWS, "mapping": MAP}).json()
    res2 = c.post("/api/import/commit", json={"fileName": "words.csv", "rows": again}).json()
    assert res2["added"] == 0 and c.get("/api/vocab/facets").json()["totalItems"] == before + 3
    assert c.get("/api/import/runs").json()[0]["fileName"] == "words.csv"


def test_import_update_only_fills_blanks(client):
    [it] = client.post("/api/vocab", json=[draft("wardrobe", definition="a tall cupboard")]).json()
    prev = client.post(
        "/api/import/preview",
        json={
            "rows": [["wardrobe", "szafa", "different text", "A2"]],
            "mapping": ["english", "polish", "definition", "cefr"],
        },
    ).json()
    prev[0]["action"], prev[0]["updateTargetId"] = "update", it["id"]
    client.post("/api/import/commit", json={"fileName": "f.csv", "rows": prev}).raise_for_status()
    got = client.get(f"/api/vocab/{it['id']}").json()
    assert got["definition"] == "a tall cupboard" and got["polish"] == ["szafa"] and got["cefr"] == "A2"


def test_backup_and_restore_roundtrip(seeded, cfg):
    c, students = seeded
    made = c.post("/api/backups").json()
    data = c.get(made["url"]).content
    assert data.startswith(b"SQLite format 3")
    c.post("/api/vocab", json=[draft("added after backup")])
    c.post("/api/students", json={"name": "Temp"})
    assert c.get("/api/vocab", params={"q": "added after backup"}).json()
    r = c.post("/api/restore", files={"file": ("backup.db", io.BytesIO(data), "application/octet-stream")}).json()
    assert r["ok"] and "pre-restore" in r["safetyBackup"]
    assert not c.get("/api/vocab", params={"q": "added after backup"}).json()
    assert len(c.get("/api/students").json()) == 2
    # the pre-restore safety copy holds the undone data
    assert any(b["reason"] == "pre-restore" for b in c.get("/api/backups").json())


def test_backup_restores_everything_on_a_new_computer(seeded, tmp_path):
    """A backup taken on one install, restored on an empty one in another folder, keeps all the data."""
    old, students = seeded
    student_id = next(iter(students.values()))
    item_ids = [row["item"]["id"] for row in old.get("/api/vocab").json()[:3]]
    old.post("/api/assign", json={"studentId": student_id, "itemIds": item_ids}).raise_for_status()
    queue = old.post("/api/review/queue", json={"studentId": student_id, "source": "all"}).json()
    card_id = queue[0]["card"]["id"]
    old.post(f"/api/review/{card_id}/rate", json={"rating": 3, "requestId": "req-moved-1"}).raise_for_status()
    settings = old.get("/api/settings").json()
    settings["masteredStabilityDays"] = 30
    settings["desiredRetention"] = 0.85
    settings["shortcuts"]["good"] = "g"
    old.put("/api/settings", json=settings).raise_for_status()

    kinds = ("vocabulary", "students", "cards", "history")
    before = {kind: old.get(f"/api/export/{kind}").text for kind in kinds}
    sets_before = old.get("/api/sets").json()
    backup_file = old.get(old.post("/api/backups").json()["url"]).content

    new_cfg = Config(data_dir=tmp_path / "new-computer")
    new_cfg.backup_dir.mkdir(parents=True, exist_ok=True)
    with TestClient(create_app(new_cfg, startup_backup=False)) as new:
        assert new.get("/api/vocab").json() == []
        restored = new.post(
            "/api/restore", files={"file": ("backup (1).db", io.BytesIO(backup_file), "application/octet-stream")}
        )
        assert restored.json()["ok"]
        assert {kind: new.get(f"/api/export/{kind}").text for kind in kinds} == before
        assert new.get("/api/sets").json() == sets_before
        assert new.get("/api/settings").json() == settings
        # Reviewing carries on from the restored schedule, and the old request id is still known.
        card = next(
            q["card"]
            for q in new.post("/api/review/queue", json={"studentId": student_id, "source": "all"}).json()
            if q["card"]["id"] == card_id
        )
        assert card["fsrs"]["reps"] == 1
        again = new.post(f"/api/review/{card_id}/rate", json={"rating": 3, "requestId": "req-moved-1"}).json()
        assert again["duplicate"] is True
        new.post(f"/api/review/{card_id}/rate", json={"rating": 3, "requestId": "req-moved-2"}).raise_for_status()


def test_restore_rejects_garbage(client):
    r = client.post("/api/restore", files={"file": ("x.db", io.BytesIO(b"hello"), "application/octet-stream")})
    assert r.status_code == 400 and "not a Lexis backup" in r.json()["detail"]


def test_data_persists_across_restart(cfg):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(cfg, startup_backup=False)) as c:
        c.post("/api/vocab", json=[draft("persist me")]).raise_for_status()
        s = c.post("/api/students", json={"name": "P"}).json()
        card_item = c.get("/api/vocab", params={"q": "persist me"}).json()[0]["item"]["id"]
        c.post("/api/assign", json={"studentId": s["id"], "itemIds": [card_item]})
        cid = c.get(f"/api/students/{s['id']}/cards").json()[0]["card"]["id"]
        due = c.post(f"/api/review/{cid}/rate", json={"rating": 3, "requestId": "req-persist-1"}).json()["card"][
            "fsrs"
        ]["due"]
    with TestClient(create_app(cfg, startup_backup=True)) as c:
        assert c.get("/api/vocab", params={"q": "persist me"}).json()
        assert c.get(f"/api/students/{s['id']}/cards").json()[0]["card"]["fsrs"]["due"] == due
        assert any(b["reason"] == "startup" for b in c.get("/api/backups").json())


def test_settings_roundtrip_and_validation(client):
    st = client.get("/api/settings").json()
    assert st["shortcuts"]["revealPolish"] == "p"
    st["masteredStabilityDays"] = 30
    st["shortcuts"]["good"] = "g"
    assert client.put("/api/settings", json=st).json()["shortcuts"]["good"] == "g"
    assert client.get("/api/settings").json()["masteredStabilityDays"] == 30
    st["difficultDifficulty"] = 99
    assert client.put("/api/settings", json=st).status_code == 422


def test_security_headers_and_cross_site_refused(client):
    r = client.post("/api/students", json={"name": "Evil"}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    assert client.get("/api/system", headers={"Host": "attacker.example"}).status_code == 403
    ok = client.post("/api/students", json={"name": "Fine"}, headers={"Origin": "http://127.0.0.1:8000"})
    assert ok.status_code == 200 and ok.headers["x-content-type-options"] == "nosniff"


def test_import_overlong_rows_are_rejected_not_fatal(client):
    rows = [["x" * 300, ""], ["ok word", "dobre"]]
    prev = client.post("/api/import/preview", json={"rows": rows, "mapping": ["english", "polish"]}).json()
    assert prev[0]["status"] == "error"
    res = client.post("/api/import/commit", json={"fileName": "long.csv", "rows": prev}).json()
    assert (res["added"], res["rejected"]) == (1, 1)

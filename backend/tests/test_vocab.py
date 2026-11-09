from conftest import draft


def test_add_edit_and_optional_fields_stay_blank(client):
    [item] = client.post(
        "/api/vocab", json=[draft("  kettle ", polish=["czajnik", " "], topics=["Cooking", "Cooking"])]
    ).json()
    assert item["english"] == "kettle" and item["polish"] == ["czajnik"] and item["topics"] == ["Cooking"]
    assert item["definition"] is None and item["cefr"] is None and item["example"] is None
    upd = client.put(
        f"/api/vocab/{item['id']}",
        json=draft("kettle", polish=["czajnik"], cefr="A2", definition="a pot for boiling water"),
    ).json()
    assert upd["cefr"] == "A2" and upd["definition"] == "a pot for boiling water"


def test_english_required_and_cefr_validated(client):
    [item] = client.post("/api/vocab", json=[draft("x")]).json()
    assert client.put(f"/api/vocab/{item['id']}", json=draft("  ")).status_code == 400
    assert client.post("/api/vocab", json=[draft("y", cefr="Z9")]).status_code == 422


def test_two_senses_are_two_items(client):
    client.post(
        "/api/vocab",
        json=[
            draft("bank", polish=["bank"], definition="money"),
            draft("bank", polish=["brzeg"], definition="river side"),
        ],
    )
    rows = client.get("/api/vocab", params={"q": '"bank"'}).json()
    assert sorted(r["item"]["polish"][0] for r in rows) == ["bank", "brzeg"]
    assert len({r["item"]["id"] for r in rows}) == 2


def test_search_every_field_and_diacritics(seeded):
    c, _ = seeded
    assert (
        c.get("/api/vocab", params={"q": "skladnik"}).json()[0]["item"]["english"] == "ingredient"
    )  # Polish, no diacritics
    assert any(
        r["item"]["english"] == "simmer" for r in c.get("/api/vocab", params={"q": "below boiling"}).json()
    )  # definition
    assert any(
        r["item"]["english"] == "oversleep" for r in c.get("/api/vocab", params={"q": "missed the bus"}).json()
    )  # example
    assert c.get("/api/vocab", params={"q": "book"}).json()[0]["item"]["english"] == "book"  # exact first
    hits = c.get("/api/vocab", params={"q": "border"}).json()
    assert [(r["item"]["english"], r["matched"]) for r in hits] == [("customs", ["definition"])]


def test_combined_filters_and_missing(seeded):
    c, _ = seeded
    rows = c.get("/api/vocab", params={"topic": "Cooking", "cefr": "A2"}).json()
    assert rows and all(r["item"]["cefr"] == "A2" and "Cooking" in r["item"]["topics"] for r in rows)
    missing = c.get("/api/vocab", params={"missing": "polish"}).json()
    assert sorted(r["item"]["english"] for r in missing) == ["landlord", "wardrobe"]
    both = c.get("/api/vocab", params={"missing": "polish,definition"}).json()
    assert [r["item"]["english"] for r in both] == ["landlord"]


def test_search_never_creates_records(seeded):
    c, _ = seeded
    before = c.get("/api/vocab/facets").json()["totalItems"]
    c.get("/api/vocab", params={"q": "zzzz not a word"})
    c.get("/api/vocab/suggest", params={"q": "zzzz"})
    assert c.get("/api/vocab/facets").json()["totalItems"] == before


def test_sorting_default_alphabetical(seeded):
    c, _ = seeded
    names = [r["item"]["english"].lower() for r in c.get("/api/vocab").json()]
    assert names == sorted(names)


def test_bulk_edit_only_touches_requested_fields(seeded):
    c, _ = seeded
    ids = [r["item"]["id"] for r in c.get("/api/vocab", params={"topic": "Idioms"}).json()]
    c.post(
        "/api/vocab/bulk", json={"ids": ids, "patch": {"addTopics": ["Warm-up"], "setCefr": True, "cefr": "B2"}}
    ).raise_for_status()
    rows = c.get("/api/vocab", params={"topic": "Idioms"}).json()
    assert all(
        r["item"]["cefr"] == "B2" and "Warm-up" in r["item"]["topics"] and "Idioms" in r["item"]["topics"] for r in rows
    )
    assert all(r["item"]["polish"] for r in rows)


def test_archive_hides_and_delete_blocked_with_history(seeded):
    c, students = seeded
    john = students["John Nowak"]
    card = c.get(f"/api/students/{john}/cards").json()[0]
    c.post(
        f"/api/review/{card['card']['id']}/rate", json={"rating": 3, "requestId": "req-archive-1"}
    ).raise_for_status()
    iid = card["item"]["id"]
    assert c.post("/api/vocab/delete", json={"ids": [iid]}).json() == {"deleted": 0, "blocked": 1}
    assert c.post("/api/vocab/archive", json={"ids": [iid]}).json() == 1
    assert all(r["item"]["id"] != iid for r in c.get("/api/vocab").json())
    assert any(r["item"]["id"] == iid for r in c.get("/api/vocab", params={"archived": "true"}).json())
    assert len(c.get(f"/api/students/{john}/history", params={"item": iid}).json()) == 1


def test_export_vocabulary_csv(seeded):
    c, _ = seeded
    f = c.get("/api/export/vocabulary").json()
    assert f["fileName"].startswith("vocabulary-") and f["content"].startswith("﻿id,english")
    assert "składnik" in f["content"]

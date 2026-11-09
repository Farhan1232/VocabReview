"""Duplicate words: the check before adding, CSV import, and merging copies already in the bank."""

from conftest import draft


def _words(client, *drafts):
    return {
        w["english"] + "/" + (w["cefr"] or ""): w["id"] for w in client.post("/api/vocab", json=list(drafts)).json()
    }


def test_check_flags_repeats_and_words_in_the_bank(client):
    _words(client, draft("ALTER", partOfSpeech="verb", cefr="B2"), draft("SUIT", partOfSpeech="verb"))
    rows = [
        {"english": "alter", "partOfSpeech": "verb"},
        {"english": "Suit", "partOfSpeech": "noun"},
        {"english": "suit", "partOfSpeech": "noun"},
        {"english": "", "partOfSpeech": None},
        {"english": "ankle boots", "partOfSpeech": None},
    ]
    out = client.post("/api/vocab/duplicates/check", json=rows).json()
    assert [r["repeatOf"] for r in out] == [None, None, 1, None, None]
    assert [[m["english"] for m in r["matches"]] for r in out] == [["ALTER"], [], [], [], []]
    assert out[0]["matches"][0]["cefr"] == "B2"
    assert client.get("/api/vocab/facets").json()["totalItems"] == 2  # checking saves nothing


def test_import_adds_and_flags_reworded_copies(client):
    _words(client, draft("alter", partOfSpeech="verb", definition="To change the fit of a garment"))
    rows = [
        ["alter", "To modify the dimensions of a garment", "verb", "C1"],
        ["apparel", "Clothing as a category", "noun", "B2"],
        ["apparel", "Clothing considered as a general category", "noun", "C1"],
        ["alter", "A misspelt altar", "noun", "B2"],
    ]
    mapping = ["english", "definition", "partOfSpeech", "cefr"]
    prev = client.post("/api/import/preview", json={"rows": rows, "mapping": mapping}).json()
    assert [(r["status"], r["action"]) for r in prev] == [
        ("possible_duplicate", "add"),
        ("new", "add"),
        ("possible_duplicate", "add"),
        ("new", "add"),
    ]
    assert "Same word as row 3 in this file" in prev[2]["messages"][-1]
    res = client.post("/api/import/commit", json={"fileName": "ai.csv", "rows": prev}).json()
    assert (res["added"], res["skipped"]) == (4, 0)
    # Nothing is blocked: the copies are in the bank and flagged (alter verb ×2, apparel ×2).
    assert client.get("/api/vocab/facets").json()["duplicateGroups"] == 2


def test_groups_and_suggested_copy(client):
    _words(
        client,
        draft("FIT", partOfSpeech="verb", cefr="A2"),
        draft("FIT", partOfSpeech="verb", cefr="A1", polish=["pasować"], definition="To be the right size"),
        draft("FIT", partOfSpeech="verb", cefr="B1"),
        draft("SUIT", partOfSpeech="noun"),
        draft("SUIT", partOfSpeech="verb"),
        draft("bank", partOfSpeech="noun", polish=["bank"]),
        draft("bank", partOfSpeech="noun", polish=["brzeg"]),
    )
    groups = client.get("/api/vocab/duplicates").json()
    assert [(g["english"], len(g["items"])) for g in groups] == [("bank", 2), ("FIT", 3)]
    fit = groups[1]
    assert fit["keepId"] == fit["items"][0]["item"]["id"] and fit["items"][0]["item"]["cefr"] == "A1"
    assert client.get("/api/vocab/facets").json()["duplicateGroups"] == 2

    # BANK money / river are real meanings: the teacher keeps both and is not asked again.
    client.post("/api/vocab/duplicates/dismiss", json={"ids": [r["item"]["id"] for r in groups[0]["items"]]})
    assert [g["english"] for g in client.get("/api/vocab/duplicates").json()] == ["FIT"]
    _words(client, draft("bank", partOfSpeech="noun", polish=["bank"]))  # a new copy brings the group back
    assert [len(g["items"]) for g in client.get("/api/vocab/duplicates").json()] == [3, 3]


def test_merge_moves_sets_topics_progress_and_history(seeded):
    c, students = seeded
    anna, john = students["Anna Kowalska"], next(i for n, i in students.items() if n != "Anna Kowalska")
    ids = _words(
        c,
        draft("dowdy", partOfSpeech="adjective", cefr="C1", polish=["niemodny"], topics=["Clothing"]),
        draft("dowdy", partOfSpeech="adjective", cefr="C2", example="A dowdy cardigan.", topics=["Style"]),
        draft("dowdy", partOfSpeech="adjective", cefr="B2", definition="Old-fashioned and dull"),
    )
    keep, extra, third = ids["dowdy/C1"], ids["dowdy/C2"], ids["dowdy/B2"]
    exam = c.post("/api/sets", json={"name": "Clothing exam", "itemIds": [extra]}).json()
    # Anna has learned the extra copy; John has both the kept word and the third copy.
    c.post("/api/assign", json={"studentId": anna, "itemIds": [extra]}).raise_for_status()
    c.post("/api/assign", json={"studentId": john, "itemIds": [keep, third]}).raise_for_status()
    anna_card = next(r["card"]["id"] for r in c.get(f"/api/students/{anna}/cards").json() if r["item"]["id"] == extra)
    c.post(f"/api/review/{anna_card}/rate", json={"rating": 3, "requestId": "req-merge-anna-1"}).raise_for_status()
    john_third = next(r["card"]["id"] for r in c.get(f"/api/students/{john}/cards").json() if r["item"]["id"] == third)
    c.post(f"/api/review/{john_third}/rate", json={"rating": 2, "requestId": "req-merge-john-1"}).raise_for_status()

    res = c.post("/api/vocab/duplicates/merge", json={"groups": [{"keepId": keep, "removeIds": [extra, third]}]}).json()
    assert res == {"merged": 1, "deleted": 1, "archived": 1}

    kept = c.get(f"/api/vocab/{keep}").json()
    assert kept["polish"] == ["niemodny"] and kept["cefr"] == "C1"  # existing content untouched
    assert kept["example"] == "A dowdy cardigan." and kept["definition"] == "Old-fashioned and dull"  # blanks filled
    assert sorted(kept["topics"]) == ["Clothing", "Style"]
    assert c.get(f"/api/vocab/{extra}").status_code == 404
    assert c.get(f"/api/vocab/{third}").json()["archived"] is True  # John's history on it is kept

    anna_rows = [r for r in c.get(f"/api/students/{anna}/cards").json() if r["item"]["english"] == "dowdy"]
    assert [(r["item"]["id"], r["card"]["id"], r["card"]["fsrs"]["reps"]) for r in anna_rows] == [(keep, anna_card, 1)]
    history = c.get(f"/api/students/{anna}/history", params={"itemId": keep}).json()
    assert [h["requestId"] for h in history] == ["req-merge-anna-1"]
    assert keep in next(s for s in c.get("/api/sets").json() if s["id"] == exam["id"])["itemIds"]
    assert c.get("/api/vocab/duplicates").json() == []


def test_merge_refuses_different_words(client):
    ids = _words(client, draft("suit", partOfSpeech="noun", cefr="A1"), draft("suit", partOfSpeech="verb", cefr="A2"))
    res = client.post(
        "/api/vocab/duplicates/merge", json={"groups": [{"keepId": ids["suit/A1"], "removeIds": [ids["suit/A2"]]}]}
    )
    assert res.status_code == 400
    assert client.get("/api/vocab/facets").json()["totalItems"] == 2

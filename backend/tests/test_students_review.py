import threading
from datetime import timedelta

from fsrs import Scheduler

from app.schemas import SettingsModel
from app.services.fsrs_service import scheduler_for
from app.timeutil import now, now_iso, parse


def test_assign_skips_duplicates_and_restores(seeded):
    c, students = seeded
    anna = students["Anna Kowalska"]
    ids = [r["item"]["id"] for r in c.get("/api/vocab", params={"topic": "Travel"}).json()]
    first = c.post("/api/assign", json={"studentId": anna, "itemIds": ids + ids[:2]}).json()
    assert first == {"created": len(ids), "alreadyAssigned": 0, "restored": 0}
    assert c.post("/api/assign", json={"studentId": anna, "itemIds": ids}).json() == {
        "created": 0,
        "alreadyAssigned": len(ids),
        "restored": 0,
    }
    card = next(r for r in c.get(f"/api/students/{anna}/cards").json() if r["item"]["id"] == ids[0])
    assert c.post("/api/unassign", json={"cardIds": [card["card"]["id"]]}).json() == 1
    assert c.post("/api/assign", json={"studentId": anna, "itemIds": [ids[0]]}).json()["restored"] == 1


def test_not_assigned_filter_and_senses(seeded):
    c, students = seeded
    john = students["John Nowak"]
    na = c.get("/api/vocab", params={"student": john, "assigned": "not_assigned"}).json()
    a = c.get("/api/vocab", params={"student": john, "assigned": "assigned"}).json()
    assert na and a and not ({r["item"]["id"] for r in na} & {r["item"]["id"] for r in a})
    assert len(na) + len(a) == c.get("/api/vocab/facets").json()["totalItems"]
    assert all(r["card"] is None for r in na)
    bank_ids = [r["item"]["id"] for r in c.get("/api/vocab", params={"q": '"bank"'}).json()]
    c.post("/api/assign", json={"studentId": john, "itemIds": bank_ids[:1]})
    still = list(c.get("/api/vocab", params={"student": john, "assigned": "not_assigned", "q": '"bank"'}).json())
    assert [r["item"]["id"] for r in still] == bank_ids[1:]


def test_every_rating_saves_log_and_schedules(seeded):
    c, students = seeded
    john = students["John Nowak"]
    queue = c.post("/api/review/queue", json={"studentId": john, "source": "new", "limit": 4}).json()
    assert len(queue) == 4 and all(q["card"]["learningState"] == "new" for q in queue)
    for rating, q in zip((1, 2, 3, 4), queue, strict=True):
        preview = c.get(f"/api/cards/{q['card']['id']}/preview").json()
        assert set(preview) == {"1", "2", "3", "4"}
        res = c.post(
            f"/api/review/{q['card']['id']}/rate", json={"rating": rating, "requestId": f"req-rating-{rating}"}
        ).json()
        assert res["duplicate"] is False and res["log"]["rating"] == rating
        assert res["log"]["nextDue"] > res["log"]["reviewedAt"]
        assert res["card"]["fsrs"]["reps"] == 1 and res["card"]["learningState"] != "new"
    easy = c.get(f"/api/students/{john}/history", params={"item": queue[3]["item"]["id"]}).json()
    assert easy[0]["kind"] == "review" and easy[0]["rating"] == 4


def test_double_press_saves_one_review(seeded):
    c, students = seeded
    john = students["John Nowak"]
    card = c.post("/api/review/queue", json={"studentId": john, "source": "all", "limit": 1}).json()[0]
    results = []
    threads = [
        threading.Thread(
            target=lambda: results.append(
                c.post(f"/api/review/{card['card']['id']}/rate", json={"rating": 3, "requestId": "req-double-1"}).json()
            )
        )
        for _ in range(5)
    ]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sum(not r["duplicate"] for r in results) == 1
    assert len(c.get(f"/api/students/{john}/history", params={"item": card["item"]["id"]}).json()) == 1


def test_one_students_review_does_not_move_another(seeded):
    c, students = seeded
    john, anna = students["John Nowak"], students["Anna Kowalska"]
    shared = c.get(f"/api/students/{john}/cards").json()[0]["item"]["id"]
    c.post("/api/assign", json={"studentId": anna, "itemIds": [shared]})
    anna_before = next(r for r in c.get(f"/api/students/{anna}/cards").json() if r["item"]["id"] == shared)["card"][
        "fsrs"
    ]
    john_card = next(r for r in c.get(f"/api/students/{john}/cards").json() if r["item"]["id"] == shared)["card"]["id"]
    c.post(f"/api/review/{john_card}/rate", json={"rating": 1, "requestId": "req-iso-1"}).raise_for_status()
    anna_after = next(r for r in c.get(f"/api/students/{anna}/cards").json() if r["item"]["id"] == shared)["card"][
        "fsrs"
    ]
    assert anna_after == anna_before


def test_due_status_changes_after_rating(seeded):
    c, students = seeded
    john = students["John Nowak"]
    due_before = c.get(f"/api/students/{john}").json()["dueToday"]
    q = c.post("/api/review/queue", json={"studentId": john, "source": "due", "limit": 1}).json()[0]
    c.post(f"/api/review/{q['card']['id']}/rate", json={"rating": 4, "requestId": "req-due-1"}).raise_for_status()
    assert c.get(f"/api/students/{john}").json()["dueToday"] == due_before - 1
    assert q["card"]["fsrs"]["due"] <= now_iso()


def test_reset_logged_as_reset_and_history_survives_edit(seeded):
    c, students = seeded
    john = students["John Nowak"]
    row = c.get(f"/api/students/{john}/cards").json()[0]
    c.post(f"/api/review/{row['card']['id']}/rate", json={"rating": 3, "requestId": "req-reset-1"})
    item = row["item"]
    c.put(
        f"/api/vocab/{item['id']}",
        json={
            **{
                k: item[k]
                for k in ("english", "polish", "definition", "partOfSpeech", "cefr", "example", "topics", "notes")
            },
            "english": item["english"] + " (edited)",
        },
    ).raise_for_status()
    c.post(f"/api/cards/{row['card']['id']}/reset", json={"mode": "new"}).raise_for_status()
    c.post(
        f"/api/cards/{row['card']['id']}/reset", json={"mode": "due_now", "note": "exam tomorrow"}
    ).raise_for_status()
    h = c.get(f"/api/students/{john}/history", params={"item": item["id"]}).json()
    assert [x["kind"] for x in h] == ["override", "reset", "review"]
    assert h[0]["rating"] is None and h[0]["note"] == "exam tomorrow"
    assert h[2]["english"].endswith("(edited)")
    after = next(r for r in c.get(f"/api/students/{john}/cards").json() if r["card"]["id"] == row["card"]["id"])
    assert after["card"]["learningState"] == "new"


def test_review_queue_sources(seeded):
    c, students = seeded
    john = students["John Nowak"]
    sets = c.get("/api/sets").json()
    travel = next(s for s in sets if s["name"] == "Travel Vocabulary")
    q = c.post("/api/review/queue", json={"studentId": john, "source": "set", "setId": travel["id"]}).json()
    assert q and all(e["item"]["id"] in travel["itemIds"] for e in q)
    q2 = c.post(
        "/api/review/queue", json={"studentId": john, "source": "all", "cefr": ["A2"], "topics": ["Cooking"]}
    ).json()
    assert q2 and all(e["item"]["cefr"] == "A2" and "Cooking" in e["item"]["topics"] for e in q2)
    sel = [e["item"]["id"] for e in q2[:2]]
    assert {
        e["item"]["id"]
        for e in c.post("/api/review/queue", json={"studentId": john, "source": "selection", "itemIds": sel}).json()
    } == set(sel)


def test_student_crud_and_deactivate(client):
    s = client.post("/api/students", json={"name": "Ola", "notes": None}).json()
    client.patch(f"/api/students/{s['id']}", json={"name": "Ola K.", "active": False}).raise_for_status()
    got = client.get(f"/api/students/{s['id']}").json()
    assert got["student"]["name"] == "Ola K." and got["student"]["active"] is False
    assert client.post("/api/students", json={"name": " "}).status_code == 400


def _review_card(c, student):
    """A card in the FSRS Review state, with a saved due date."""
    card = c.post("/api/review/queue", json={"studentId": student, "source": "all", "limit": 1}).json()[0]["card"]
    return c.post(f"/api/review/{card['id']}/rate", json={"rating": 4, "requestId": "req-frequency-1"}).json()["card"]


def _good_days(c, card_id):
    """Days until the card would be due if rated Good now."""
    due = parse(c.get(f"/api/cards/{card_id}/preview").json()["3"])
    return (due - now()).total_seconds() / 86400


def _set_retention(c, value):
    settings = c.get("/api/settings").json()
    settings["desiredRetention"] = value
    return c.put("/api/settings", json=settings)


def test_review_frequency_changes_future_schedules_only(seeded):
    c, students = seeded
    card = _review_card(c, students["Anna Kowalska"])
    assert card["fsrs"]["state"] == 2
    assert c.get("/api/settings").json()["desiredRetention"] == 0.9

    default_days = _good_days(c, card["id"])
    _set_retention(c, 0.97).raise_for_status()
    often_days = _good_days(c, card["id"])
    _set_retention(c, 0.7).raise_for_status()
    rarely_days = _good_days(c, card["id"])
    assert often_days < default_days < rarely_days

    queue = c.post("/api/review/queue", json={"studentId": students["Anna Kowalska"], "source": "all"}).json()
    saved = next(q["card"] for q in queue if q["card"]["id"] == card["id"])
    assert saved["fsrs"]["due"] == card["fsrs"]["due"]  # changing the setting moved no saved date

    rated = c.post(f"/api/review/{card['id']}/rate", json={"rating": 3, "requestId": "req-frequency-2"}).json()
    assert parse(rated["card"]["fsrs"]["due"]) - now() > timedelta(days=default_days)  # the rating used the new target


def test_review_frequency_reset_and_limits(client):
    assert _set_retention(client, 0.5).status_code == 422
    assert _set_retention(client, 0.99).status_code == 422
    assert _set_retention(client, 0.8).json()["desiredRetention"] == 0.8
    assert _set_retention(client, 0.9).json()["desiredRetention"] == 0.9
    # Settings saved before this option existed, and old backups, get the FSRS default.
    assert SettingsModel.model_validate({}).desired_retention == Scheduler().desired_retention
    assert scheduler_for(0.9).desired_retention == Scheduler().desired_retention

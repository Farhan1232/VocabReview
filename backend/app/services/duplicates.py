"""Duplicate words: what counts as "the same word", checking new rows, and merging copies.

Rule: two words are the same word when their English matches (ignoring case, accents and extra
spaces) and their part of speech matches, or one of them has no part of speech. So SUIT (noun)
and SUIT (verb) are different words, but a second ALTER (verb) is a duplicate even when its
definition is worded differently.

A real second meaning (BANK, noun: money / BANK, noun: river) also matches this rule, so it is
shown to the teacher, who can keep it on purpose. Nothing is merged without the teacher's choice:
the spec forbids merging senses by spelling alone.
"""

from __future__ import annotations

import json

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from .. import models
from ..schemas import DuplicateCheckRow, MergeGroup
from ..timeutil import now_iso
from .common import bad, set_item_topics
from .index import Item, index
from .text import normalize

DISMISSED_KEY = "duplicates_dismissed"
_CEFR_ORDER = {"A1": 1, "A2": 2, "B1": 3, "B2": 4, "C1": 5, "C2": 6}


def _pos(value: str | None) -> str:
    return (value or "").strip().lower()


def same_word(english_a: str, pos_a: str | None, english_b: str, pos_b: str | None) -> bool:
    """True when two words count as the same word. English must already be normalised."""
    if english_a != english_b:
        return False
    a, b = _pos(pos_a), _pos(pos_b)
    return not a or not b or a == b


def _active_by_english(session: Session) -> dict[str, list[Item]]:
    by_english: dict[str, list[Item]] = {}
    for item in index.items(session).values():
        if not item.archived:
            by_english.setdefault(item.n_english, []).append(item)
    return by_english


def match_json(item: Item) -> dict:
    """The short description of an existing word shown next to a duplicate row."""
    return {
        "id": item.id,
        "english": item.english,
        "partOfSpeech": item.part_of_speech,
        "cefr": item.cefr,
        "polish": item.polish,
        "definition": item.definition,
    }


def check(session: Session, rows: list[DuplicateCheckRow]) -> list[dict]:
    """For each new row: the earlier row it repeats (if any) and the words already in the bank it matches."""
    by_english = _active_by_english(session)
    seen: dict[str, list[tuple[int, str]]] = {}
    out = []
    for idx, row in enumerate(rows):
        english = normalize(row.english)
        if not english:
            out.append({"index": idx, "repeatOf": None, "matches": []})
            continue
        earlier = seen.setdefault(english, [])
        repeat_of = next((i for i, pos in earlier if same_word(english, pos, english, row.part_of_speech)), None)
        earlier.append((idx, _pos(row.part_of_speech)))
        matches = [
            match_json(item)
            for item in by_english.get(english, [])
            if same_word(english, row.part_of_speech, item.n_english, item.part_of_speech)
        ]
        out.append({"index": idx, "repeatOf": repeat_of, "matches": matches})
    return out


# ---------------------------------------------------------------- groups already in the bank


def _dismissed(session: Session) -> list[set[str]]:
    row = session.get(models.Setting, DISMISSED_KEY)
    return [set(ids) for ids in json.loads(row.value)] if row else []


def _root(parent: list[int], i: int) -> int:
    """Union-find: the group an index belongs to."""
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


def find_groups(items: list[Item], dismissed: list[set[str]]) -> list[list[Item]]:
    """Groups of active words that are the same word, leaving out groups the teacher marked as different."""
    by_english: dict[str, list[Item]] = {}
    for item in items:
        if not item.archived:
            by_english.setdefault(item.n_english, []).append(item)
    groups: list[list[Item]] = []
    for same in by_english.values():
        if len(same) < 2:
            continue
        # A word with no part of speech links words of different parts of speech, so join groups transitively.
        parent = list(range(len(same)))
        for i in range(len(same)):
            for j in range(i + 1, len(same)):
                if same_word(same[i].n_english, same[i].part_of_speech, same[j].n_english, same[j].part_of_speech):
                    parent[_root(parent, j)] = _root(parent, i)
        joined: dict[int, list[Item]] = {}
        for i, item in enumerate(same):
            joined.setdefault(_root(parent, i), []).append(item)
        for group in joined.values():
            ids = {item.id for item in group}
            if len(group) > 1 and not any(ids <= gone for gone in dismissed):
                groups.append(group)
    groups.sort(key=lambda group: (group[0].english.lower(), _pos(group[0].part_of_speech)))
    return groups


def group_count(session: Session) -> int:
    """How many groups of duplicates the bank has (shown on the Vocabulary page)."""
    return len(find_groups(list(index.items(session).values()), _dismissed(session)))


def _counts(session: Session, column, ids: list[str]) -> dict[str, int]:
    return dict(session.execute(select(column, func.count()).where(column.in_(ids)).group_by(column)).all())


def _filled(item: Item) -> int:
    return sum(
        bool(value)
        for value in (item.polish, item.definition, item.part_of_speech, item.cefr, item.example, item.topics)
    )


def list_groups(session: Session) -> list[dict]:
    """Every duplicate group, with what each copy is used for and which copy is suggested to keep."""
    groups = find_groups(list(index.items(session).values()), _dismissed(session))
    ids = [item.id for group in groups for item in group]
    students = _counts(session, models.StudentCard.item_id, ids)
    reviews = _counts(session, models.ReviewLog.item_id, ids)
    sets = _counts(session, models.SetItem.item_id, ids)
    out = []
    for group in groups:

        def rank(item: Item) -> tuple:
            # Keep the copy with learning history first, then the most complete one, then the oldest.
            return (
                -reviews.get(item.id, 0),
                -students.get(item.id, 0),
                -sets.get(item.id, 0),
                -_filled(item),
                item.created_at,
                _CEFR_ORDER.get(item.cefr or "", 9),
                item.id,
            )

        ordered = sorted(group, key=rank)
        out.append(
            {
                "english": ordered[0].english,
                "keepId": ordered[0].id,
                "items": [
                    {
                        "item": item.to_json(),
                        "students": students.get(item.id, 0),
                        "reviews": reviews.get(item.id, 0),
                        "sets": sets.get(item.id, 0),
                    }
                    for item in ordered
                ],
            }
        )
    out.sort(key=lambda group: (group["english"].lower(), _pos(group["items"][0]["item"]["partOfSpeech"])))
    return out


def dismiss(session: Session, ids: list[str]) -> None:
    """Remember that these words are different meanings, so they are not offered as duplicates again."""
    ids = sorted(set(ids))
    if len(ids) < 2:
        raise bad("Choose at least two words")
    row = session.get(models.Setting, DISMISSED_KEY)
    stored = json.loads(row.value) if row else []
    stored.append(ids)
    if row:
        row.value = json.dumps(stored)
    else:
        session.add(models.Setting(key=DISMISSED_KEY, value=json.dumps(stored)))
    session.commit()


# ---------------------------------------------------------------- merging


def _fill_blanks(keep: models.VocabItem, other: models.VocabItem) -> None:
    """Copy fields the kept word is missing. Nothing the kept word already has is overwritten."""
    if json.loads(keep.polish or "[]") == [] and json.loads(other.polish or "[]"):
        keep.polish = other.polish
    for name in ("definition", "part_of_speech", "cefr", "example", "notes"):
        if not getattr(keep, name) and getattr(other, name):
            setattr(keep, name, getattr(other, name))


def merge(session: Session, groups: list[MergeGroup]) -> dict:
    """Merge each group into the word the teacher keeps.

    The kept word gets the other copies' sets and topics, and any blank fields filled from them.
    A student's learning record moves to the kept word (with its review history) unless the student
    already has the kept word; then that copy is archived instead of deleted, so no history is lost.
    """
    items = index.items(session)
    at = now_iso()
    merged = deleted = archived = 0
    touched: list[str] = []
    for group in groups:
        remove_ids = [i for i in dict.fromkeys(group.remove_ids) if i != group.keep_id]
        keep_item = items.get(group.keep_id)
        if not keep_item or not remove_ids:
            continue
        for item_id in remove_ids:
            other = items.get(item_id)
            if not other or not same_word(
                keep_item.n_english, keep_item.part_of_speech, other.n_english, other.part_of_speech
            ):
                raise bad(f"“{other.english if other else item_id}” is not the same word as “{keep_item.english}”")
        keep = session.get(models.VocabItem, group.keep_id)
        topics = list(keep_item.topics)
        for item_id in remove_ids:
            other = session.get(models.VocabItem, item_id)
            _fill_blanks(keep, other)
            topics += [t for t in items[item_id].topics if t not in topics]

            in_sets = set(
                session.execute(select(models.SetItem.set_id).where(models.SetItem.item_id == keep.id)).scalars()
            )
            for link in (
                session.execute(select(models.SetItem).where(models.SetItem.item_id == item_id)).scalars().all()
            ):
                if link.set_id not in in_sets:
                    session.add(models.SetItem(set_id=link.set_id, item_id=keep.id, position=link.position))
                    in_sets.add(link.set_id)
                session.delete(link)

            has_keep = set(
                session.execute(
                    select(models.StudentCard.student_id).where(models.StudentCard.item_id == keep.id)
                ).scalars()
            )
            left = 0
            for card in (
                session.execute(select(models.StudentCard).where(models.StudentCard.item_id == item_id)).scalars().all()
            ):
                if card.student_id in has_keep:
                    left += 1
                    continue
                card.item_id = keep.id
                session.execute(
                    update(models.ReviewLog).where(models.ReviewLog.card_id == card.id).values(item_id=keep.id)
                )
            session.flush()
            if left:
                other.archived = True
                other.updated_at = at
                archived += 1
            else:
                session.execute(delete(models.VocabItem).where(models.VocabItem.id == item_id))
                deleted += 1
            touched.append(item_id)
        set_item_topics(session, keep.id, topics)
        keep.updated_at = at
        touched.append(keep.id)
        merged += 1
    session.commit()
    index.refresh(session, touched)
    return {"merged": merged, "deleted": deleted, "archived": archived}

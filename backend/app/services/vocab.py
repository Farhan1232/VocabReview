"""Vocabulary bank: create/edit/archive/delete + search, suggestions and facets."""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import models
from ..schemas import BulkPatch, VocabDraft
from ..timeutil import matches_due, now, now_iso
from . import duplicates, fsrs_service
from .common import bad, clean_list, clean_text, get_settings, not_found, set_item_topics, topic_cache, uid
from .index import Item, index
from .text import normalize, parse_query


def clean_draft(draft: VocabDraft) -> VocabDraft:
    """Trim the draft's text and drop blanks."""
    return VocabDraft(
        english=draft.english.strip(),
        polish=clean_list(draft.polish),
        definition=clean_text(draft.definition),
        part_of_speech=clean_text(draft.part_of_speech.lower() if draft.part_of_speech else None),
        cefr=draft.cefr,
        example=clean_text(draft.example),
        topics=clean_list(draft.topics),
        notes=clean_text(draft.notes),
    )


def write_fields(row: models.VocabItem, draft: VocabDraft) -> None:
    """Copy a draft's fields onto a database row. Topics are stored separately."""
    row.english = draft.english
    row.english_norm = normalize(draft.english)
    row.polish = json.dumps(draft.polish, ensure_ascii=False)
    row.definition = draft.definition
    row.part_of_speech = draft.part_of_speech
    row.cefr = draft.cefr
    row.example = draft.example
    row.notes = draft.notes


def create_items(session: Session, drafts: list[VocabDraft]) -> list[dict]:
    """Add words, skipping drafts with no English."""
    at = now_iso()
    ids = []
    cache = topic_cache(session)
    for raw in drafts:
        draft = clean_draft(raw)
        if not draft.english:
            continue
        row = models.VocabItem(id=uid(), archived=False, created_at=at, updated_at=at)
        write_fields(row, draft)
        session.add(row)
        session.flush()
        set_item_topics(session, row.id, draft.topics, cache, new=True)
        ids.append(row.id)
    session.commit()
    index.refresh(session, ids)
    items = index.items(session)
    return [items[i].to_json() for i in ids]


def get_item(session: Session, item_id: str) -> dict:
    """One item by id."""
    item = index.get(session, item_id)
    if not item:
        raise not_found("Item")
    return item.to_json()


def update_item(session: Session, item_id: str, raw: VocabDraft) -> dict:
    """Save an edit. The item id stays the same, so students keep their progress."""
    row = session.get(models.VocabItem, item_id)
    if not row:
        raise not_found("Item")
    draft = clean_draft(raw)
    if not draft.english:
        raise bad("English is required")
    write_fields(row, draft)  # cards and review logs are separate tables and are never touched here
    row.updated_at = now_iso()
    set_item_topics(session, item_id, draft.topics)
    session.commit()
    index.refresh(session, [item_id])
    return get_item(session, item_id)


def bulk_update(session: Session, ids: list[str], patch: BulkPatch) -> int:
    """Apply the same change to many items. Returns how many changed."""
    rows = session.execute(select(models.VocabItem).where(models.VocabItem.id.in_(ids))).scalars().all()
    items = index.items(session)
    add, remove = clean_list(patch.add_topics), set(clean_list(patch.remove_topics))
    cache = topic_cache(session)
    at = now_iso()
    for row in rows:
        if patch.set_cefr:
            row.cefr = patch.cefr
        if patch.set_part_of_speech:
            row.part_of_speech = clean_text(patch.part_of_speech.lower() if patch.part_of_speech else None)
        if add or remove:
            current = items[row.id].topics if row.id in items else []
            set_item_topics(
                session, row.id, [t for t in current if t not in remove] + [t for t in add if t not in current], cache
            )
        row.updated_at = at
    session.commit()
    index.refresh(session, [updated_row.id for updated_row in rows])
    return len(rows)


def set_archived(session: Session, ids: list[str], archived: bool) -> int:
    """Archive or restore items. Returns how many changed."""
    rows = (
        session.execute(
            select(models.VocabItem).where(models.VocabItem.id.in_(ids), models.VocabItem.archived != archived)
        )
        .scalars()
        .all()
    )
    for row in rows:
        row.archived = archived
        row.updated_at = now_iso()
    session.commit()
    index.refresh(session, [row.id for row in rows])
    return len(rows)


def delete_items(session: Session, ids: list[str]) -> dict:
    """Hard delete only for items with no review history; others must be archived."""
    with_history = set(
        session.execute(select(models.ReviewLog.item_id).where(models.ReviewLog.item_id.in_(ids)).distinct()).scalars()
    )
    deletable = [i for i in set(ids) if i not in with_history]
    if deletable:
        session.execute(delete(models.VocabItem).where(models.VocabItem.id.in_(deletable)))
        session.commit()
        index.refresh(session, deletable)
    return {"deleted": len(deletable), "blocked": len(set(ids)) - len(deletable)}


# ---------------------------------------------------------------- search


@dataclass
class VocabQuery:
    """Search text and filters. Empty values mean "no filter"."""

    q: str = ""
    cefr: list[str] = field(default_factory=list)
    topics: list[str] = field(default_factory=list)
    pos: list[str] = field(default_factory=list)
    set_id: str | None = None
    student_id: str | None = None
    assignment: str = "any"
    states: list[str] = field(default_factory=list)
    due: str = "any"
    difficult: bool = False
    missing: list[str] = field(default_factory=list)
    include_archived: bool = False


def match_text(item: Item, text: str, exact: bool) -> tuple[int, list[str]] | None:
    """Score an item against the search text. Returns (score, matched fields), or None if it does not match."""
    if not text:
        return 0, []
    if exact:
        return (1000, ["english"]) if item.n_english == text else None
    fields: list[str] = []
    score = 0
    english = item.n_english
    if english == text:
        score = 1000
    elif english.startswith(text):
        score = 600 - min(len(english), 100)
    elif text in english:
        score = 400
    if score:
        fields.append("english")
    for name in ("polish", "definition", "example", "topics", "notes"):
        value = item.n_fields.get(name)
        if value and text in value:
            fields.append(name)
            score = max(score, (500 if text in item.n_polish else 300) if name == "polish" else 100)
    return (score, fields) if fields else None


def _missing(item: Item, field_name: str) -> bool:
    """True if the item has nothing in this field."""
    return {
        "polish": not item.polish,
        "definition": not item.definition,
        "example": not item.example,
        "cefr": not item.cefr,
        "topic": not item.topics,
    }.get(field_name, False)


def active_cards(session: Session, student_id: str) -> dict[str, models.StudentCard]:
    """A student's non-archived cards by item id."""
    rows = session.execute(
        select(models.StudentCard).where(
            models.StudentCard.student_id == student_id, models.StudentCard.archived.is_(False)
        )
    ).scalars()
    return {card.item_id: card for card in rows}


def search(session: Session, query: VocabQuery) -> list[dict]:
    """Apply all filters and the text search, best matches first."""
    settings = get_settings(session)
    items = index.items(session)
    cards = active_cards(session, query.student_id) if query.student_id else {}
    set_ids = (
        set(session.execute(select(models.SetItem.item_id).where(models.SetItem.set_id == query.set_id)).scalars())
        if query.set_id
        else None
    )
    text, exact = parse_query(query.q)
    student_filters = query.assignment == "assigned" or bool(query.states) or query.due != "any" or query.difficult
    at = now()
    out: list[tuple[int, str, dict]] = []

    for item in items.values():
        if item.archived and not query.include_archived:
            continue
        if query.cefr and item.cefr not in query.cefr:
            continue
        if query.topics and not any(t in query.topics for t in item.topics):
            continue
        if query.pos and item.part_of_speech not in query.pos:
            continue
        if set_ids is not None and item.id not in set_ids:
            continue
        if query.missing and not all(_missing(item, field_name) for field_name in query.missing):
            continue
        card_json = None
        if query.student_id:
            card = cards.get(item.id)
            if query.assignment == "not_assigned" and card:
                continue
            if student_filters:
                if not card:
                    continue
                if query.states and fsrs_service.learning_state(card, settings) not in query.states:
                    continue
                if not matches_due(query.due, card.due, at, settings.due_soon_days):
                    continue
                if query.difficult and not fsrs_service.is_difficult(card, settings):
                    continue
            card_json = fsrs_service.card_json(card, settings) if card else None
        matched = match_text(item, text, exact)
        if matched is None:
            continue
        out.append(
            (matched[0], item.english.lower(), {"item": item.to_json(), "card": card_json, "matched": matched[1]})
        )

    if text:
        out.sort(key=lambda hit: (-hit[0], hit[1]))
    else:
        out.sort(key=lambda hit: hit[1])
    return [hit[2] for hit in out]


def suggest(session: Session, q: str, limit: int = 8) -> list[dict]:
    """The best few matches for the search box."""
    text, exact = parse_query(q)
    if not text:
        return []
    hits = []
    for item in index.items(session).values():
        if item.archived:
            continue
        matched = match_text(item, text, exact)
        if matched and matched[0] > 0:
            hits.append((-matched[0], item.english.lower(), item))
    hits.sort(key=lambda hit: (hit[0], hit[1]))
    return [
        {
            "itemId": item.id,
            "english": item.english,
            "hint": " · ".join(
                part for part in (item.part_of_speech, ", ".join(item.polish) or item.definition) if part
            ),
        }
        for _, _, item in hits[:limit]
    ]


def _sorted_counts(counts: dict[str, int]) -> list[dict]:
    """Facet entries as the API returns them, in case-insensitive alphabetical order."""
    return [{"name": name, "count": count} for name, count in sorted(counts.items(), key=lambda pair: pair[0].lower())]


def facets(session: Session) -> dict:
    """Counts behind the filter menus."""
    topics: dict[str, int] = {}
    pos: dict[str, int] = {}
    total = archived = 0
    for item in index.items(session).values():
        if item.archived:
            archived += 1
            continue
        total += 1
        for topic in item.topics:
            topics[topic] = topics.get(topic, 0) + 1
        if item.part_of_speech:
            pos[item.part_of_speech] = pos.get(item.part_of_speech, 0) + 1
    return {
        "topics": _sorted_counts(topics),
        "pos": _sorted_counts(pos),
        "totalItems": total,
        "archivedItems": archived,
        "duplicateGroups": duplicates.group_count(session),
    }

"""In-memory read model of the vocabulary bank.

The bank is small (one teacher, thousands of words), so keeping a pre-normalised copy in memory makes
search, suggestions and filters instant during a live lesson. Every write goes through a service that
calls `refresh(ids)` after committing, so only the changed items are re-read. SQLite stays the single
source of truth; `invalidate()` drops the whole copy (used after a restore).
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from .text import normalize


@dataclass(slots=True)
class Item:
    """A vocabulary item in memory. The n_* fields hold normalised text for searching."""

    id: str
    english: str
    polish: list[str]
    definition: str | None
    part_of_speech: str | None
    cefr: str | None
    example: str | None
    topics: list[str]
    notes: str | None
    archived: bool
    created_at: str
    updated_at: str
    n_english: str = ""
    n_polish: list[str] = field(default_factory=list)
    n_fields: dict[str, str] = field(default_factory=dict)
    _json: dict | None = None

    def to_json(self) -> dict:
        """The item as the API returns it, built once and reused."""
        if self._json is None:
            self._json = {
                "id": self.id,
                "english": self.english,
                "polish": self.polish,
                "definition": self.definition,
                "partOfSpeech": self.part_of_speech,
                "cefr": self.cefr,
                "example": self.example,
                "topics": self.topics,
                "notes": self.notes,
                "archived": self.archived,
                "createdAt": self.created_at,
                "updatedAt": self.updated_at,
            }
        return self._json


class VocabIndex:
    """Thread-safe in-memory copy of the bank, loaded on first use."""

    def __init__(self) -> None:
        """Start empty; the first read loads the data."""
        self._lock = threading.Lock()
        self._items: dict[str, Item] | None = None

    def invalidate(self) -> None:
        """Drop the whole copy so the next read reloads it."""
        with self._lock:
            self._items = None

    def items(self, session: Session) -> dict[str, Item]:
        """All items by id, loading them if needed."""
        with self._lock:
            if self._items is None:
                self._items = self._load(session)
            return self._items

    def get(self, session: Session, item_id: str) -> Item | None:
        """One item by id, or None."""
        return self.items(session).get(item_id)

    def refresh(self, session: Session, ids: list[str]) -> None:
        """Re-read only the given items after a committed write (fast even with a large bank)."""
        with self._lock:
            if self._items is None:
                return  # will load fully on next read
            fresh = self._load(session, ids)
            for i in ids:
                if i in fresh:
                    self._items[i] = fresh[i]
                else:
                    self._items.pop(i, None)

    @staticmethod
    def _load(session: Session, ids: list[str] | None = None) -> dict[str, Item]:
        """Read items and their topics from SQLite: all of them, or only the given ids."""
        topics: dict[str, list[str]] = {}
        topics_query = (
            select(models.ItemTopic.item_id, models.Topic.name)
            .join(models.Topic, models.Topic.id == models.ItemTopic.topic_id)
            .order_by(models.ItemTopic.item_id, models.ItemTopic.position)
        )
        items_query = select(models.VocabItem)
        out: dict[str, Item] = {}
        chunks = [ids[i : i + 500] for i in range(0, len(ids), 500)] if ids is not None else [None]
        for chunk in chunks:
            for item_id, name in session.execute(
                topics_query if chunk is None else topics_query.where(models.ItemTopic.item_id.in_(chunk))
            ):
                topics.setdefault(item_id, []).append(name)
        rows = [
            row
            for chunk in chunks
            for row in session.execute(
                items_query if chunk is None else items_query.where(models.VocabItem.id.in_(chunk))
            ).scalars()
        ]
        for row in rows:
            polish = json.loads(row.polish or "[]")
            item_topics = topics.get(row.id, [])
            item = Item(
                id=row.id,
                english=row.english,
                polish=polish,
                definition=row.definition,
                part_of_speech=row.part_of_speech,
                cefr=row.cefr,
                example=row.example,
                topics=item_topics,
                notes=row.notes,
                archived=bool(row.archived),
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
            item.n_english = normalize(row.english)
            item.n_polish = [normalize(word) for word in polish]
            item.n_fields = {
                "polish": " | ".join(item.n_polish),
                "definition": normalize(row.definition),
                "example": normalize(row.example),
                "topics": " | ".join(normalize(t) for t in item_topics),
                "notes": normalize(row.notes),
            }
            out[row.id] = item
        return out


index = VocabIndex()

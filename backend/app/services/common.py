"""Small helpers shared by the services, plus the settings cache."""

from __future__ import annotations

import json
import uuid

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import models
from ..schemas import SettingsModel
from .index import index


def uid() -> str:
    """A new random id."""
    return uuid.uuid4().hex


def not_found(what: str) -> HTTPException:
    """404 error for a missing record."""
    return HTTPException(404, f"{what} not found")


def bad(msg: str) -> HTTPException:
    """400 error with a message the teacher can read."""
    return HTTPException(400, msg)


def clean_text(value: str | None) -> str | None:
    """Trim text; empty becomes None."""
    if value is None:
        return None
    value = value.strip()
    return value or None


def clean_list(values: list[str]) -> list[str]:
    """Trim values, dropping blanks and duplicates while keeping the order."""
    seen: list[str] = []
    for value in values:
        value = value.strip()
        if value and value not in seen:
            seen.append(value)
    return seen


def topic_cache(session: Session) -> dict[str, int]:
    """All topic names mapped to their ids."""
    return {name: tid for tid, name in session.execute(select(models.Topic.id, models.Topic.name))}


def set_item_topics(
    session: Session, item_id: str, names: list[str], cache: dict[str, int] | None = None, new: bool = False
) -> None:
    """Replace an item's topics. Pass `cache` (from topic_cache) when writing many items in one go."""
    if not new:
        session.execute(delete(models.ItemTopic).where(models.ItemTopic.item_id == item_id))
    cache = cache if cache is not None else topic_cache(session)
    for pos, name in enumerate(clean_list(names)):
        name = name[:80]
        if name not in cache:
            topic = models.Topic(name=name)
            session.add(topic)
            session.flush()
            cache[name] = topic.id
        session.add(models.ItemTopic(item_id=item_id, topic_id=cache[name], position=pos))


_settings_cache: SettingsModel | None = None


def get_settings(session: Session) -> SettingsModel:
    """App settings, read from the database once and then kept in memory."""
    global _settings_cache
    if _settings_cache is None:
        row = session.get(models.Setting, "app")
        _settings_cache = SettingsModel.model_validate(json.loads(row.value)) if row else SettingsModel()
    return _settings_cache


def save_settings(session: Session, settings: SettingsModel) -> SettingsModel:
    """Save settings and update the in-memory copy."""
    global _settings_cache
    row = session.get(models.Setting, "app")
    value = settings.model_dump_json(by_alias=True)
    if row:
        row.value = value
    else:
        session.add(models.Setting(key="app", value=value))
    session.commit()
    _settings_cache = settings
    return settings


def reset_caches() -> None:
    """Forget everything held in memory (after a restore or a new database)."""
    global _settings_cache
    _settings_cache = None
    index.invalidate()

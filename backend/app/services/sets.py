"""Reusable word sets."""

from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models
from ..timeutil import now_iso
from .common import bad, clean_text, not_found, uid


def set_json(session: Session, row: models.VocabSet) -> dict:
    """A set as the API returns it, with its item ids in order."""
    ids = list(
        session.execute(
            select(models.SetItem.item_id).where(models.SetItem.set_id == row.id).order_by(models.SetItem.position)
        ).scalars()
    )
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "itemIds": ids,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    }


def list_sets(session: Session) -> list[dict]:
    """All sets by name. Reads the members in one query so it stays fast with many sets."""
    rows = session.execute(select(models.VocabSet).order_by(func.lower(models.VocabSet.name))).scalars().all()
    members: dict[str, list[str]] = {row.id: [] for row in rows}
    for set_id, item_id in session.execute(
        select(models.SetItem.set_id, models.SetItem.item_id).order_by(models.SetItem.set_id, models.SetItem.position)
    ):
        members.setdefault(set_id, []).append(item_id)
    return [
        {
            "id": row.id,
            "name": row.name,
            "description": row.description,
            "itemIds": members[row.id],
            "createdAt": row.created_at,
            "updatedAt": row.updated_at,
        }
        for row in rows
    ]


def _existing_item_ids(session: Session, ids: list[str]) -> list[str]:
    """The given ids that really exist, without duplicates, in the given order."""
    found = set(session.execute(select(models.VocabItem.id).where(models.VocabItem.id.in_(ids))).scalars())
    return [i for i in dict.fromkeys(ids) if i in found]


def create_set(session: Session, name: str, description: str | None, item_ids: list[str]) -> dict:
    """Create a set. The name must be unique, ignoring case."""
    name = name.strip()
    if not name:
        raise bad("Set name is required")
    at = now_iso()
    row = models.VocabSet(id=uid(), name=name, description=clean_text(description), created_at=at, updated_at=at)
    session.add(row)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise bad("A set with this name already exists") from None
    for position, item_id in enumerate(_existing_item_ids(session, item_ids)):
        session.add(models.SetItem(set_id=row.id, item_id=item_id, position=position))
    session.commit()
    return set_json(session, row)


def update_set(session: Session, set_id: str, name: str | None, description: str | None, set_description: bool) -> dict:
    """Rename a set or change its description."""
    row = session.get(models.VocabSet, set_id)
    if not row:
        raise not_found("Set")
    if name is not None:
        if not name.strip():
            raise bad("Set name is required")
        row.name = name.strip()
    if set_description:
        row.description = clean_text(description)
    row.updated_at = now_iso()
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise bad("A set with this name already exists") from None
    return set_json(session, row)


def delete_set(session: Session, set_id: str) -> None:
    """Delete a set. Its items stay in the bank."""
    session.execute(delete(models.VocabSet).where(models.VocabSet.id == set_id))
    session.commit()


def add_to_set(session: Session, set_id: str, item_ids: list[str]) -> dict:
    """Add items after the existing ones. Returns how many were added and how many were already there."""
    row = session.get(models.VocabSet, set_id)
    if not row:
        raise not_found("Set")
    present = set(session.execute(select(models.SetItem.item_id).where(models.SetItem.set_id == set_id)).scalars())
    position = (
        session.execute(
            select(func.coalesce(func.max(models.SetItem.position), -1)).where(models.SetItem.set_id == set_id)
        ).scalar_one()
        + 1
    )
    wanted = list(dict.fromkeys(item_ids))
    add = [i for i in _existing_item_ids(session, wanted) if i not in present]
    for i in add:
        session.add(models.SetItem(set_id=set_id, item_id=i, position=position))
        position += 1
    row.updated_at = now_iso()
    session.commit()
    return {"added": len(add), "already": len(wanted) - len(add)}


def remove_from_set(session: Session, set_id: str, item_ids: list[str]) -> int:
    """Take items out of a set. Returns how many were removed."""
    if not session.get(models.VocabSet, set_id):
        raise not_found("Set")
    result = session.execute(
        delete(models.SetItem).where(models.SetItem.set_id == set_id, models.SetItem.item_id.in_(item_ids))
    )
    session.commit()
    return result.rowcount or 0

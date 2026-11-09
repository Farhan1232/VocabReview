"""Students, their cards and duplicate-safe assignment."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models
from ..timeutil import matches_due, now, now_iso, parse
from . import fsrs_service
from .common import bad, clean_text, get_settings, not_found, uid
from .index import index


def student_json(row: models.Student) -> dict:
    """A student as the API returns it."""
    return {"id": row.id, "name": row.name, "notes": row.notes, "active": bool(row.active), "createdAt": row.created_at}


def _summary(
    session: Session, student: models.Student, cards: list[models.StudentCard], last_review: str | None
) -> dict:
    """A student with counts for the overview: states, due today, overdue, difficult."""
    settings = get_settings(session)
    at = now()
    items = index.items(session)
    counts = {"new": 0, "learning": 0, "review": 0, "mastered": 0}
    due_now = overdue = due_today = difficult = 0
    next_due: str | None = None
    for card in cards:
        item = items.get(card.item_id)
        if not item or item.archived:
            continue
        counts[fsrs_service.learning_state(card, settings)] += 1
        if parse(card.due) <= at:
            due_now += 1
        if matches_due("overdue", card.due, at):
            overdue += 1
        if matches_due("due_today", card.due, at):
            due_today += 1
        if fsrs_service.is_difficult(card, settings):
            difficult += 1
        if parse(card.due) > at and (next_due is None or card.due < next_due):
            next_due = card.due
    return {
        "student": student_json(student),
        "total": sum(counts.values()),
        "counts": counts,
        "dueNow": due_now,
        "overdue": overdue,
        "dueToday": due_today,
        "difficult": difficult,
        "lastReviewedAt": last_review,
        "nextDueAt": next_due,
    }


def list_students(session: Session) -> list[dict]:
    """All students with counts, active ones first. Loads cards once for all students to stay fast."""
    rows = session.execute(select(models.Student)).scalars().all()
    by_student: dict[str, list[models.StudentCard]] = {row.id: [] for row in rows}
    for card in session.execute(select(models.StudentCard).where(models.StudentCard.archived.is_(False))).scalars():
        by_student.setdefault(card.student_id, []).append(card)
    last = dict(
        session.execute(
            select(models.ReviewLog.student_id, func.max(models.ReviewLog.reviewed_at))
            .where(models.ReviewLog.kind == "review")
            .group_by(models.ReviewLog.student_id)
        ).all()
    )
    out = [_summary(session, row, by_student[row.id], last.get(row.id)) for row in rows]
    out.sort(key=lambda summary: (not summary["student"]["active"], summary["student"]["name"].lower()))
    return out


def get_student(session: Session, student_id: str) -> dict:
    """One student with counts."""
    row = session.get(models.Student, student_id)
    if not row:
        raise not_found("Student")
    cards = (
        session.execute(
            select(models.StudentCard).where(
                models.StudentCard.student_id == student_id, models.StudentCard.archived.is_(False)
            )
        )
        .scalars()
        .all()
    )
    last = session.execute(
        select(func.max(models.ReviewLog.reviewed_at)).where(
            models.ReviewLog.student_id == student_id, models.ReviewLog.kind == "review"
        )
    ).scalar()
    return _summary(session, row, list(cards), last)


def create_student(session: Session, name: str, notes: str | None) -> dict:
    """Add a student."""
    if not name.strip():
        raise bad("Name is required")
    row = models.Student(id=uid(), name=name.strip(), notes=clean_text(notes), active=True, created_at=now_iso())
    session.add(row)
    session.commit()
    return student_json(row)


def update_student(
    session: Session, student_id: str, name: str | None, notes: str | None, set_notes: bool, active: bool | None
) -> dict:
    """Change only the fields that were sent."""
    row = session.get(models.Student, student_id)
    if not row:
        raise not_found("Student")
    if name is not None:
        if not name.strip():
            raise bad("Name is required")
        row.name = name.strip()
    if set_notes:
        row.notes = clean_text(notes)
    if active is not None:
        row.active = active
    session.commit()
    return student_json(row)


def last_ratings(session: Session, card_ids: list[str]) -> dict[str, int]:
    """The most recent rating of each card."""
    if not card_ids:
        return {}
    sub = (
        select(models.ReviewLog.card_id, func.max(models.ReviewLog.reviewed_at).label("at"))
        .where(models.ReviewLog.kind == "review", models.ReviewLog.card_id.in_(card_ids))
        .group_by(models.ReviewLog.card_id)
        .subquery()
    )
    rows = session.execute(
        select(models.ReviewLog.card_id, models.ReviewLog.rating)
        .join(sub, (sub.c.card_id == models.ReviewLog.card_id) & (sub.c.at == models.ReviewLog.reviewed_at))
        .where(models.ReviewLog.kind == "review")
    )
    return dict(rows.all())


def student_cards(session: Session, student_id: str) -> list[dict]:
    """A student's active cards with their words, soonest due first."""
    if not session.get(models.Student, student_id):
        raise not_found("Student")
    settings = get_settings(session)
    items = index.items(session)
    cards = (
        session.execute(
            select(models.StudentCard)
            .where(models.StudentCard.student_id == student_id, models.StudentCard.archived.is_(False))
            .order_by(models.StudentCard.due)
        )
        .scalars()
        .all()
    )
    last = last_ratings(session, [card.id for card in cards])
    return [
        {
            "card": fsrs_service.card_json(card, settings),
            "item": items[card.item_id].to_json(),
            "lastRating": last.get(card.id),
        }
        for card in cards
        if card.item_id in items
    ]


def assign(session: Session, student_id: str, item_ids: list[str]) -> dict:
    """Creates at most one card per (student, item). Re-assigning an archived card restores it with its history."""
    if not session.get(models.Student, student_id):
        raise not_found("Student")
    wanted = list(dict.fromkeys(item_ids))
    valid = set(session.execute(select(models.VocabItem.id).where(models.VocabItem.id.in_(wanted))).scalars())
    existing = {
        card.item_id: card
        for card in session.execute(
            select(models.StudentCard).where(
                models.StudentCard.student_id == student_id, models.StudentCard.item_id.in_(wanted)
            )
        ).scalars()
    }
    created = already = restored = 0
    at = now_iso()
    for item_id in wanted:
        if item_id not in valid:
            continue
        card = existing.get(item_id)
        if card is None:
            session.add(
                models.StudentCard(
                    id=uid(),
                    student_id=student_id,
                    item_id=item_id,
                    archived=False,
                    assigned_at=at,
                    **fsrs_service.new_card_fields(),
                )
            )
            created += 1
        elif card.archived:
            card.archived = False
            restored += 1
        else:
            already += 1
    try:
        session.commit()
    except IntegrityError:  # a concurrent identical request; the unique key kept the data correct
        session.rollback()
        return assign(session, student_id, item_ids)
    return {"created": created, "alreadyAssigned": already, "restored": restored}


def unassign(session: Session, card_ids: list[str]) -> int:
    """Archive cards. Returns how many changed."""
    rows = (
        session.execute(
            select(models.StudentCard).where(
                models.StudentCard.id.in_(card_ids), models.StudentCard.archived.is_(False)
            )
        )
        .scalars()
        .all()
    )
    for card in rows:
        card.archived = True
    session.commit()
    return len(rows)

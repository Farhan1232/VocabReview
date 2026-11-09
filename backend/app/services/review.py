"""Review sessions: building the queue, saving ratings, teacher resets and history."""

from __future__ import annotations

import random

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models
from ..schemas import QueueRequest
from ..timeutil import iso, matches_due, now, parse
from . import fsrs_service
from .common import get_settings, not_found, uid
from .index import index
from .students import last_ratings


def log_json(entry: models.ReviewLog) -> dict:
    """A review log row as the API returns it."""
    return {
        "id": entry.id,
        "cardId": entry.card_id,
        "studentId": entry.student_id,
        "itemId": entry.item_id,
        "kind": entry.kind,
        "rating": entry.rating,
        "reviewedAt": entry.reviewed_at,
        "previousDue": entry.previous_due,
        "nextDue": entry.next_due,
        "previousState": entry.previous_state,
        "nextState": entry.next_state,
        "requestId": entry.request_id,
        "note": entry.note,
    }


def queue(session: Session, req: QueueRequest) -> list[dict]:
    """Pick the cards for a session, using the requested source and filters."""
    if not session.get(models.Student, req.student_id):
        raise not_found("Student")
    settings = get_settings(session)
    items = index.items(session)
    at = now()
    cards = (
        session.execute(
            select(models.StudentCard).where(
                models.StudentCard.student_id == req.student_id, models.StudentCard.archived.is_(False)
            )
        )
        .scalars()
        .all()
    )
    set_ids = (
        set(session.execute(select(models.SetItem.item_id).where(models.SetItem.set_id == req.set_id)).scalars())
        if req.source == "set" and req.set_id
        else set()
    )
    selected = set(req.item_ids or [])

    def keep(card: models.StudentCard) -> bool:
        """True if this card belongs in the session."""
        item = items.get(card.item_id)
        if not item or item.archived:
            return False
        if req.cefr and item.cefr not in req.cefr:
            return False
        if req.topics and not any(t in req.topics for t in item.topics):
            return False
        learning = fsrs_service.learning_state(card, settings)
        match req.source:
            case "due":
                return parse(card.due) <= at or matches_due("due_today", card.due, at)
            case "overdue":
                return matches_due("overdue", card.due, at)
            case "new":
                return learning == "new"
            case "learning":
                return learning in ("learning", "review")
            case "difficult":
                return fsrs_service.is_difficult(card, settings)
            case "set":
                return card.item_id in set_ids
            case "selection":
                return card.item_id in selected
            case _:
                return True

    chosen = [card for card in cards if keep(card)]
    # Lesson order: reviewed cards by how overdue they are, new cards last.
    chosen.sort(key=lambda card: (card.reps == 0, card.due))
    if req.shuffle:
        random.shuffle(chosen)
    if req.limit:
        chosen = chosen[: req.limit]
    last = last_ratings(session, [card.id for card in chosen])
    return [
        {
            "card": fsrs_service.card_json(card, settings),
            "item": items[card.item_id].to_json(),
            "lastRating": last.get(card.id),
        }
        for card in chosen
    ]


def preview(session: Session, card_id: str) -> dict:
    """When each rating would make this card due next."""
    card = session.get(models.StudentCard, card_id)
    if not card:
        raise not_found("Card")
    return {str(k): v for k, v in fsrs_service.preview(card, get_settings(session)).items()}


def rate(session: Session, card_id: str, rating: int, request_id: str) -> dict:
    """Idempotent: the same request_id always returns the first result and never saves twice."""
    settings = get_settings(session)
    prior = session.execute(
        select(models.ReviewLog).where(models.ReviewLog.request_id == request_id)
    ).scalar_one_or_none()
    card = session.get(models.StudentCard, card_id)
    if not card:
        raise not_found("Card")
    if prior:
        return {"card": fsrs_service.card_json(card, settings), "log": log_json(prior), "duplicate": True}
    at = now()
    prev_due, prev_state, was_new = card.due, fsrs_service.display_state(card), card.reps == 0
    fsrs_service.apply_review(card, rating, at, settings)
    new_log = models.ReviewLog(
        id=uid(),
        card_id=card.id,
        student_id=card.student_id,
        item_id=card.item_id,
        kind="review",
        rating=rating,
        reviewed_at=iso(at),
        previous_due=None if was_new else prev_due,
        next_due=card.due,
        previous_state=prev_state,
        next_state=fsrs_service.display_state(card),
        request_id=request_id,
        note=None,
    )
    session.add(new_log)
    try:
        session.commit()
    except IntegrityError:
        # Two identical requests raced; the unique request_id let only one through. Return that one.
        session.rollback()
        session.expire_all()
        prior = session.execute(select(models.ReviewLog).where(models.ReviewLog.request_id == request_id)).scalar_one()
        card = session.get(models.StudentCard, card_id)
        return {"card": fsrs_service.card_json(card, settings), "log": log_json(prior), "duplicate": True}
    return {"card": fsrs_service.card_json(card, settings), "log": log_json(new_log), "duplicate": False}


def reset(session: Session, card_id: str, mode: str, note: str | None) -> None:
    """Manual teacher change, logged as 'reset' or 'override' — never as a student review."""
    card = session.get(models.StudentCard, card_id)
    if not card:
        raise not_found("Card")
    prev_due, prev_state = card.due, fsrs_service.display_state(card)
    if mode == "new":
        for field, value in fsrs_service.new_card_fields().items():
            setattr(card, field, value)
    else:
        card.due = iso(now())
    session.add(
        models.ReviewLog(
            id=uid(),
            card_id=card.id,
            student_id=card.student_id,
            item_id=card.item_id,
            kind="reset" if mode == "new" else "override",
            rating=None,
            reviewed_at=iso(now()),
            previous_due=prev_due,
            next_due=card.due,
            previous_state=prev_state,
            next_state=fsrs_service.display_state(card),
            request_id=uid(),
            note=(note or "").strip() or ("Reset to new" if mode == "new" else "Made due now"),
        )
    )
    session.commit()


def history(session: Session, student_id: str, item_id: str | None) -> list[dict]:
    """A student's log entries, newest first, with the word's text attached."""
    query = select(models.ReviewLog).where(models.ReviewLog.student_id == student_id)
    if item_id:
        query = query.where(models.ReviewLog.item_id == item_id)
    items = index.items(session)
    out = []
    for entry in session.execute(query.order_by(models.ReviewLog.reviewed_at.desc(), models.ReviewLog.id)).scalars():
        item = items.get(entry.item_id)
        out.append(
            {
                **log_json(entry),
                "english": item.english if item else "(deleted)",
                "definition": item.definition if item else None,
            }
        )
    return out

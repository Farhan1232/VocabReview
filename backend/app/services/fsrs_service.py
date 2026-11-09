"""FSRS scheduling with the official py-fsrs library. The algorithm and its parameters are unmodified.

Review frequency is the library's own desired_retention option (Settings, default 0.9). A new value
only affects the next rating of each word; due dates already saved do not move.

Mapping: Again=1, Hard=2, Good=3, Easy=4 (one-to-one with fsrs.Rating).
py-fsrs keeps state/step/stability/difficulty/due/last_review; this app additionally counts reps and
lapses (a lapse = "Again" on a card in the Review state) for display and the "difficult" filter.
Learning state shown to the teacher (display only, never changes scheduling):
  New       = never reviewed
  Learning  = FSRS Learning or Relearning
  Review    = FSRS Review with stability below the Mastered threshold
  Mastered  = FSRS Review with stability >= threshold (Settings, default 21 days)
"""

from __future__ import annotations

import random
from datetime import datetime
from functools import lru_cache
from importlib.metadata import version

from fsrs import Card, Rating, Scheduler, State

from .. import models
from ..schemas import SettingsModel
from ..timeutil import iso, now, parse

FSRS_VERSION = version("fsrs")


@lru_cache(maxsize=8)
def scheduler_for(desired_retention: float) -> Scheduler:
    """A stock scheduler (fuzzing on, default steps and parameters) with this retention target."""
    return Scheduler(desired_retention=desired_retention)


def new_card_fields(at: datetime | None = None) -> dict:
    """Column values for a card that has never been reviewed."""
    at = at or now()
    return {
        "fsrs_state": int(State.Learning),
        "fsrs_step": 0,
        "stability": None,
        "difficulty": None,
        "due": iso(at),
        "last_review": None,
        "reps": 0,
        "lapses": 0,
        "fsrs_card_id": random.randint(1, 2**53),
    }


def to_lib(card: models.StudentCard) -> Card:
    """Convert a database card to the FSRS library's Card."""
    return Card(
        card_id=card.fsrs_card_id,
        state=State(card.fsrs_state),
        step=card.fsrs_step,
        stability=card.stability,
        difficulty=card.difficulty,
        due=parse(card.due),
        last_review=parse(card.last_review) if card.last_review else None,
    )


def apply_review(card: models.StudentCard, rating: int, at: datetime, settings: SettingsModel) -> None:
    """Run one rating through FSRS and store the result on the card."""
    before = State(card.fsrs_state)
    scheduled, _log = scheduler_for(settings.desired_retention).review_card(to_lib(card), Rating(rating), at)
    card.fsrs_state = int(scheduled.state)
    card.fsrs_step = scheduled.step
    card.stability = scheduled.stability
    card.difficulty = scheduled.difficulty
    card.due = iso(scheduled.due)
    card.last_review = iso(scheduled.last_review) if scheduled.last_review else None
    card.reps += 1
    if rating == 1 and before == State.Review:
        card.lapses += 1


def preview(card: models.StudentCard, settings: SettingsModel, at: datetime | None = None) -> dict[int, str]:
    """The due time each rating would give, without saving anything."""
    at = at or now()
    scheduler = scheduler_for(settings.desired_retention)
    out = {}
    for rating in (1, 2, 3, 4):
        scheduled, _ = scheduler.review_card(to_lib(card), Rating(rating), at)
        out[rating] = iso(scheduled.due)
    return out


def display_state(card: models.StudentCard) -> int:
    """0 New, 1 Learning, 2 Review, 3 Relearning — the frontend's FsrsState."""
    return 0 if card.reps == 0 else card.fsrs_state


def learning_state(card: models.StudentCard, settings: SettingsModel) -> str:
    """Teacher-facing label: new, learning, review or mastered."""
    if card.reps == 0:
        return "new"
    if card.fsrs_state in (int(State.Learning), int(State.Relearning)):
        return "learning"
    return "mastered" if (card.stability or 0) >= settings.mastered_stability_days else "review"


def is_difficult(card: models.StudentCard, settings: SettingsModel) -> bool:
    """True if the card passes the Settings thresholds for lapses or difficulty."""
    if card.reps == 0:
        return False
    return card.lapses >= settings.difficult_lapses or (card.difficulty or 0) >= settings.difficult_difficulty


def card_json(card: models.StudentCard, settings: SettingsModel) -> dict:
    """A card as the API returns it."""
    return {
        "id": card.id,
        "studentId": card.student_id,
        "itemId": card.item_id,
        "archived": bool(card.archived),
        "assignedAt": card.assigned_at,
        "fsrs": {
            "due": card.due,
            "stability": card.stability or 0.0,
            "difficulty": card.difficulty or 0.0,
            "reps": card.reps,
            "lapses": card.lapses,
            "state": display_state(card),
            "lastReview": card.last_review,
            "raw": {"fsrsState": card.fsrs_state, "step": card.fsrs_step},
        },
        "learningState": learning_state(card, settings),
        "difficult": is_difficult(card, settings),
    }

"""CSV exports for portability/inspection (UTF-8 with BOM so Excel shows Polish letters correctly)."""

from __future__ import annotations

import csv
import io
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from .common import bad
from .index import index


def _csv_text(header: list[str], rows: list[list]) -> str:
    """Build CSV text with Windows line endings and a BOM for Excel."""
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow(header)
    writer.writerows(rows)
    return "﻿" + buf.getvalue()


def export(session: Session, kind: str) -> dict:
    """Build one CSV export: vocabulary, students, cards or history."""
    items = index.items(session)
    students = {student.id: student.name for student in session.execute(select(models.Student)).scalars()}
    if kind == "vocabulary":
        content = _csv_text(
            [
                "id",
                "english",
                "polish",
                "definition",
                "part_of_speech",
                "cefr",
                "example",
                "topics",
                "notes",
                "archived",
            ],
            [
                [
                    item.id,
                    item.english,
                    "; ".join(item.polish),
                    item.definition or "",
                    item.part_of_speech or "",
                    item.cefr or "",
                    item.example or "",
                    "; ".join(item.topics),
                    item.notes or "",
                    item.archived,
                ]
                for item in sorted(items.values(), key=lambda item: item.english.lower())
            ],
        )
    elif kind == "students":
        content = _csv_text(
            ["id", "name", "notes", "active"],
            [
                [student.id, student.name, student.notes or "", student.active]
                for student in session.execute(select(models.Student)).scalars()
            ],
        )
    elif kind == "cards":
        content = _csv_text(
            [
                "student",
                "english",
                "item_id",
                "archived",
                "fsrs_state",
                "due_utc",
                "last_review_utc",
                "stability",
                "difficulty",
                "reps",
                "lapses",
            ],
            [
                [
                    students.get(card.student_id),
                    items[card.item_id].english if card.item_id in items else "",
                    card.item_id,
                    card.archived,
                    card.fsrs_state,
                    card.due,
                    card.last_review or "",
                    f"{card.stability:.4f}" if card.stability is not None else "",
                    f"{card.difficulty:.4f}" if card.difficulty is not None else "",
                    card.reps,
                    card.lapses,
                ]
                for card in session.execute(select(models.StudentCard)).scalars()
            ],
        )
    elif kind == "history":
        content = _csv_text(
            [
                "reviewed_at_utc",
                "student",
                "english",
                "item_id",
                "kind",
                "rating",
                "previous_due_utc",
                "next_due_utc",
                "note",
            ],
            [
                [
                    entry.reviewed_at,
                    students.get(entry.student_id),
                    items[entry.item_id].english if entry.item_id in items else "",
                    entry.item_id,
                    entry.kind,
                    entry.rating or "",
                    entry.previous_due or "",
                    entry.next_due,
                    entry.note or "",
                ]
                for entry in session.execute(select(models.ReviewLog).order_by(models.ReviewLog.reviewed_at)).scalars()
            ],
        )
    else:
        raise bad("Unknown export")
    return {"fileName": f"{kind}-{date.today().isoformat()}.csv", "content": content}

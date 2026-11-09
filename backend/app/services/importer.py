"""CSV import (the browser parses the file; the server validates, classifies and commits).

Duplicate rule: a row is an exact duplicate when English AND the sense match (definition, or
Polish when there is no definition). A row that is the same word (see duplicates.same_word:
same English and part of speech) with a differently worded sense is a "possible duplicate":
it is added by default and flagged (the teacher can skip it, or clean up later on the Vocabulary page). Same English with a
different part of speech is a new word. Senses are never merged by spelling alone.
Updating an existing item only fills its blank fields; teacher content is never overwritten.
"""

from __future__ import annotations

import json
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..schemas import ImportPreviewRow, VocabDraft
from ..timeutil import now_iso
from .common import set_item_topics, topic_cache, uid
from .duplicates import same_word
from .index import index
from .text import normalize
from .vocab import clean_draft, write_fields

CEFR = {"A1", "A2", "B1", "B2", "C1", "C2"}
_VALUE_SEPARATORS = re.compile(r"[;,/|]")


def _split_values(value: str) -> list[str]:
    """Split a CSV cell like "bank; brzeg" into separate values."""
    return [part.strip() for part in _VALUE_SEPARATORS.split(value) if part.strip()]


def row_to_draft(row: list[str], mapping: list[str]) -> tuple[dict, list[str], bool]:
    """Turn one CSV row into a draft. Returns the draft, messages for the teacher, and whether the row is rejected."""
    draft = {
        "english": "",
        "polish": [],
        "definition": None,
        "partOfSpeech": None,
        "cefr": None,
        "example": None,
        "topics": [],
        "notes": None,
    }
    messages: list[str] = []
    for i, field_name in enumerate(mapping):
        value = (row[i] if i < len(row) else "").strip()
        if not value or field_name == "ignore":
            continue
        if field_name == "polish":
            draft["polish"] = _split_values(value)
        elif field_name == "topics":
            draft["topics"] = _split_values(value)
        elif field_name == "partOfSpeech":
            draft["partOfSpeech"] = value.lower()[:40]
        elif field_name == "cefr":
            if value.upper() in CEFR:
                draft["cefr"] = value.upper()
            else:
                messages.append(f'Unknown CEFR level "{value}" — left blank')
        else:
            draft[field_name] = value
    error = not draft["english"]
    if error:
        messages.insert(0, "English word is required")
    if len(draft["english"]) > 200:
        messages.insert(0, "English is longer than 200 characters")
        error = True
    return draft, messages, error


def _sense_key(definition: str | None, polish: list[str]) -> str:
    """Text that identifies a word's meaning: the definition, or the Polish when there is none."""
    return f"d:{normalize(definition)}" if definition else "p:" + "|".join(sorted(normalize(word) for word in polish))


def build_preview(session: Session, rows: list[list[str]], mapping: list[str]) -> list[dict]:
    """Classify each row as new, exact duplicate, possible duplicate or error. Saves nothing."""
    by_english: dict[str, list] = {}
    for item in index.items(session).values():
        if not item.archived:
            by_english.setdefault(item.n_english, []).append(item)
    seen: dict[str, int] = {}
    seen_words: dict[str, list[tuple[int, str | None]]] = {}
    out = []
    for idx, row in enumerate(rows):
        draft, messages, error = row_to_draft(row, mapping)
        base = {"index": idx, "draft": draft, "messages": messages, "matches": [], "updateTargetId": None}
        if error:
            out.append({**base, "status": "error", "action": "skip"})
            continue
        english = normalize(draft["english"])
        pos = draft["partOfSpeech"]
        key = f"{english}#{_sense_key(draft['definition'], draft['polish'])}"
        if key in seen:
            messages.append(f"Same word and sense as row {seen[key] + 2} in this file")
            out.append({**base, "status": "exact_duplicate", "action": "skip"})
            continue
        seen[key] = idx
        earlier = seen_words.setdefault(english, [])
        repeat_of = next((i for i, other_pos in earlier if same_word(english, pos, english, other_pos)), None)
        earlier.append((idx, pos))
        same = by_english.get(english, [])
        matches = [
            {"id": item.id, "english": item.english, "definition": item.definition, "polish": item.polish}
            for item in same
        ]
        exact = next(
            (
                item
                for item in same
                if _sense_key(item.definition, item.polish) == _sense_key(draft["definition"], draft["polish"])
            ),
            None,
        )
        same_words = [item for item in same if same_word(english, pos, item.n_english, item.part_of_speech)]
        if exact:
            messages.append("Already in the bank (same word and sense)")
            out.append(
                {**base, "matches": matches, "status": "exact_duplicate", "action": "skip", "updateTargetId": exact.id}
            )
        elif same_words:
            messages.append(
                f"Already in the bank ({len(same_words)} word(s) with the same English and part of speech)"
                " — will be added and flagged as a duplicate"
            )
            out.append({**base, "matches": matches, "status": "possible_duplicate", "action": "add"})
        elif repeat_of is not None:
            messages.append(f"Same word as row {repeat_of + 2} in this file — will be added and flagged as a duplicate")
            out.append({**base, "matches": matches, "status": "possible_duplicate", "action": "add"})
        else:
            if same:
                kinds = ", ".join(sorted({item.part_of_speech or "?" for item in same}))
                messages.append(f"Also in the bank as another part of speech ({kinds})")
            out.append({**base, "matches": matches, "status": "new", "action": "add"})
    return out


def commit(session: Session, file_name: str, rows: list[ImportPreviewRow]) -> dict:
    """Save the reviewed rows and return the added/updated/skipped/rejected counts."""
    added = updated = skipped = rejected = 0
    at = now_iso()
    items = index.items(session)
    cache = topic_cache(session)
    touched: list[str] = []
    for preview_row in rows:
        if preview_row.status == "error":
            rejected += 1
            continue
        if preview_row.action == "skip":
            skipped += 1
            continue
        if len(preview_row.draft.english.strip()) > 200 or len(preview_row.draft.part_of_speech or "") > 40:
            rejected += 1
            continue
        draft: VocabDraft = clean_draft(VocabDraft.model_validate(preview_row.draft.model_dump()))
        if not draft.english:
            rejected += 1
            continue
        if (
            preview_row.action == "update"
            and preview_row.update_target_id
            and (row := session.get(models.VocabItem, preview_row.update_target_id))
        ):
            if row.polish in (None, "", "[]") and draft.polish:
                row.polish = json.dumps(draft.polish, ensure_ascii=False)
            row.definition = row.definition or draft.definition
            row.part_of_speech = row.part_of_speech or draft.part_of_speech
            row.cefr = row.cefr or draft.cefr
            row.example = row.example or draft.example
            row.notes = row.notes or draft.notes
            current = items[row.id].topics if row.id in items else []
            set_item_topics(session, row.id, current + [t for t in draft.topics if t not in current], cache)
            row.updated_at = at
            touched.append(row.id)
            updated += 1
            continue
        row = models.VocabItem(id=uid(), archived=False, created_at=at, updated_at=at)
        write_fields(row, draft)
        session.add(row)
        session.flush()
        set_item_topics(session, row.id, draft.topics, cache, new=True)
        touched.append(row.id)
        added += 1
    run = models.ImportRun(
        id=uid(), file_name=file_name[:255], at=at, added=added, updated=updated, skipped=skipped, rejected=rejected
    )
    session.add(run)
    session.commit()  # one transaction: the whole import succeeds or nothing is saved
    index.refresh(session, touched)
    return {"added": added, "updated": updated, "skipped": skipped, "rejected": rejected, "runId": run.id}


def list_runs(session: Session) -> list[dict]:
    """The 50 most recent imports."""
    rows = session.execute(select(models.ImportRun).order_by(models.ImportRun.at.desc()).limit(50)).scalars()
    return [
        {
            "id": run.id,
            "fileName": run.file_name,
            "at": run.at,
            "added": run.added,
            "updated": run.updated,
            "skipped": run.skipped,
            "rejected": run.rejected,
        }
        for run in rows
    ]

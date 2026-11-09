"""All /api endpoints. Shapes match the frontend's Api interface (frontend/src/api/client.ts)."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..migrate import current_revision, upgrade
from ..schemas import (
    AssignRequest,
    BulkRequest,
    DuplicateCheckRow,
    IdsRequest,
    ImportCommitRequest,
    ImportPreviewRequest,
    MergeRequest,
    QueueRequest,
    RateRequest,
    ResetRequest,
    SetCreate,
    SetItemsRequest,
    SetPatch,
    SettingsModel,
    StudentCreate,
    StudentPatch,
    UnassignRequest,
    VocabDraft,
)
from ..services import backup, duplicates, export, importer, review, sample, sets, students, vocab
from ..services.common import bad, get_settings, reset_caches, save_settings
from ..services.fsrs_service import FSRS_VERSION

router = APIRouter(prefix="/api")


def db(request: Request):
    """Give each request its own database session."""
    yield from request.app.state.db.session()


DB = Annotated[Session, Depends(db)]


def _split_commas(v: str | None) -> list[str]:
    """Read a comma-separated query value ("A1,B2") as a list."""
    return [x for x in (v or "").split(",") if x]


# ------------------------------------------------------------------ vocabulary


@router.get("/vocab")
def search_vocab(
    session: DB,
    q: str = "",
    cefr: str | None = None,
    topic: Annotated[list[str] | None, Query()] = None,
    pos: Annotated[list[str] | None, Query()] = None,
    set: str | None = None,  # noqa: A002
    student: str | None = None,
    assigned: str = "any",
    state: str | None = None,
    due: str = "any",
    difficult: bool = False,
    missing: str | None = None,
    archived: bool = False,
):
    """Search and filter the bank. Every filter is optional and they all combine."""
    if assigned not in ("any", "assigned", "not_assigned") or due not in (
        "any",
        "overdue",
        "due_today",
        "due_soon",
        "not_due",
    ):
        raise bad("Invalid filter")
    query = vocab.VocabQuery(
        q=q[:200],
        cefr=_split_commas(cefr),
        topics=topic or [],
        pos=pos or [],
        set_id=set or None,
        student_id=student or None,
        assignment=assigned,
        states=_split_commas(state),
        due=due,
        difficult=difficult,
        missing=_split_commas(missing),
        include_archived=archived,
    )
    return JSONResponse(vocab.search(session, query))


@router.get("/vocab/suggest")
def suggest(session: DB, q: str = ""):
    """Suggestions shown while typing in the search box."""
    return vocab.suggest(session, q[:200])


@router.get("/vocab/facets")
def facets(session: DB):
    """Topic and part-of-speech counts for the filter menus."""
    return vocab.facets(session)


@router.post("/vocab/duplicates/check")
def check_duplicates(session: DB, rows: list[DuplicateCheckRow]):
    """For rows about to be added: which repeat an earlier row and which are already in the bank. Saves nothing."""
    if len(rows) > 5000:
        raise bad("Too many rows at once")
    return duplicates.check(session, rows)


@router.get("/vocab/duplicates")
def list_duplicates(session: DB):
    """Groups of words in the bank that are the same word."""
    return duplicates.list_groups(session)


@router.post("/vocab/duplicates/merge")
def merge_duplicates(session: DB, body: MergeRequest):
    """Merge each group into the word the teacher keeps, moving sets and student progress onto it."""
    return duplicates.merge(session, body.groups)


@router.post("/vocab/duplicates/dismiss")
def dismiss_duplicates(session: DB, body: IdsRequest):
    """Mark a group as different meanings, so it is not offered as duplicates again."""
    duplicates.dismiss(session, body.ids)
    return {"ok": True}


@router.get("/vocab/{item_id}")
def get_item(session: DB, item_id: str):
    """One item by id."""
    return vocab.get_item(session, item_id)


@router.post("/vocab")
def create_items(session: DB, drafts: list[VocabDraft]):
    """Add one or many words."""
    if len(drafts) > 5000:
        raise bad("Too many rows at once")
    return vocab.create_items(session, drafts)


@router.put("/vocab/{item_id}")
def update_item(session: DB, item_id: str, draft: VocabDraft):
    """Edit a word. Cards and review history are not affected."""
    return vocab.update_item(session, item_id, draft)


@router.post("/vocab/bulk")
def bulk_update(session: DB, body: BulkRequest):
    """Apply the same change to many items."""
    return vocab.bulk_update(session, body.ids, body.patch)


@router.post("/vocab/archive")
def archive(session: DB, body: IdsRequest):
    """Hide items from the bank, keeping all their history."""
    return vocab.set_archived(session, body.ids, True)


@router.post("/vocab/restore")
def restore_items(session: DB, body: IdsRequest):
    """Bring archived items back."""
    return vocab.set_archived(session, body.ids, False)


@router.post("/vocab/delete")
def delete_items(session: DB, body: IdsRequest):
    """Permanently delete items that have no review history."""
    return vocab.delete_items(session, body.ids)


# ------------------------------------------------------------------ sets


@router.get("/sets")
def list_sets(session: DB):
    """All sets."""
    return sets.list_sets(session)


@router.post("/sets")
def create_set(session: DB, body: SetCreate):
    """Create a set."""
    return sets.create_set(session, body.name, body.description, body.item_ids)


@router.patch("/sets/{set_id}")
def update_set(session: DB, set_id: str, body: SetPatch):
    """Rename a set or change its description."""
    return sets.update_set(session, set_id, body.name, body.description, body.set_description)


@router.delete("/sets/{set_id}")
def delete_set(session: DB, set_id: str):
    """Delete a set. Its words stay in the bank."""
    sets.delete_set(session, set_id)
    return {"ok": True}


@router.post("/sets/{set_id}/items")
def add_to_set(session: DB, set_id: str, body: SetItemsRequest):
    """Add items to a set, skipping those already in it."""
    return sets.add_to_set(session, set_id, body.item_ids)


@router.post("/sets/{set_id}/items/remove")
def remove_from_set(session: DB, set_id: str, body: SetItemsRequest):
    """Take items out of a set."""
    return sets.remove_from_set(session, set_id, body.item_ids)


# ------------------------------------------------------------------ students


@router.get("/students")
def list_students(session: DB):
    """All students with their learning counts."""
    return students.list_students(session)


@router.post("/students")
def create_student(session: DB, body: StudentCreate):
    """Add a student."""
    return students.create_student(session, body.name, body.notes)


@router.get("/students/{student_id}")
def get_student(session: DB, student_id: str):
    """One student with their learning counts."""
    return students.get_student(session, student_id)


@router.patch("/students/{student_id}")
def update_student(session: DB, student_id: str, body: StudentPatch):
    """Edit a student or mark them inactive."""
    return students.update_student(session, student_id, body.name, body.notes, body.set_notes, body.active)


@router.get("/students/{student_id}/cards")
def student_cards(session: DB, student_id: str):
    """Every word assigned to a student, with its FSRS state."""
    return JSONResponse(students.student_cards(session, student_id))


@router.get("/students/{student_id}/history")
def history(session: DB, student_id: str, item: str | None = None):
    """A student's review history, optionally for one item."""
    return JSONResponse(review.history(session, student_id, item))


@router.post("/assign")
def assign(session: DB, body: AssignRequest):
    """Assign items to a student, never creating a duplicate."""
    return students.assign(session, body.student_id, body.item_ids)


@router.post("/unassign")
def unassign(session: DB, body: UnassignRequest):
    """Archive student cards. History is kept and assigning again restores them."""
    return students.unassign(session, body.card_ids)


# ------------------------------------------------------------------ review


@router.post("/review/queue")
def review_queue(session: DB, body: QueueRequest):
    """Build the list of cards for a review session."""
    return JSONResponse(review.queue(session, body))


@router.get("/cards/{card_id}/preview")
def preview(session: DB, card_id: str):
    """When each rating would make this card due next."""
    return review.preview(session, card_id)


@router.post("/review/{card_id}/rate")
def rate(session: DB, card_id: str, body: RateRequest):
    """Save a rating. Sending the same request_id again changes nothing."""
    return review.rate(session, card_id, body.rating, body.request_id)


@router.post("/cards/{card_id}/reset")
def reset_card(session: DB, card_id: str, body: ResetRequest):
    """Teacher's manual reset or "due now", logged separately from reviews."""
    review.reset(session, card_id, body.mode, body.note)
    return {"ok": True}


# ------------------------------------------------------------------ import / export


@router.post("/import/preview")
def import_preview(session: DB, body: ImportPreviewRequest):
    """Check CSV rows and classify duplicates. Saves nothing."""
    return JSONResponse(importer.build_preview(session, body.rows, list(body.mapping)))


@router.post("/import/commit")
def import_commit(session: DB, body: ImportCommitRequest):
    """Save the reviewed CSV rows in one transaction."""
    return importer.commit(session, body.file_name, body.rows)


@router.get("/import/runs")
def import_runs(session: DB):
    """Recent imports with their counts."""
    return importer.list_runs(session)


@router.get("/export/{kind}")
def export_csv(session: DB, kind: str):
    """Download vocabulary, students, cards or history as CSV."""
    return export.export(session, kind)


# ------------------------------------------------------------------ settings / backup / system


@router.get("/settings")
def read_settings(session: DB):
    """Current settings."""
    return get_settings(session).model_dump(by_alias=True)


@router.put("/settings")
def write_settings(session: DB, body: SettingsModel):
    """Validate and save settings."""
    return save_settings(session, body).model_dump(by_alias=True)


@router.get("/backups")
def list_backups(request: Request):
    """All backup files, newest first."""
    return backup.list_backups(request.app.state.cfg)


@router.post("/backups")
def create_backup(session: DB, request: Request):
    """Make a backup now and return its download link."""
    info = backup.create_backup(request.app.state.cfg, "manual", get_settings(session).auto_backup_keep)
    return {"info": info, "fileName": info["fileName"], "url": f"/api/backups/{info['id']}/download"}


@router.get("/backups/{backup_id}/download")
def download_backup(request: Request, backup_id: str):
    """Download one backup file."""
    path = backup.backup_path(request.app.state.cfg, backup_id)
    return FileResponse(path, filename=path.name, media_type="application/vnd.sqlite3")


@router.post("/restore")
def restore(request: Request, file: Annotated[UploadFile, File()]):
    """Replace all data with an uploaded backup. The current data is saved as a pre-restore backup first."""
    cfg = request.app.state.cfg
    database = request.app.state.db
    with tempfile.NamedTemporaryFile(dir=cfg.data_dir, suffix=".upload", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp, length=1 << 20)
        tmp_path = Path(tmp.name)
    try:
        backup.validate_backup_file(tmp_path)
        safety = backup.create_backup(cfg, "pre-restore")
        database.engine.dispose()
        try:
            backup.restore_file(cfg, tmp_path)
        finally:
            database.reconnect()
        upgrade(cfg)
        reset_caches()
    finally:
        tmp_path.unlink(missing_ok=True)
    return {"ok": True, "safetyBackup": safety["fileName"]}


@router.post("/demo/sample")
def load_sample(session: DB):
    """Fill an empty database with sample data."""
    return sample.load_sample(session)


@router.get("/system")
def system(session: DB, request: Request):
    """App version, data location and record counts for the Settings page."""
    cfg = request.app.state.cfg
    return {
        "version": request.app.version,
        "fsrsVersion": FSRS_VERSION,
        "dataDir": str(cfg.data_dir),
        "dbPath": str(cfg.db_path),
        "schemaRevision": current_revision(cfg),
        "items": session.execute(select(func.count()).select_from(models.VocabItem)).scalar_one(),
        "students": session.execute(select(func.count()).select_from(models.Student)).scalar_one(),
    }

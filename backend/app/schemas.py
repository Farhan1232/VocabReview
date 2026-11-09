"""API shapes. JSON uses camelCase to match the frontend's TypeScript types (src/api/types.ts)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

Cefr = Literal["A1", "A2", "B1", "B2", "C1", "C2"]


class Model(BaseModel):
    """Base for every API shape: camelCase in JSON, snake_case in Python."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class VocabDraft(Model):
    """The editable fields of a word, as sent by the add and edit forms."""

    english: str = Field(max_length=200)
    polish: list[str] = []
    definition: str | None = None
    part_of_speech: str | None = Field(default=None, max_length=40)
    cefr: Cefr | None = None
    example: str | None = None
    topics: list[str] = []
    notes: str | None = None

    @field_validator("polish", "topics")
    @classmethod
    def _limit_lists(cls, v: list[str]) -> list[str]:
        """Reject absurdly long lists before they reach the database."""
        if len(v) > 30:
            raise ValueError("too many values")
        return v


class BulkPatch(Model):
    """Changes for many items. The set_* flags tell "clear this field" apart from "leave it alone"."""

    cefr: Cefr | None = None
    part_of_speech: str | None = None
    add_topics: list[str] = []
    remove_topics: list[str] = []
    # Pydantic can't tell "absent" from null, so the client says which nullable fields to write.
    set_cefr: bool = False
    set_part_of_speech: bool = False


class BulkRequest(Model):
    """Which items to change, and how."""

    ids: list[str]
    patch: BulkPatch


class IdsRequest(Model):
    """A list of item ids to act on."""

    ids: list[str]


class DuplicateCheckRow(Model):
    """A word about to be added, checked against the bank and the rows before it."""

    english: str = Field(max_length=200)
    part_of_speech: str | None = Field(default=None, max_length=40)


class MergeGroup(Model):
    """One group of duplicates: the word to keep and the copies merged into it."""

    keep_id: str
    remove_ids: list[str]


class MergeRequest(Model):
    """The duplicate groups the teacher chose to merge."""

    groups: list[MergeGroup]


class SetCreate(Model):
    """A new set, optionally with its first items."""

    name: str = Field(max_length=120)
    description: str | None = None
    item_ids: list[str] = []


class SetPatch(Model):
    """Set changes. set_description tells "clear it" apart from "leave it alone"."""

    name: str | None = Field(default=None, max_length=120)
    description: str | None = None
    set_description: bool = False


class SetItemsRequest(Model):
    """Items to add to or remove from a set."""

    item_ids: list[str]


class StudentCreate(Model):
    """A new student."""

    name: str = Field(max_length=120)
    notes: str | None = None


class StudentPatch(Model):
    """Student changes. set_notes tells "clear it" apart from "leave it alone"."""

    name: str | None = Field(default=None, max_length=120)
    notes: str | None = None
    active: bool | None = None
    set_notes: bool = False


class AssignRequest(Model):
    """Items to assign to one student."""

    student_id: str
    item_ids: list[str]


class UnassignRequest(Model):
    """Student cards to archive."""

    card_ids: list[str]


QueueSource = Literal["due", "overdue", "new", "learning", "difficult", "all", "set", "selection"]


class QueueRequest(Model):
    """Which cards to review and in what order."""

    student_id: str
    source: QueueSource
    set_id: str | None = None
    item_ids: list[str] | None = None
    cefr: list[Cefr] | None = None
    topics: list[str] | None = None
    limit: int | None = Field(default=None, ge=1, le=5000)
    shuffle: bool = False


class RateRequest(Model):
    """One rating. request_id is what makes a double press save only once."""

    rating: Literal[1, 2, 3, 4]
    request_id: str = Field(min_length=8, max_length=80)


class ResetRequest(Model):
    """A teacher's manual change: back to new, or due now."""

    mode: Literal["new", "due_now"]
    note: str | None = None


ImportField = Literal["english", "polish", "definition", "partOfSpeech", "cefr", "example", "topics", "notes", "ignore"]


class ImportPreviewRequest(Model):
    """Raw CSV rows and which column holds which field."""

    rows: list[list[str]] = Field(max_length=50_000)
    mapping: list[ImportField]


class MatchOut(Model):
    """An existing item that a CSV row may duplicate."""

    id: str
    english: str
    definition: str | None
    polish: list[str]


class ImportDraft(VocabDraft):
    """Rows coming back from the preview may be invalid (they are counted as rejected, not refused)."""

    english: str = Field(default="", max_length=20_000)
    part_of_speech: str | None = Field(default=None, max_length=20_000)


class ImportPreviewRow(Model):
    """One CSV row with its status and the action the teacher chose."""

    index: int
    draft: ImportDraft
    status: Literal["new", "exact_duplicate", "possible_duplicate", "error"]
    messages: list[str]
    matches: list[MatchOut]
    action: Literal["add", "skip", "update"]
    update_target_id: str | None


class ImportCommitRequest(Model):
    """The reviewed rows to save."""

    file_name: str = Field(max_length=255)
    rows: list[ImportPreviewRow] = Field(max_length=50_000)


class Shortcuts(Model):
    """Keyboard shortcuts for the review screen."""

    again: str = "1"
    hard: str = "2"
    good: str = "3"
    easy: str = "4"
    next: str = "ArrowRight"
    previous: str = "ArrowLeft"
    reveal: str = " "
    reveal_polish: str = "p"
    reveal_definition: str = "d"
    reveal_example: str = "e"


class SettingsModel(Model):
    """All app settings with their allowed ranges."""

    shortcuts: Shortcuts = Shortcuts()
    # FSRS's own setting for how often words return. 0.9 is the library default.
    desired_retention: float = Field(default=0.9, ge=0.7, le=0.97)
    mastered_stability_days: float = Field(default=21, ge=1, le=3650)
    difficult_lapses: int = Field(default=2, ge=1, le=50)
    difficult_difficulty: float = Field(default=7.5, ge=1, le=10)
    due_soon_days: int = Field(default=3, ge=1, le=30)
    auto_backup_keep: int = Field(default=30, ge=1, le=500)

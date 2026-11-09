"""Relational schema (architecture doc, "Data model"). Vocabulary, students and learning data are
separate tables; cards and logs refer to items by stable id, never by spelling."""

from __future__ import annotations

from sqlalchemy import Boolean, CheckConstraint, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base

ISO = String(32)


class VocabItem(Base):
    """One sense of a word in the master bank. Same spelling with another meaning is another row."""

    __tablename__ = "vocab_items"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    english: Mapped[str] = mapped_column(String(200))
    english_norm: Mapped[str] = mapped_column(String(200), index=True)
    polish: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of translations
    definition: Mapped[str | None] = mapped_column(Text)
    part_of_speech: Mapped[str | None] = mapped_column(String(40))
    cefr: Mapped[str | None] = mapped_column(String(2))
    example: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(ISO)
    updated_at: Mapped[str] = mapped_column(ISO)
    __table_args__ = (CheckConstraint("cefr IS NULL OR cefr IN ('A1','A2','B1','B2','C1','C2')", name="ck_cefr"),)


class Topic(Base):
    """A topic name, shared between items."""

    __tablename__ = "topics"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)


class ItemTopic(Base):
    """Links an item to a topic; position keeps the teacher's order."""

    __tablename__ = "item_topics"
    item_id: Mapped[str] = mapped_column(ForeignKey("vocab_items.id", ondelete="CASCADE"), primary_key=True)
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, default=0)


class VocabSet(Base):
    """A named, reusable list of items."""

    __tablename__ = "vocab_sets"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(ISO)
    updated_at: Mapped[str] = mapped_column(ISO)


Index("ux_set_name_nocase", func.lower(VocabSet.name), unique=True)


class SetItem(Base):
    """Links a set to an item; position keeps the set's order."""

    __tablename__ = "set_items"
    set_id: Mapped[str] = mapped_column(ForeignKey("vocab_sets.id", ondelete="CASCADE"), primary_key=True)
    item_id: Mapped[str] = mapped_column(ForeignKey("vocab_items.id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, default=0)


class Student(Base):
    """A student the teacher works with."""

    __tablename__ = "students"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[str] = mapped_column(ISO)


class StudentCard(Base):
    """One student's learning record for one item. Unique per (student, item)."""

    __tablename__ = "student_cards"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[str] = mapped_column(ForeignKey("vocab_items.id", ondelete="CASCADE"), index=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    assigned_at: Mapped[str] = mapped_column(ISO)
    # FSRS state (py-fsrs Card fields) + counters py-fsrs does not keep itself.
    fsrs_state: Mapped[int] = mapped_column(Integer, default=1)
    fsrs_step: Mapped[int | None] = mapped_column(Integer, default=0)
    stability: Mapped[float | None] = mapped_column(Float)
    difficulty: Mapped[float | None] = mapped_column(Float)
    due: Mapped[str] = mapped_column(ISO, index=True)
    last_review: Mapped[str | None] = mapped_column(ISO)
    reps: Mapped[int] = mapped_column(Integer, default=0)
    lapses: Mapped[int] = mapped_column(Integer, default=0)
    fsrs_card_id: Mapped[int] = mapped_column(Integer)
    __table_args__ = (UniqueConstraint("student_id", "item_id", name="ux_card_student_item"),)


class ReviewLog(Base):
    """Permanent history: every review, plus teacher resets and overrides. The unique request_id stops double saves."""

    __tablename__ = "review_logs"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    card_id: Mapped[str] = mapped_column(ForeignKey("student_cards.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[str] = mapped_column(ForeignKey("vocab_items.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # review | override | reset
    rating: Mapped[int | None] = mapped_column(Integer)
    reviewed_at: Mapped[str] = mapped_column(ISO, index=True)
    previous_due: Mapped[str | None] = mapped_column(ISO)
    next_due: Mapped[str] = mapped_column(ISO)
    previous_state: Mapped[int] = mapped_column(Integer)
    next_state: Mapped[int] = mapped_column(Integer)
    request_id: Mapped[str] = mapped_column(String(80), unique=True)
    note: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (
        CheckConstraint("kind IN ('review','override','reset')", name="ck_log_kind"),
        CheckConstraint("rating IS NULL OR rating BETWEEN 1 AND 4", name="ck_log_rating"),
    )


class Setting(Base):
    """Key/value store; the app settings are one JSON document under the key "app"."""

    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[str] = mapped_column(Text)  # JSON


class ImportRun(Base):
    """Result counts of one finished CSV import."""

    __tablename__ = "import_runs"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    file_name: Mapped[str] = mapped_column(String(255))
    at: Mapped[str] = mapped_column(ISO)
    added: Mapped[int] = mapped_column(Integer)
    updated: Mapped[int] = mapped_column(Integer)
    skipped: Mapped[int] = mapped_column(Integer)
    rejected: Mapped[int] = mapped_column(Integer)

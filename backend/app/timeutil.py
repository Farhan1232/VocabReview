"""Timezone policy: all times are stored as UTC ISO-8601 strings ("...Z", millisecond precision),
which sort correctly as text. "Today" means the local calendar day of the computer running the app,
which is the teacher's own PC."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta


def now() -> datetime:
    """Current time in UTC."""
    return datetime.now(UTC)


def iso(dt: datetime) -> str:
    """Format a time the way it is stored: UTC, millisecond precision, ending in Z."""
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def parse(value: str) -> datetime:
    """Read a stored time string back into a datetime."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def now_iso() -> str:
    """Current time in the stored format."""
    return iso(now())


def local_day_bounds(at: datetime | None = None) -> tuple[datetime, datetime]:
    """Start of today and start of tomorrow on this computer's clock."""
    local = (at or now()).astimezone()
    start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def due_bucket(due_iso: str, at: datetime | None = None, due_soon_days: int = 3) -> str:
    """Sort a due time into overdue, today, soon or later."""
    due = parse(due_iso)
    start, end = local_day_bounds(at)
    if due < start:
        return "overdue"
    if due < end:
        return "today"
    return "soon" if due < end + timedelta(days=due_soon_days) else "later"


def matches_due(due_filter: str, due_iso: str, at: datetime | None = None, due_soon_days: int = 3) -> bool:
    """True if a due time passes the given due filter."""
    if due_filter == "any":
        return True
    bucket = due_bucket(due_iso, at, due_soon_days)
    return {
        "overdue": bucket == "overdue",
        "due_today": bucket in ("overdue", "today"),
        "due_soon": bucket == "soon",
        "not_due": bucket in ("soon", "later"),
    }[due_filter]

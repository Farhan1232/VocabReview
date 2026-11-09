"""Search text rules — identical to the frontend's src/lib/search.ts so both behave the same.

- Case-, accent- and Polish-diacritic-insensitive ("skladnik" finds "składnik").
- A query wrapped in quotes ("bank") is an exact English match.
- Ranking: exact English > English prefix > English contains > Polish > other fields.
"""

from __future__ import annotations

import re
import unicodedata

_WS = re.compile(r"\s+")


def normalize(text: str | None) -> str:
    """Lower-case text with accents removed, so that "Skladnik" matches "składnik"."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(char for char in text if not unicodedata.combining(char))
    return _WS.sub(" ", text.replace("ł", "l")).strip()


def parse_query(query: str) -> tuple[str, bool]:
    """Returns the normalised search text and whether it was quoted (exact match)."""
    stripped = query.strip()
    if len(stripped) >= 2 and stripped.startswith('"') and stripped.endswith('"'):
        return normalize(stripped[1:-1]), True
    return normalize(stripped), False

# Lexis — Technical documentation

## Architecture
One Windows PC. The browser talks only to the local FastAPI server (`127.0.0.1:8000`); the server is the only
thing that touches the SQLite database file. The built React app is served by the same server.

- Backend: Python 3.12 · FastAPI · SQLAlchemy 2 · Alembic · **fsrs (py-fsrs) 6.3.2** · SQLite (WAL mode)
- Frontend: React 19 · TypeScript (strict) · Vite · Tailwind CSS 4 · TanStack Query / Table 8 / Virtual
- Frontend ↔ backend contract: `frontend/src/api/client.ts` (`Api`), implemented by `src/api/http/httpApi.ts`.
  Interactive API docs while running: http://127.0.0.1:8000/api/docs

## Security trade-offs
- The server binds to **127.0.0.1 only**; other computers on the network cannot connect.
- Middleware refuses non-loopback clients, Host headers other than localhost (DNS-rebinding protection) and
  state-changing requests whose `Origin` is another website (CSRF protection).
- No login: single local user, by design (spec §15). Data sits in the teacher's Windows profile
  (`%LOCALAPPDATA%\Lexis`), which other Windows users cannot read by default.
- All SQL is parameterised (SQLAlchemy). Inputs are validated with Pydantic; CSV rows are validated server-side;
  restore files are checked (SQLite header, `PRAGMA integrity_check`, required tables) before use.
- No secrets, no external services, no AI calls. Works offline.

## Data model (`backend/app/models.py`, migration `0001`)
| Table | Purpose |
|---|---|
| `vocab_items` | One row per **sense**. Stable id (uuid). english, english_norm, polish (JSON list), definition, part_of_speech, cefr (A1–C2 check), example, notes, archived |
| `topics`, `item_topics` | Topics/categories (many-to-many, ordered) |
| `vocab_sets`, `set_items` | Named sets pointing at item ids (unique name, case-insensitive) |
| `students` | name, notes, active |
| `student_cards` | One learning record per (student, item) — **UNIQUE(student_id, item_id)**. FSRS state + reps/lapses, archived |
| `review_logs` | Every review/override/reset: rating, times, previous/next due and state, **UNIQUE request_id**, note |
| `settings` | JSON settings (shortcuts, FSRS desired retention, label thresholds, backup retention) |
| `import_runs` | Record of each CSV import |

Rules enforced by the schema/services (and covered by tests):
- The same item can never be assigned twice to one student (unique key; bulk assign reports created/already/restored).
- Distinct senses with the same spelling are separate items; nothing is ever merged by spelling alone.
- **Duplicate rule** (`services/duplicates.py`, mirrored in `frontend/src/lib/duplicates.ts`): two words are the same
  word when normalised English matches and part of speech matches, or one of them has none. Add rows, CSV import and
  Add word flag such words but still add them (the teacher can leave a row out). Duplicates already in
  the bank are listed in groups (`GET /api/vocab/duplicates`) and merged into the kept word only on the teacher's
  choice (`POST /api/vocab/duplicates/merge`): sets and topics are joined, blank fields filled, student cards and
  their review logs move to the kept word unless that student already has it (then the copy is archived, not
  deleted). Groups marked "different meanings" are stored as id lists under the `duplicates_dismissed` settings key
  and come back only if a new copy is added.
- Editing an item never touches `student_cards` or `review_logs`.
- **Unassign archives** the card (history kept); assigning again restores it with its FSRS state.
- Items with review history cannot be hard-deleted — only archived. Items without history can be deleted.
- Deleting a set only removes the set; items and assignments are untouched.

## FSRS
- Library: **py-fsrs 6.3.2**, `Scheduler(desired_retention=…)` with every other option at the library default (learning
  steps 1 m/10 m, relearning step 10 m, max interval 36 500 d, fuzzing on). The algorithm and its parameters are never
  modified. SM-2 is not used.
- Review frequency (client request, 5 Nov): `desired_retention` comes from Settings, default 0.90, allowed 0.70–0.97,
  with a reset to the default. It is one value for all students and is used for the next rating of each card; saved due
  dates are not recalculated. Settings without the field, such as older backups, use 0.90. The “× shorter/longer” text in
  Settings is an estimate from the FSRS interval formula with the default decay.
- Rating mapping: Again = 1, Hard = 2, Good = 3, Easy = 4 (`fsrs.Rating`).
- Each (student, item) card has its own state; a review only updates that card.
- Stored per card: py-fsrs state, step, stability, difficulty, due, last_review (+ app counters reps, lapses).
  A lapse = rating Again on a card in the Review state.
- Next review date = `due` returned by `Scheduler.review_card(card, rating, now)` and saved in the same transaction
  as the review log.
- Double submissions: each rating carries a client-generated `requestId` (one per card per session). The UNIQUE
  constraint on `review_logs.request_id` guarantees one review even for concurrent duplicates; the duplicate gets the
  original result back with `duplicate: true`. The UI also locks the buttons while a rating is in flight.
- Manual changes: **Reset to New** (fresh FSRS card, kind=`reset`) and **Make due now** (kind=`override`). They are
  logged with rating = null and never counted as reviews. History is never deleted.
- Teacher-facing states (display only): **New** = never reviewed · **Learning** = FSRS Learning/Relearning ·
  **Review** = FSRS Review below the threshold · **Mastered** = FSRS Review with stability ≥ 21 days (Settings).
  **Difficult** = lapses ≥ 2 or FSRS difficulty ≥ 7.5 (Settings).
- Updates never reset FSRS state: migrations only add/alter schema.

## Time zone
All times are stored in UTC (`YYYY-MM-DDTHH:MM:SS.mmmZ`) and shown in the PC's local time.
**Due today** = due before local midnight tonight (overdue included) · **Overdue** = due before local midnight this
morning · **Due soon** = within the next N days after today (Settings, default 3) · **Not due** = after today.

## Search and filters
- Text search covers English, Polish, definition, example, topics and notes; it is case-, accent- and Polish-diacritic
  insensitive (`ł`→`l`, `ą`→`a`, …). `"quotes"` = exact English match.
- Ranking: exact English > English prefix > English contains > exact Polish > Polish contains > other fields.
- Filters combine with AND; multiple values in one filter combine with OR. Student filters (assigned / not assigned,
  state, due, difficult) apply when a student is selected.
- Searching is read-only. The server keeps an in-memory, pre-normalised read model of the bank; writes refresh only
  the changed rows. Measured on 20 000 words: search ≈ 110 ms, suggestions ≈ 25 ms, edit ≈ 35 ms, rating ≈ 10 ms.
- Filters are kept in the page URL, so refresh/back keep the view.

## CSV import
The browser parses the file (comma, semicolon, tab or `|`; UTF-8, falling back to Windows-1250), the server validates.
1. Headers are auto-mapped (`ENGLISH | DEFINITION | LEVEL | TOPIC | EXAMPLE`, plus Polish, part of speech, notes) and
   can be changed.
2. Each row is classified: **new**, **exact duplicate** (same English and same sense — definition, or Polish when
   there is no definition), **possible duplicate** (same word by the duplicate rule, in the bank or earlier in the
   file, with a differently worded sense → added by default and flagged; the teacher can skip it) or **error**
   (no English, English > 200 chars). Unknown CEFR values are left blank with a warning; blanks stay blank.
3. Per row: add / skip / fill blanks of an existing item (never overwrites existing content).
4. Commit is one transaction; the result reports added / updated / skipped / rejected. Re-importing the same file
   adds nothing.

## Exports
Settings → Export: vocabulary, students, assignments & FSRS state, review history. UTF-8 CSV with BOM (Excel-safe).

## Backup, restore, migrations
- Backups use SQLite's online backup API (consistent while running): `backups\lexis-<UTC>-<reason>.db`,
  reasons `startup`, `manual`, `pre-restore`, `pre-update`. Automatic ones (`startup`, `pre-update`) keep the newest N.
- Restore validates the file, saves a `pre-restore` backup, swaps the database, reconnects and runs migrations (so an
  older backup is upgraded).
- Alembic runs on every start; if the database is behind the code a `pre-update` backup is taken first.
- New schema change: edit `models.py`, then `cd backend && .venv/bin/alembic revision --autogenerate -m "..."`.

## Tests
- Backend (`backend/tests`, 47): add/edit/blank fields, senses, search fields & diacritics, combined/missing filters,
  searches never create records, bulk edit scope, archive vs delete, export, duplicate-safe assign/restore,
  NOT ASSIGNED, every rating saves a log and schedule, review frequency changes future schedules only, concurrent double press → one review, per-student isolation,
  due-status change, reset/override logging + history survives edits, queue sources, sets, CSV import + re-import, duplicate check/groups/merge (progress, history and sets move; different meanings kept),
  fill-blanks update, backup/restore round trip, restore on a new install, bad restore file, persistence across restart, settings validation,
  local-only security.
- Frontend (`frontend/src/**/*.test.ts`, 47): letter prefill, batch format (Only Polish/English/Both, fallback to the other field), copy formats, review frequency,
  search semantics, CSV classification, duplicate rule and groups, API rules.

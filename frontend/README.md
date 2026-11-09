# Lexis — Vocabulary Review App (frontend)

Local-first English–Polish vocabulary manager with FSRS review, for one teacher.
The backend lives in `../backend`; this README covers the UI.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:5173 (needs the backend running; /api is proxied)
npm run dev:mock   # same UI on in-browser demo data, no backend
npm test           # unit tests (prefill, copy formats, search, CSV import, API rules)
npm run build      # production build → dist/ (served by the FastAPI backend)
npm run lint       # Oxlint (typescript-eslint does not support TypeScript 7 yet)
npm run format     # Prettier
```

## Stack

React 19 · TypeScript (strict) · Vite · Tailwind CSS 4 · TanStack Query / Table 8 / Virtual ·
React Router 7 · ts-fsrs 6 (stock FSRS, preview only) · PapaParse · lucide icons.
System fonts only (Segoe UI Variable / Cascadia Mono), so it works fully offline on Windows.

## Structure

```
src/
  api/types.ts          Domain types — mirror the backend tables
  api/client.ts         The Api interface every screen uses (+ which implementation)
  api/mock/             Demo implementation + seed data, used only by `npm run dev:mock`
  lib/                  Pure logic with unit tests
    prefill.ts          Letter prefill by difficulty (Easy → Very hard)
    batchFormat.ts      Revision batch text: Only Polish / Only English / Both
    copyFormats.ts      §12 clipboard formats (lines or tab-separated)
    search.ts           Search + combinable filter semantics
    csvImport.ts        Parse, auto-map columns, validate, classify duplicates
    fsrs.ts             Thin wrapper over the FSRS library (never modified)
    dates.ts            Timezone policy (UTC stored, local "today")
  hooks/                React Query hooks, URL-synced filters, keyboard shortcuts
  components/           Layout, command palette, UI primitives
  pages/                vocab · review · batch · students · sets · import · settings
```

## Requirements coverage

| Requirement                                                        | Where                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| §4 Add / edit / archive, distinct senses                           | Vocabulary → item drawer (“Other senses of …”), ⑂2 marker in table |
| §4.3 Multi-row entry / paste from Excel                            | Vocabulary → **Add rows**                                          |
| §5.1 CSV import: preview, mapping, validation, duplicates, counts  | **Import CSV** (4-step wizard)                                     |
| §5.2 CSV export, backup & restore                                  | Vocabulary → Export · **Settings**                                 |
| §6 Search all fields, suggestions while typing, combinable filters | Vocabulary search bar + filter bar (state kept in URL)             |
| §6.2 NOT ASSIGNED for a student                                    | Vocabulary → choose student → **Not assigned**                     |
| §6.3 Sort, multi-select, select all filtered, bulk actions         | Table headers, checkboxes, Shift-click, Ctrl+A, bulk bar           |
| §7 Reusable sets                                                   | **Sets**                                                           |
| §8 Students, duplicate-safe assignment with counts                 | **Students**, Assign dialogs                                       |
| §9 Manual review, reveal/hide, ratings, prev/next                  | **Review**                                                         |
| §9.3 Double-press protection                                       | One request id per card + in-flight lock (tested)                  |
| §9.4 Configurable shortcuts, off while typing                      | **Settings** → shortcuts; `useHotkeys`                             |
| §10 FSRS per student, history, reset/override logged separately    | Student → word menu → History / Make due now / Reset               |
| §11 Student overview                                               | Student page stats + recent activity                               |
| §12 Copy formats                                                   | Bulk bar → **Copy**                                                |
| 31 Oct: revision batch with prefilled letters → Zoom chat          | **Revision batch**                                                 |
| Dark mode, dense table, keyboard focus                             | Everywhere                                                         |

### Revision batch (client request, 31 Oct)

1. Open a batch for a student (due / all / new / difficult / set / selection).
2. **Scramble** with one click (Ctrl+Shift+S).
3. Difficulty: **Easy** ≈70 % of letters shown · **Medium** ≈45 % · **Hard** ≈25 % · **Very hard** none.
   Spaces, hyphens and apostrophes always stay visible; Easy/Medium always show each word’s first letter.
4. Show **Only Polish**, **Only English** or **Both** (Polish side can use the English definition instead).
5. **Copy to clipboard** (Ctrl+Shift+C) → plain text, one item per line, pastes cleanly into Zoom chat.
   A separate **answer key** can be copied for the teacher.

## Backend

The UI talks to the FastAPI backend in `../backend` through `src/api/http/httpApi.ts` (default).
`npm run dev:mock` (or `VITE_API_MODE=mock`) runs it on in-browser demo data instead.
See `../docs/TECHNICAL.md` for the API, data model and FSRS details.

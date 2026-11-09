# Lexis — English–Polish vocabulary review with FSRS

A small, local-first app for one teacher: manage an English–Polish vocabulary bank, assign words to students,
review them together with stock FSRS scheduling, and copy revision batches into Zoom chat.

```
frontend/   React + TypeScript UI (Vite)          → built into frontend/dist
backend/    FastAPI + SQLite + py-fsrs            → serves /api and the built UI on 127.0.0.1:8000
packaging/  Windows build (PyInstaller + Inno Setup installer)
docs/       USER_GUIDE.md (teacher) · TECHNICAL.md (developer)
```

## Quick start (developer)

```bash
cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
cd ../frontend && npm ci
cd .. && ./start-dev.sh            # builds the UI and opens http://127.0.0.1:8000
```

UI-only work with hot reload: run the backend (`cd backend && .venv/bin/python -m app --no-browser`) and
`cd frontend && npm run dev` (http://127.0.0.1:5173, /api is proxied). `npm run dev:mock` runs the UI on demo data
without any backend.

## Tests

```bash
cd backend && .venv/bin/python -m pytest -q     # 47 API/acceptance tests (real SQLite + py-fsrs)
cd frontend && npm test                         # 47 unit tests (prefill, copy formats, search, CSV, duplicates, rules)
```

## Code style

```bash
cd frontend && npm run lint && npm run format:check   # Oxlint and Prettier
cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .
```

## Windows build

On a Windows PC with Python 3.12, Node 20+ and (optionally) Inno Setup 6:
`powershell -ExecutionPolicy Bypass -File packaging\build_windows.ps1`
→ `packaging\dist\Lexis\Lexis.exe` (portable) and `packaging\dist\LexisSetup-1.0.4.exe` (installer).

From Linux, with Wine: `packaging/build_on_linux_wine.sh [work-dir]` produces the same two outputs in `packaging/dist/`.
It uses genuine Windows Python packages, runs the backend tests on Windows Python, and stops if any Wine DLL got bundled.

The app icon is `packaging/lexis.ico`, exported from `packaging/lexis-icon.svg` (sizes above 32 px) and `packaging/lexis-icon-small.svg` (32 px and below). The browser tab uses `frontend/public/favicon.svg` and `favicon.ico`.

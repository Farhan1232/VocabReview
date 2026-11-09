#!/usr/bin/env bash
# Developer start: builds the frontend and runs the real app at http://127.0.0.1:8000
set -e
cd "$(dirname "$0")"
(cd frontend && npm run build)
cd backend && exec .venv/bin/python -m app "$@"

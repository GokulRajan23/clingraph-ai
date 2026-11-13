#!/usr/bin/env bash
# macOS/Linux counterpart of start.ps1.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  if command -v python3.12 >/dev/null; then python3.12 -m venv .venv
  else echo 'Python 3.12 not found. Install it (e.g. brew install python@3.12) and retry.' >&2; exit 1; fi
fi
.venv/bin/python -m pip install -r requirements.txt
# The interface is a React app in frontend/. Install and build it only when missing or older than its sources.
major=$(node --version 2>/dev/null | sed 's/^v//; s/\..*//' || true)
if [ -z "$major" ] || [ "$major" -lt 20 ]; then
  echo 'Node.js 20 or newer is required to build the interface. Install it (e.g. brew install node) and retry.' >&2; exit 1
fi
if [ ! -f frontend/node_modules/.package-lock.json ] || [ frontend/package-lock.json -nt frontend/node_modules/.package-lock.json ]; then
  (cd frontend && npm ci)
fi
if [ ! -f frontend/dist/index.html ] || [ -n "$(find frontend/src frontend/index.html frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/tsconfig.json -newer frontend/dist/index.html)" ]; then
  (cd frontend && npm run build)
fi
exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

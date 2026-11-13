#!/usr/bin/env bash
# macOS/Linux counterpart of start.ps1.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  if command -v python3.12 >/dev/null; then python3.12 -m venv .venv
  else echo 'Python 3.12 not found. Install it (e.g. brew install python@3.12) and retry.' >&2; exit 1; fi
fi
.venv/bin/python -m pip install -r requirements.txt
exec .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

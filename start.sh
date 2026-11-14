#!/usr/bin/env bash
# Starts the voice backend (port 8000) and the interface dev server (port 5173). macOS/Linux.
set -euo pipefail
cd "$(dirname "$0")"

version=$(node --version 2>/dev/null | sed 's/^v//' || true)
major=${version%%.*}; rest=${version#*.}; minor=${rest%%.*}
if [ -z "$version" ] || [ "$major" -lt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -lt 12 ]; }; then
  echo "Node.js 22.12 or newer is required (found ${version:-none}). Install it (e.g. brew install node) and retry." >&2; exit 1
fi
python=
for candidate in python3.14 python3.13 python3.12 python3.11 python3; do
  path=$(command -v "$candidate" || true)
  if [ -n "$path" ] && "$path" -c 'import sys; sys.exit(sys.version_info < (3, 11))'; then python=$path; break; fi
done
if [ ! -x .venv/bin/python ]; then
  [ -n "$python" ] || { echo 'Python 3.11 or newer is required (e.g. brew install python@3.12).' >&2; exit 1; }
  "$python" -m venv .venv
fi
.venv/bin/python -m pip install -q -r requirements.txt
[ -f .env ] || echo 'No .env file: voice input/output stays hidden. Copy .env.example to .env and add ELEVENLABS_API_KEY to enable it.'

(cd frontend && { [ -f node_modules/.package-lock.json ] && [ ! package-lock.json -nt node_modules/.package-lock.json ] || npm ci; })

.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 &
backend=$!
trap 'kill "$backend" 2>/dev/null || true' EXIT INT TERM
cd frontend && npm run dev

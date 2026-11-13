#!/usr/bin/env bash
# Installs the interface's dependencies when needed and starts the dev server (macOS/Linux).
set -euo pipefail
cd "$(dirname "$0")/frontend"
version=$(node --version 2>/dev/null | sed 's/^v//' || true)
major=${version%%.*}; rest=${version#*.}; minor=${rest%%.*}
if [ -z "$version" ] || [ "$major" -lt 22 ] || { [ "$major" -eq 22 ] && [ "$minor" -lt 12 ]; }; then
  echo "Node.js 22.12 or newer is required (found ${version:-none}). Install it (e.g. brew install node) and retry." >&2; exit 1
fi
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci
fi
exec npm run dev

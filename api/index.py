"""Vercel entry point: the FastAPI backend as one Python function that serves every /api route."""

import sys
from pathlib import Path

# Make the repository root importable, so `backend` resolves inside the function bundle.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.main import app  # noqa: E402,F401

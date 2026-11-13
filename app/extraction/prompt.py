"""Frozen prompt and settings shared by every extractor, so candidates get identical input."""
from pathlib import Path

PROMPT_VERSION = "v2"
PROMPT = Path(__file__).with_name(f"prompt_{PROMPT_VERSION}.md").read_text(encoding="utf-8")
SETTINGS = {"temperature": 0, "seed": 42}


def messages(report):
    lines = "\n".join(f"[{s['id']}] {s['text']}" for s in report["sentences"])
    return [{"role": "system", "content": PROMPT}, {"role": "user", "content": lines}]

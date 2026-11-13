"""DeutschlandGPT extractor (OpenAI-compatible API): the project's extraction model, chosen in Phase 3.

Report text is sent to DeutschlandGPT, so use synthetic reports only until a data processing agreement
and legal review are in place. The key comes from DEUTSCHLANDGPT_API_KEY or the git-ignored .env file.
"""
import json
import os
import urllib.request
from pathlib import Path

MODEL = "claude-sonnet-5"
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


def _setting(name, default=None):
    if os.environ.get(name):
        return os.environ[name]
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            key, _, value = line.partition("=")
            if key.strip() == name:
                return value.strip()
    if default is None:
        raise RuntimeError(f"Set {name} in the environment or in .env.")
    return default

from app.extraction.models import Extraction
from app.extraction.prompt import SETTINGS, messages


class DeutschlandGPTExtractor:
    def __init__(self, model=MODEL):
        self.model = model
        self.base_url = _setting("DEUTSCHLANDGPT_BASE_URL", "https://api.deutschlandgpt.de/v2").rstrip("/")
        self.key = _setting("DEUTSCHLANDGPT_API_KEY")

    def extract(self, report):
        body = {"model": self.model, "messages": messages(report), **SETTINGS,
                "response_format": {"type": "json_schema",
                                    "json_schema": {"name": "extraction", "strict": True,
                                                    "schema": Extraction.model_json_schema()}}}
        request = urllib.request.Request(self.base_url + "/chat/completions", json.dumps(body).encode(),
                                         {"Content-Type": "application/json", "Authorization": f"Bearer {self.key}"})
        with urllib.request.urlopen(request, timeout=300) as response:
            content = json.loads(response.read())["choices"][0]["message"]["content"]
        return Extraction.model_validate_json(content).events

    def info(self):
        return {"backend": "deutschlandgpt", "digest": None, "loaded_bytes": None,
                "endpoint": urllib.request.urlparse(self.base_url).netloc}

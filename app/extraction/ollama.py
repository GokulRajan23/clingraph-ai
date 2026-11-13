"""Local Ollama extractor. Report text never leaves this machine."""
import json
import urllib.request

from app.extraction.models import Extraction
from app.extraction.prompt import SETTINGS, messages

HOST = "http://127.0.0.1:11434"


def _get(path):
    return json.loads(urllib.request.urlopen(HOST + path, timeout=30).read())


class OllamaExtractor:
    def __init__(self, model, think=None):
        if model.endswith("-cloud") or ":cloud" in model:
            raise ValueError("Cloud models would send report text off this machine.")
        self.model, self.think = model, think

    def extract(self, report):
        body = {"model": self.model, "stream": False, "format": Extraction.model_json_schema(),
                "options": SETTINGS, "messages": messages(report)}
        if self.think is not None:
            body["think"] = self.think
        request = urllib.request.Request(HOST + "/api/chat", json.dumps(body).encode(), {"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=600) as response:
            content = json.loads(response.read())["message"]["content"]
        return Extraction.model_validate_json(content).events

    def info(self):
        """Digest of the pulled model and its loaded size, for the results file."""
        digest = next((m["digest"] for m in _get("/api/tags")["models"] if m["name"] == self.model), None)
        size = next((m.get("size") for m in _get("/api/ps")["models"] if m["name"] == self.model), None)
        return {"backend": "ollama", "digest": digest, "loaded_bytes": size}

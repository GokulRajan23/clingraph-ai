"""Voice API tests. ElevenLabs is replaced by an httpx.MockTransport; no network or key needed."""

from __future__ import annotations

import json
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.config import Settings, load_settings
from backend.elevenlabs import BASE_URL, DEFAULT_TTS_MODEL, DEFAULT_VOICE_ID, ElevenLabs
from backend.main import create_app

KEY = "test-key"


class FakeElevenLabs:
    """Records requests and answers like ElevenLabs would."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.status = 200
        self.stt_body: object = {"language_code": "en", "text": " Which procedures are documented? "}
        self.voices: list[dict[str, str]] = [{"voice_id": "account-voice", "name": "Ava"}]
        self.missing_voices: set[str] = set()

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.status != 200:
            return httpx.Response(self.status, json={"detail": {"status": "quota_exceeded", "message": "Quota exceeded"}})
        if request.url.path.startswith("/v1/speech-to-text"):
            return httpx.Response(200, json=self.stt_body)
        if request.url.path == "/v2/voices":
            return httpx.Response(200, json={"voices": self.voices, "has_more": False})
        if request.url.path.startswith("/v1/text-to-speech/"):
            voice = request.url.path.rsplit("/", 1)[-1]
            if voice in self.missing_voices:
                message = f"A voice with voice_id '{voice}' was not found."
                return httpx.Response(404, json={"detail": {"status": "voice_not_found", "message": message}})
            return httpx.Response(200, content=b"ID3fake-mp3", headers={"content-type": "audio/mpeg"})
        return httpx.Response(404)


@pytest.fixture
def fake() -> FakeElevenLabs:
    return FakeElevenLabs()


def settings(key: str | None = KEY) -> Settings:
    return Settings(api_key=key, voice_id="voice-123", stt_model="stt-model", tts_model="tts-model", language="en")


@pytest.fixture
def client(fake: FakeElevenLabs) -> TestClient:
    eleven = ElevenLabs(api_key=KEY, stt_model="stt-model", tts_model="tts-model", voice_id="voice-123", transport=httpx.MockTransport(fake))
    return TestClient(create_app(settings(), eleven, warm_up=False))


def test_status_reports_voice_enabled(client: TestClient) -> None:
    assert client.get("/api/voice/status").json() == {"enabled": True}


def test_status_and_endpoints_without_key() -> None:
    app = TestClient(create_app(settings(key=None)))
    assert app.get("/api/voice/status").json() == {"enabled": False}
    assert app.post("/api/voice/speak", json={"text": "hi"}).status_code == 503
    assert app.post("/api/voice/transcribe", files={"audio": ("q.webm", b"x", "audio/webm")}).status_code == 503


def test_transcribe_sends_audio_with_key_and_model(client: TestClient, fake: FakeElevenLabs) -> None:
    response = client.post("/api/voice/transcribe", files={"audio": ("question.webm", b"\x1aE\xdf\xa3webm", "audio/webm;codecs=opus")})
    assert response.status_code == 200
    assert response.json() == {"text": "Which procedures are documented?"}

    [request] = fake.requests
    assert str(request.url).startswith(BASE_URL + "/v1/speech-to-text")
    assert request.method == "POST"
    assert request.headers["xi-api-key"] == KEY
    body = request.read()
    assert b'name="model_id"' in body and b"stt-model" in body
    assert b'name="language_code"' in body and b"\r\n\r\nen\r\n" in body
    assert b'name="file"; filename="question.webm"' in body and b"\x1aE\xdf\xa3webm" in body


def test_speak_returns_mp3_from_configured_voice(client: TestClient, fake: FakeElevenLabs) -> None:
    response = client.post("/api/voice/speak", json={"text": "Lung nodule stable at 19 millimetres."})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == b"ID3fake-mp3"

    [request] = fake.requests
    assert request.url.path == "/v1/text-to-speech/voice-123"
    assert request.headers["xi-api-key"] == KEY
    payload = json.loads(request.read())
    assert payload["text"] == "Lung nodule stable at 19 millimetres."
    assert payload["model_id"] == "tts-model"
    assert "previous_text" not in payload


def test_speak_passes_what_was_said_before(client: TestClient, fake: FakeElevenLabs) -> None:
    client.post("/api/voice/speak", json={"text": "Still on it.", "previous_text": "Pembrolizumab from Jan 2023."})
    assert json.loads(fake.requests[0].read())["previous_text"] == "Pembrolizumab from Jan 2023."


def test_one_connection_serves_every_request(fake: FakeElevenLabs) -> None:
    eleven = ElevenLabs(api_key=KEY, voice_id="voice-123", transport=httpx.MockTransport(fake))
    client = TestClient(create_app(settings(), eleven, warm_up=False))
    client.post("/api/voice/speak", json={"text": "one"})
    first = eleven._http
    client.post("/api/voice/transcribe", files={"audio": ("a.webm", b"x", "audio/webm")})
    assert first is not None and eleven._http is first


@pytest.mark.parametrize("text", ["", "   ", "x" * 2501])
def test_speak_rejects_empty_or_huge_text(client: TestClient, fake: FakeElevenLabs, text: str) -> None:
    assert client.post("/api/voice/speak", json={"text": text}).status_code == 422
    assert fake.requests == []


def test_transcribe_rejects_non_audio_and_empty(client: TestClient, fake: FakeElevenLabs) -> None:
    assert client.post("/api/voice/transcribe", files={"audio": ("a.pdf", b"%PDF", "application/pdf")}).status_code == 415
    assert client.post("/api/voice/transcribe", files={"audio": ("a.webm", b"", "audio/webm")}).status_code == 400
    assert fake.requests == []


def test_transcribe_rejects_oversized_audio(client: TestClient, fake: FakeElevenLabs) -> None:
    big = b"0" * (10 * 1024 * 1024 + 1)
    assert client.post("/api/voice/transcribe", files={"audio": ("a.webm", big, "audio/webm")}).status_code == 413
    assert fake.requests == []


@pytest.mark.parametrize(("upstream", "expected"), [(401, 502), (429, 429), (500, 502)])
def test_upstream_errors_are_mapped_without_leaking_the_key(client: TestClient, fake: FakeElevenLabs, upstream: int, expected: int) -> None:
    fake.status = upstream
    response = client.post("/api/voice/speak", json={"text": "hello"})
    assert response.status_code == expected
    assert KEY not in response.text


def without_voice(fake: FakeElevenLabs, model: str = "eleven_multilingual_v2") -> TestClient:
    eleven = ElevenLabs(api_key=KEY, tts_model=model, transport=httpx.MockTransport(fake))
    return TestClient(create_app(settings(), eleven, warm_up=False))


def tts_paths(fake: FakeElevenLabs) -> list[str]:
    return [r.url.path for r in fake.requests]


def test_default_voice_and_model_are_the_benchmarked_choice(fake: FakeElevenLabs) -> None:
    client = without_voice(fake)
    assert client.post("/api/voice/speak", json={"text": "one"}).status_code == 200
    assert tts_paths(fake) == [f"/v1/text-to-speech/{DEFAULT_VOICE_ID}"]
    payload = json.loads(fake.requests[0].read())
    assert payload["model_id"] == DEFAULT_TTS_MODEL == "eleven_multilingual_v2"
    assert "language_code" not in payload  # not supported by multilingual_v2


def test_language_code_is_sent_to_models_that_support_it(fake: FakeElevenLabs) -> None:
    without_voice(fake, model="eleven_flash_v2_5").post("/api/voice/speak", json={"text": "one"})
    assert json.loads(fake.requests[0].read())["language_code"] == "en"


def test_withdrawn_default_voice_falls_back_to_the_account_voice_once(fake: FakeElevenLabs) -> None:
    fake.missing_voices.add(DEFAULT_VOICE_ID)
    client = without_voice(fake)
    assert client.post("/api/voice/speak", json={"text": "one"}).status_code == 200
    assert client.post("/api/voice/speak", json={"text": "two"}).status_code == 200
    assert tts_paths(fake) == [f"/v1/text-to-speech/{DEFAULT_VOICE_ID}", "/v2/voices", "/v1/text-to-speech/account-voice", "/v1/text-to-speech/account-voice"]


def test_a_chosen_voice_that_is_missing_is_reported_not_replaced(client: TestClient, fake: FakeElevenLabs) -> None:
    fake.missing_voices.add("voice-123")
    response = client.post("/api/voice/speak", json={"text": "hello"})
    assert response.status_code == 502
    assert "voice-123" in response.json()["detail"]
    assert "/v2/voices" not in tts_paths(fake)


def test_no_voice_at_all_explains_what_to_do(fake: FakeElevenLabs) -> None:
    fake.missing_voices.add(DEFAULT_VOICE_ID)
    fake.voices = []
    response = without_voice(fake).post("/api/voice/speak", json={"text": "hello"})
    assert response.status_code == 502
    assert "ELEVENLABS_VOICE_ID" in response.json()["detail"]


def test_startup_warms_the_voice_up_once(fake: FakeElevenLabs) -> None:
    eleven = ElevenLabs(api_key=KEY, transport=httpx.MockTransport(fake))
    with TestClient(create_app(settings(), eleven)) as client:
        for _ in range(50):
            if fake.requests:
                break
            time.sleep(0.01)
        assert client.get("/api/voice/status").json() == {"enabled": True}
    assert tts_paths(fake) == [f"/v1/text-to-speech/{DEFAULT_VOICE_ID}"]
    assert json.loads(fake.requests[0].read())["text"] == "Ready."


def test_failed_warm_up_does_not_stop_the_server(fake: FakeElevenLabs) -> None:
    fake.status = 401
    eleven = ElevenLabs(api_key=KEY, transport=httpx.MockTransport(fake))
    with TestClient(create_app(settings(), eleven)) as client:
        assert client.get("/api/voice/status").status_code == 200


def test_malformed_transcription_response_is_an_error(client: TestClient, fake: FakeElevenLabs) -> None:
    fake.stt_body = {"unexpected": True}
    response = client.post("/api/voice/transcribe", files={"audio": ("a.webm", b"x", "audio/webm")})
    assert response.status_code == 502


def test_network_failure_is_reported(fake: FakeElevenLabs) -> None:
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    eleven = ElevenLabs(api_key=KEY, transport=httpx.MockTransport(down))
    response = TestClient(create_app(settings(), eleven)).post("/api/voice/speak", json={"text": "hello"})
    assert response.status_code == 502
    assert "Could not reach ElevenLabs" in response.json()["detail"]


def test_settings_from_environment(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    env = tmp_path / ".env"
    env.write_text("ELEVENLABS_API_KEY=from-file\nELEVENLABS_VOICE_ID=file-voice\n", encoding="utf-8")
    for name in ("ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ELEVENLABS_STT_MODEL", "ELEVENLABS_TTS_MODEL"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "env-voice")
    loaded = load_settings(env)
    assert loaded.api_key == "from-file"
    assert loaded.voice_id == "env-voice"  # real environment wins over .env
    assert loaded.voice_enabled


def test_settings_without_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    assert not load_settings(None).voice_enabled


def test_requests_from_other_sites_are_refused(client: TestClient, fake: FakeElevenLabs) -> None:
    audio = {"audio": ("a.webm", b"x", "audio/webm")}
    refused = client.post("/api/voice/transcribe", files=audio, headers={"Origin": "https://evil.example"})
    assert refused.status_code == 403
    assert client.post("/api/voice/speak", json={"text": "hi"}, headers={"Host": "attacker.example"}).status_code == 403
    assert fake.requests == []
    for origin in ("http://127.0.0.1:5173", "http://localhost:5174", "http://[::1]:5173"):
        assert client.post("/api/voice/transcribe", files=audio, headers={"Origin": origin}).status_code == 200, origin


def test_auth_errors_keep_elevenlabs_reason(client: TestClient, fake: FakeElevenLabs) -> None:
    fake.status = 401
    detail = client.post("/api/voice/speak", json={"text": "hello"}).json()["detail"]
    assert "remaining credits" in detail and "Quota exceeded" in detail


def test_the_deployments_own_domain_is_allowed(fake: FakeElevenLabs, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VERCEL_PROJECT_PRODUCTION_URL", "clingraph.vercel.app")
    eleven = ElevenLabs(api_key=KEY, transport=httpx.MockTransport(fake))
    client = TestClient(create_app(settings(), eleven, warm_up=False))
    own = {"Host": "clingraph.vercel.app", "Origin": "https://clingraph.vercel.app"}
    assert client.get("/api/voice/status", headers=own).status_code == 200
    assert client.get("/api/voice/status", headers={**own, "Origin": "https://evil.example"}).status_code == 403

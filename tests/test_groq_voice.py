"""Groq voice tests (Whisper + Orpheus). Groq is replaced by an httpx.MockTransport; no network or key needed."""

from __future__ import annotations

import io
import json
import wave

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.config import load_settings
from backend.groq_voice import MAX_TTS_CHARS, GroqVoice, join_wavs, split_for_speech
from backend.main import NO_ANSWERER, create_app

KEY = "gsk_test-secret-key"


def wav(frames: int, rate: int = 24000) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x01\x00" * frames)
    return out.getvalue()


class FakeGroq:
    """Records requests and answers like Groq would."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.status = 200

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.status != 200:
            return httpx.Response(self.status, json={"error": {"message": f"nope for {KEY}"}})
        if request.url.path.endswith("/audio/transcriptions"):
            return httpx.Response(200, json={"text": " Which procedures are documented? "})
        return httpx.Response(200, content=wav(100), headers={"content-type": "audio/wav"})

    def speech_inputs(self) -> list[str]:
        return [json.loads(r.content)["input"] for r in self.requests if r.url.path.endswith("/audio/speech")]


@pytest.fixture
def fake() -> FakeGroq:
    return FakeGroq()


@pytest.fixture
def client(fake: FakeGroq) -> TestClient:
    groq = GroqVoice(api_key=KEY, transport=httpx.MockTransport(fake))
    return TestClient(create_app(client=groq, warm_up=False, answerer=NO_ANSWERER))


def test_transcribes_with_whisper_and_the_clinical_prompt(client: TestClient, fake: FakeGroq) -> None:
    response = client.post("/api/voice/transcribe", files={"audio": ("q.webm", b"audio-bytes", "audio/webm")})
    assert response.status_code == 200
    assert response.json() == {"text": "Which procedures are documented?"}
    request = fake.requests[0]
    assert request.headers["authorization"] == f"Bearer {KEY}"
    body = request.content.decode("latin-1")
    assert "whisper-large-v3" in body and "hydroureteronephrosis" in body and "audio-bytes" in body


def test_speaks_wav_with_the_default_voice(client: TestClient, fake: FakeGroq) -> None:
    response = client.post("/api/voice/speak", json={"text": "Two procedures, both on the left side."})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    sent = json.loads(fake.requests[0].content)
    assert sent == {"model": "canopylabs/orpheus-v1-english", "input": "Two procedures, both on the left side.", "voice": "daniel", "response_format": "wav"}


def test_a_long_sentence_is_spoken_in_pieces_and_joined(client: TestClient, fake: FakeGroq) -> None:
    text = "On 2 February a ureteroscopy with laser lithotripsy removed the 6 millimetre stone, " * 4
    response = client.post("/api/voice/speak", json={"text": text})
    pieces = fake.speech_inputs()
    assert len(pieces) > 1 and all(len(p) <= MAX_TTS_CHARS for p in pieces)
    assert " ".join(pieces) == " ".join(text.split())
    with wave.open(io.BytesIO(response.content)) as joined:
        assert joined.getnframes() == 100 * len(pieces)


@pytest.mark.parametrize("upstream, expected", [(401, 502), (429, 429), (400, 502)])
def test_errors_are_mapped_without_leaking_the_key(client: TestClient, fake: FakeGroq, upstream: int, expected: int) -> None:
    fake.status = upstream
    response = client.post("/api/voice/speak", json={"text": "Hello."})
    assert response.status_code == expected
    assert KEY not in response.text and "Groq" in response.text


def test_splitting_prefers_commas_and_keeps_every_word() -> None:
    text = "Creatinine was 1.0 mg/dL on 12 January, rose to 1.5 by 19 January with the obstruction, and was 1.1 on 21 January."
    assert split_for_speech(text, 80) == ["Creatinine was 1.0 mg/dL on 12 January,", "rose to 1.5 by 19 January with the obstruction, and was 1.1 on 21 January."]
    assert " ".join(split_for_speech(text, 60)) == text
    assert split_for_speech("Short.") == ["Short."]


def test_a_streaming_header_is_rewritten_with_the_real_length() -> None:
    clip = bytearray(wav(48))
    clip[4:8] = clip[40:44] = b"\xff\xff\xff\x7f"  # RIFF and data sizes claim far more than is there
    with wave.open(io.BytesIO(join_wavs([bytes(clip)]))) as w:
        assert w.getnframes() == 48


def test_no_warm_up_request_spends_the_daily_quota(fake: FakeGroq) -> None:
    groq = GroqVoice(api_key=KEY, transport=httpx.MockTransport(fake))
    with TestClient(create_app(client=groq, answerer=NO_ANSWERER)):
        pass
    assert fake.requests == []


def test_joined_wav_keeps_the_format() -> None:
    joined = join_wavs([wav(10), wav(20)])
    with wave.open(io.BytesIO(joined)) as w:
        assert (w.getframerate(), w.getnchannels(), w.getnframes()) == (24000, 1, 30)


def test_groq_voice_is_used_only_without_an_elevenlabs_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    monkeypatch.setenv("GROQ_API_KEY", "k")
    monkeypatch.delenv("GROQ_VOICE", raising=False)
    settings = load_settings(None)
    assert settings.voice_enabled and settings.groq_voice == "daniel"
    app = create_app(settings, warm_up=False, answerer=NO_ANSWERER)
    assert isinstance(app.state.client, GroqVoice)

    monkeypatch.setenv("GROQ_VOICE", "off")
    assert not load_settings(None).voice_enabled

    monkeypatch.setenv("ELEVENLABS_API_KEY", "e")
    monkeypatch.setenv("GROQ_VOICE", "troy")
    app = create_app(load_settings(None), warm_up=False, answerer=NO_ANSWERER)
    assert not isinstance(app.state.client, GroqVoice)

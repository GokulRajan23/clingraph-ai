"""Minimal ElevenLabs client: speech-to-text and text-to-speech. The API key never leaves the server."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import httpx

BASE_URL = "https://api.elevenlabs.io"
STT_PATH = "/v1/speech-to-text"
TTS_PATH = "/v1/text-to-speech/{voice_id}"
VOICES_PATH = "/v2/voices"
log = logging.getLogger("uvicorn.error")

# Chosen 2026-11-14 by benchmarking the app's own answers (latency, and a TTS -> Scribe round trip
# scoring the clinical wording):
# - scribe_v3: current batch STT model; 8/8 spoken questions word-perfect at ~0.7 s on a warm
#   connection (scribe_v2_medical and keyterms gave no further gain).
# - eleven_multilingual_v2: ElevenLabs' most natural stable TTS model, a one-line answer in
#   ~0.5 s on a warm connection (flash_v2_5 starts ~0.3 s sooner but sounds plainer; v4/v3 take
#   3.5-4 s, too slow for chat).
# - Nathaniel C, "Calm Medical Support Agent" (Voice Library): clearest in the round trip
#   (2.5% WER), built for medical support, and not one of the premade voices that expire 2026-12-31.
DEFAULT_STT_MODEL = "scribe_v3"
DEFAULT_TTS_MODEL = "eleven_multilingual_v2"
DEFAULT_VOICE_ID = "eIYyt1GDV2CYz5Ccyam2"
TTS_OUTPUT_FORMAT = "mp3_44100_128"
# Models that do not support language_code (per the TTS API reference).
NO_LANGUAGE_CODE = ("eleven_multilingual_v2",)
WARM_UP_TEXT = "Ready."

TIMEOUT = httpx.Timeout(30.0, connect=10.0)


class ElevenLabsError(Exception):
    """ElevenLabs refused or failed a request. `status` is the upstream HTTP status, if any."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


@dataclass
class ElevenLabs:
    api_key: str
    stt_model: str = DEFAULT_STT_MODEL
    tts_model: str = DEFAULT_TTS_MODEL
    # Set from ELEVENLABS_VOICE_ID. None: DEFAULT_VOICE_ID, falling back to the account's first
    # voice if that library voice is ever withdrawn.
    voice_id: str | None = None
    language: str = "en"
    # Tests pass an httpx.MockTransport; production uses the default network transport.
    transport: httpx.AsyncBaseTransport | None = None
    # The account voice used after DEFAULT_VOICE_ID turned out to be unavailable.
    fallback_voice: str | None = None
    _http: httpx.AsyncClient | None = field(default=None, init=False, repr=False)

    def _client(self) -> httpx.AsyncClient:
        # One client for the server's life: a new one costs ~0.4 s to build its TLS context on
        # Windows, plus a fresh connection to ElevenLabs.
        if self._http is None:
            self._http = httpx.AsyncClient(base_url=BASE_URL, headers={"xi-api-key": self.api_key}, timeout=TIMEOUT, transport=self.transport)
        return self._http

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    async def transcribe(self, audio: bytes, filename: str, content_type: str) -> str:
        """Transcribes one recorded utterance and returns its text."""
        start = time.perf_counter()
        response = await self._send(
            self._client().post(
                STT_PATH,
                data={"model_id": self.stt_model, "language_code": self.language, "tag_audio_events": "false"},
                files={"file": (filename, audio, content_type)},
            )
        )
        log.info("Transcribed in %.2f s", time.perf_counter() - start)
        try:
            text = response.json()["text"]
        except (ValueError, KeyError, TypeError) as error:
            raise ElevenLabsError("Unexpected speech-to-text response") from error
        if not isinstance(text, str):
            raise ElevenLabsError("Unexpected speech-to-text response")
        return text.strip()

    def current_voice(self) -> str:
        return self.voice_id or self.fallback_voice or DEFAULT_VOICE_ID

    async def account_voice(self, client: httpx.AsyncClient) -> str:
        """The account's first voice (by name)."""
        response = await self._send(client.get(VOICES_PATH, params={"page_size": 10, "sort": "name", "sort_direction": "asc"}))
        try:
            voices = response.json()["voices"]
            voice_id = voices[0]["voice_id"] if voices else None
        except (ValueError, KeyError, TypeError, IndexError) as error:
            raise ElevenLabsError("Unexpected voices response") from error
        if not isinstance(voice_id, str) or not voice_id:
            raise ElevenLabsError("No ElevenLabs voice is available: add one in ElevenLabs or set ELEVENLABS_VOICE_ID")
        return voice_id

    async def speak(self, text: str, previous_text: str | None = None) -> bytes:
        """Synthesises `text` and returns MP3 audio. `previous_text`, what was said just before,
        keeps the intonation flowing when an answer is spoken one line at a time."""
        body: dict[str, str] = {"text": text, "model_id": self.tts_model}
        if previous_text:
            body["previous_text"] = previous_text
        if self.tts_model not in NO_LANGUAGE_CODE:
            body["language_code"] = self.language
        client = self._client()
        start = time.perf_counter()

        async def synthesise(voice_id: str) -> httpx.Response:
            return await self._send(
                client.post(
                    TTS_PATH.format(voice_id=voice_id),
                    params={"output_format": TTS_OUTPUT_FORMAT},
                    json=body,
                    headers={"accept": "audio/mpeg"},
                )
            )

        try:
            response = await synthesise(self.current_voice())
        except ElevenLabsError as error:
            # Only the built-in default falls back; a voice the user chose should fail loudly.
            if error.status != 404 or self.voice_id or self.fallback_voice:
                raise
            self.fallback_voice = await self.account_voice(client)
            response = await synthesise(self.fallback_voice)
        log.info("Spoke %d characters in %.2f s", len(text), time.perf_counter() - start)
        return response.content

    async def warm_up(self) -> None:
        """One tiny synthesis, so the first real answer doesn't pay the voice's cold start (seconds
        for a Voice Library voice on its first request with a model)."""
        await self.speak(WARM_UP_TEXT)

    @staticmethod
    async def _send(request) -> httpx.Response:
        try:
            response = await request
        except httpx.HTTPError as error:
            raise ElevenLabsError(f"Could not reach ElevenLabs: {type(error).__name__}") from error
        if response.status_code >= 400:
            raise ElevenLabsError(_detail(response), response.status_code)
        return response


def _detail(response: httpx.Response) -> str:
    """A short, key-free description of an ElevenLabs error response."""
    try:
        detail = response.json().get("detail")
    except ValueError:
        detail = None
    if isinstance(detail, dict):
        detail = detail.get("message") or detail.get("status")
    if isinstance(detail, list) and detail:
        detail = detail[0].get("msg") if isinstance(detail[0], dict) else str(detail[0])
    return f"ElevenLabs returned {response.status_code}" + (f": {detail}" if isinstance(detail, str) and detail else "")

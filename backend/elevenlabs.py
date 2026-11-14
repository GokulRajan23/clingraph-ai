"""Minimal ElevenLabs client: speech-to-text and text-to-speech. The API key never leaves the server."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

BASE_URL = "https://api.elevenlabs.io"
STT_PATH = "/v1/speech-to-text"
TTS_PATH = "/v1/text-to-speech/{voice_id}"
VOICES_PATH = "/v2/voices"

# Sources (checked 2026-11-14): elevenlabs.io/docs/models and the API reference.
# scribe_v3 is the current batch model (scribe_v1 is deprecated). eleven_flash_v2_5 is the
# documented low-latency REST TTS model, at half the per-character price.
DEFAULT_STT_MODEL = "scribe_v3"
DEFAULT_TTS_MODEL = "eleven_flash_v2_5"
TTS_OUTPUT_FORMAT = "mp3_44100_128"

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
    # None: use the first voice on the account. ElevenLabs' former default voices are not on
    # accounts created after March 2026 and expire on 2026-12-31, so no voice id is hardcoded.
    voice_id: str | None = None
    language: str = "en"
    # Tests pass an httpx.MockTransport; production uses the default network transport.
    transport: httpx.AsyncBaseTransport | None = None

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=BASE_URL,
            headers={"xi-api-key": self.api_key},
            timeout=TIMEOUT,
            transport=self.transport,
        )

    async def transcribe(self, audio: bytes, filename: str, content_type: str) -> str:
        """Transcribes one recorded utterance and returns its text."""
        async with self._client() as client:
            response = await self._send(
                client.post(
                    STT_PATH,
                    data={"model_id": self.stt_model, "language_code": self.language, "tag_audio_events": "false"},
                    files={"file": (filename, audio, content_type)},
                )
            )
        try:
            text = response.json()["text"]
        except (ValueError, KeyError, TypeError) as error:
            raise ElevenLabsError("Unexpected speech-to-text response") from error
        if not isinstance(text, str):
            raise ElevenLabsError("Unexpected speech-to-text response")
        return text.strip()

    async def resolve_voice(self, client: httpx.AsyncClient) -> str:
        """The configured voice, or the account's first voice (looked up once, then cached)."""
        if self.voice_id:
            return self.voice_id
        response = await self._send(client.get(VOICES_PATH, params={"page_size": 10, "sort": "name", "sort_direction": "asc"}))
        try:
            voices = response.json()["voices"]
            voice_id = voices[0]["voice_id"] if voices else None
        except (ValueError, KeyError, TypeError, IndexError) as error:
            raise ElevenLabsError("Unexpected voices response") from error
        if not isinstance(voice_id, str) or not voice_id:
            raise ElevenLabsError("No ElevenLabs voice is available: add one in ElevenLabs or set ELEVENLABS_VOICE_ID")
        self.voice_id = voice_id
        return voice_id

    async def speak(self, text: str) -> bytes:
        """Synthesises `text` and returns MP3 audio."""
        async with self._client() as client:
            voice_id = await self.resolve_voice(client)
            response = await self._send(
                client.post(
                    TTS_PATH.format(voice_id=voice_id),
                    params={"output_format": TTS_OUTPUT_FORMAT},
                    json={"text": text, "model_id": self.tts_model, "language_code": self.language},
                    headers={"accept": "audio/mpeg"},
                )
            )
        return response.content

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

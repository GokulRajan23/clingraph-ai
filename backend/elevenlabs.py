"""Minimal ElevenLabs client: speech-to-text and text-to-speech. The API key never leaves the server."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

BASE_URL = "https://api.elevenlabs.io"
STT_PATH = "/v1/speech-to-text"
TTS_PATH = "/v1/text-to-speech/{voice_id}"
VOICES_PATH = "/v2/voices"

# Chosen 2026-11-14 by benchmarking the app's own answers (latency, and a TTS -> Scribe round trip
# scoring the clinical wording):
# - scribe_v3: current batch STT model; 8/8 spoken questions word-perfect at ~0.4 s
#   (scribe_v2_medical and keyterms gave no further gain).
# - eleven_multilingual_v2: ElevenLabs' most natural stable TTS model, a full answer in ~1 s
#   (flash_v2_5 is ~0.5 s faster but plainer; v4/v3 take 3.5-4 s, too slow for chat).
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

    async def speak(self, text: str) -> bytes:
        """Synthesises `text` and returns MP3 audio."""
        body: dict[str, str] = {"text": text, "model_id": self.tts_model}
        if self.tts_model not in NO_LANGUAGE_CODE:
            body["language_code"] = self.language
        async with self._client() as client:

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

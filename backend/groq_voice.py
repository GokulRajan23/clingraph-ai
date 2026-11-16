"""Free voice through Groq: Whisper hears the question, Orpheus reads the answer. Same shape as the
ElevenLabs client (transcribe, speak, warm_up, aclose), so the endpoints take either. The key
(GROQ_API_KEY, the one the answers use) never leaves the server.

Orpheus on Groq takes at most 200 characters a request and returns only WAV, so a longer sentence
is split at its commas (or spaces) and the pieces' audio is joined into one WAV. Its WAV header
is a streaming placeholder (it claims ~25 hours), so every clip is rewritten with its real length.

The free tier allows Orpheus 100 requests a day (a request per sentence, measured 2026-11-16), so
there is no warm-up request; past the limit the frontend reads answers with the browser's voice.
"""

from __future__ import annotations

import io
import logging
import re
import time
import wave
from dataclasses import dataclass, field

import httpx

BASE_URL = "https://api.groq.com/openai/v1"
STT_PATH = "/audio/transcriptions"
TTS_PATH = "/audio/speech"
log = logging.getLogger("uvicorn.error")

# whisper-large-v3 over -turbo: measured 2026-11-16 on spoken clinical questions, turbo heard
# "tamsulosin or amlodipine" as "Tamzula's inoramlodipine"; v3 was word-perfect at the same ~0.5 s.
DEFAULT_STT_MODEL = "whisper-large-v3"
DEFAULT_TTS_MODEL = "canopylabs/orpheus-v1-english"
DEFAULT_VOICE = "daniel"
MAX_TTS_CHARS = 200
# Whisper's prompt biases it towards these spellings (up to 224 tokens): the record's clinical words.
STT_PROMPT = (
    "Questions about Martin Keller's urology record: ureteric stone, hydroureteronephrosis, "
    "hydronephrosis, double-J stent, ureteroscopy, laser lithotripsy, creatinine, acute kidney injury, "
    "tamsulosin, amlodipine, paracetamol, cefazolin, calcium oxalate, renal colic, haematuria."
)

TIMEOUT = httpx.Timeout(30.0, connect=10.0)


class GroqVoiceError(Exception):
    """Groq refused or failed a request. `status` is the upstream HTTP status, if any."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


def split_for_speech(text: str, limit: int = MAX_TTS_CHARS) -> list[str]:
    """`text` in pieces of at most `limit` characters, broken after commas or semicolons where
    possible, else between words."""
    text = " ".join(text.split())
    pieces: list[str] = []
    while len(text) > limit:
        window = text[: limit + 1]
        cut = max(window.rfind(", "), window.rfind("; "))
        cut = cut + 1 if cut > limit // 3 else window.rfind(" ")
        if cut <= 0:
            cut = limit
        pieces.append(text[:cut].strip())
        text = text[cut:].strip()
    if text:
        pieces.append(text)
    return pieces


def join_wavs(clips: list[bytes]) -> bytes:
    """One WAV, with a header that states its real length, from clips of the same format (Orpheus
    always returns the same). Each clip's frames are read to its end, whatever its header claims."""
    out = io.BytesIO()
    with wave.open(out, "wb") as joined:
        for i, clip in enumerate(clips):
            with wave.open(io.BytesIO(clip), "rb") as part:
                if i == 0:
                    joined.setparams(part.getparams()._replace(nframes=0))
                joined.writeframes(part.readframes(part.getnframes()))
    return out.getvalue()


@dataclass
class GroqVoice:
    api_key: str
    stt_model: str = DEFAULT_STT_MODEL
    tts_model: str = DEFAULT_TTS_MODEL
    voice: str = DEFAULT_VOICE
    language: str = "en"
    # Tests pass an httpx.MockTransport; production uses the default network transport.
    transport: httpx.AsyncBaseTransport | None = None
    name: str = "Groq"
    media_type: str = "audio/wav"
    _http: httpx.AsyncClient | None = field(default=None, init=False, repr=False)

    def _client(self) -> httpx.AsyncClient:
        # One client for the server's life, so every request reuses the connection.
        if self._http is None:
            self._http = httpx.AsyncClient(base_url=BASE_URL, headers={"Authorization": f"Bearer {self.api_key}"}, timeout=TIMEOUT, transport=self.transport)
        return self._http

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    def current_voice(self) -> str:
        return self.voice

    async def transcribe(self, audio: bytes, filename: str, content_type: str) -> str:
        """Transcribes one recorded question and returns its text."""
        start = time.perf_counter()
        response = await self._send(
            self._client().post(
                STT_PATH,
                data={"model": self.stt_model, "language": self.language, "prompt": STT_PROMPT, "response_format": "json", "temperature": "0"},
                files={"file": (filename, audio, content_type)},
            )
        )
        log.info("Transcribed in %.2f s", time.perf_counter() - start)
        try:
            text = response.json()["text"]
        except (ValueError, KeyError, TypeError) as error:
            raise GroqVoiceError("Unexpected speech-to-text response") from error
        if not isinstance(text, str):
            raise GroqVoiceError("Unexpected speech-to-text response")
        return text.strip()

    async def speak(self, text: str, previous_text: str | None = None) -> bytes:
        """Synthesises `text` and returns WAV audio. `previous_text` is accepted for the same shape as
        the ElevenLabs client; Orpheus has no use for it."""
        start = time.perf_counter()
        clips = []
        for piece in split_for_speech(text):
            response = await self._send(
                self._client().post(TTS_PATH, json={"model": self.tts_model, "input": piece, "voice": self.voice, "response_format": "wav"})
            )
            clips.append(response.content)
        try:
            audio = join_wavs(clips)
        except (wave.Error, EOFError) as error:
            raise GroqVoiceError("Unexpected text-to-speech response") from error
        log.info("Spoke %d characters in %.2f s", len(text), time.perf_counter() - start)
        return audio

    async def warm_up(self) -> None:
        """Nothing: a warm-up synthesis would spend one of the day's 100 Orpheus requests on every
        cold start (each serverless instance), for ~0.2 s of connection setup."""

    @staticmethod
    async def _send(request) -> httpx.Response:
        try:
            response = await request
        except httpx.HTTPError as error:
            raise GroqVoiceError(f"Could not reach Groq: {type(error).__name__}") from error
        if response.status_code >= 400:
            raise GroqVoiceError(_detail(response), response.status_code)
        return response


def _detail(response: httpx.Response) -> str:
    """A short, key-free description of a Groq error response."""
    try:
        error = response.json().get("error")
        message = error.get("message") if isinstance(error, dict) else None
    except (ValueError, AttributeError):
        message = None
    if isinstance(message, str):
        message = re.sub(r"gsk_\w+", "[key]", message)[:300]
    return f"Groq returned {response.status_code}" + (f": {message}" if message else "")

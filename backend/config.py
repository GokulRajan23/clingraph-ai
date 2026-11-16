"""Voice and answer settings, read once from the environment and an optional git-ignored .env file."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from .answers import DEFAULT_LLM_MODEL
from .elevenlabs import DEFAULT_STT_MODEL, DEFAULT_TTS_MODEL
from .groq_voice import DEFAULT_VOICE as DEFAULT_GROQ_VOICE

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    api_key: str | None
    voice_id: str | None
    stt_model: str
    tts_model: str
    language: str
    # "provider:model" for LangChain's init_chat_model. The provider's own key (e.g.
    # FIREWORKS_API_KEY) must be set too, or answers fall back to the scripted ones.
    llm_model: str | None = None
    # How hard a reasoning model thinks before answering (e.g. "low" for gpt-oss on Groq). None
    # leaves the provider default (REASONING_EFFORT in answers.py).
    llm_reasoning_effort: str | None = None
    # Free voice through Groq (Whisper + Orpheus), used when there is no ElevenLabs key. Uses the
    # same GROQ_API_KEY as the answers; GROQ_VOICE=off leaves voice to the browser.
    groq_api_key: str | None = None
    groq_voice: str | None = DEFAULT_GROQ_VOICE

    @property
    def voice_enabled(self) -> bool:
        return bool(self.api_key) or bool(self.groq_api_key and self.groq_voice)


def load_settings(env_file: Path | None = ROOT / ".env") -> Settings:
    if env_file is not None:
        # Real environment variables win over .env entries.
        load_dotenv(env_file, override=False)
    return Settings(
        api_key=(os.environ.get("ELEVENLABS_API_KEY") or "").strip() or None,
        voice_id=(os.environ.get("ELEVENLABS_VOICE_ID") or "").strip() or None,
        stt_model=(os.environ.get("ELEVENLABS_STT_MODEL") or "").strip() or DEFAULT_STT_MODEL,
        tts_model=(os.environ.get("ELEVENLABS_TTS_MODEL") or "").strip() or DEFAULT_TTS_MODEL,
        language="en",
        llm_model=(os.environ.get("LLM_MODEL") or "").strip() or DEFAULT_LLM_MODEL,
        llm_reasoning_effort=(os.environ.get("LLM_REASONING_EFFORT") or "").strip() or None,
        groq_api_key=(os.environ.get("GROQ_API_KEY") or "").strip() or None,
        groq_voice=_groq_voice((os.environ.get("GROQ_VOICE") or "").strip().lower()),
    )


def _groq_voice(value: str) -> str | None:
    """GROQ_VOICE: an Orpheus voice name, empty for the default, "off" for no Groq voice."""
    if value == "off":
        return None
    return value or DEFAULT_GROQ_VOICE

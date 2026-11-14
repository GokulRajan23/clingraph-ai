"""Voice backend for ClinGraph: speech-to-text and text-to-speech through ElevenLabs.

The graph and chat stay in the frontend for v1; this server only exists so the ElevenLabs
API key stays out of the browser. Run: uvicorn backend.main:app --port 8000
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from .config import Settings, load_settings
from .elevenlabs import ElevenLabs, ElevenLabsError

MAX_AUDIO_BYTES = 10 * 1024 * 1024
MAX_TEXT_CHARS = 2500
AUDIO_TYPES = ("audio/", "video/webm")  # Some browsers label MediaRecorder output video/webm.
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
log = logging.getLogger("uvicorn.error")


def create_app(settings: Settings | None = None, client: ElevenLabs | None = None, warm_up: bool = True) -> FastAPI:
    settings = settings or load_settings()
    if client is None and settings.api_key:
        client = ElevenLabs(api_key=settings.api_key, stt_model=settings.stt_model, tts_model=settings.tts_model, voice_id=settings.voice_id, language=settings.language)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = asyncio.create_task(_warm_up(client)) if client is not None and warm_up else None
        yield
        if task is not None and not task.done():
            task.cancel()

    app = FastAPI(title="ClinGraph voice", docs_url=None, redoc_url=None, lifespan=lifespan)
    app.state.settings = settings
    app.state.client = client

    # Every call spends ElevenLabs credits. Browsers send Origin on cross-site POSTs, and a
    # multipart upload needs no preflight, so refuse anything not from this machine. Requests
    # without Origin (curl, tests) and same-machine pages on any port (Vite may move off 5173) pass.
    @app.middleware("http")
    async def local_origin_only(request: Request, call_next):
        origin = request.headers.get("origin")
        if origin and origin != "null" and urlsplit(origin).hostname not in LOCAL_HOSTS:
            return JSONResponse({"detail": "Requests are only accepted from this machine"}, status_code=403)
        host = (request.headers.get("host") or "").rsplit(":", 1)[0].strip("[]")
        if host and host not in LOCAL_HOSTS | {"testserver"}:
            return JSONResponse({"detail": "Unexpected host"}, status_code=403)
        return await call_next(request)

    def voice(request: Request) -> ElevenLabs:
        if request.app.state.client is None:
            raise HTTPException(503, "Voice is not configured: set ELEVENLABS_API_KEY")
        return request.app.state.client

    @app.get("/api/voice/status")
    def status(request: Request) -> dict[str, bool]:
        return {"enabled": request.app.state.client is not None}

    @app.post("/api/voice/transcribe")
    async def transcribe(audio: UploadFile, eleven: ElevenLabs = Depends(voice)) -> dict[str, str]:
        content_type = (audio.content_type or "").split(";")[0].strip().lower()
        if not content_type.startswith(AUDIO_TYPES):
            raise HTTPException(415, "Expected an audio recording")
        data = await audio.read(MAX_AUDIO_BYTES + 1)
        if not data:
            raise HTTPException(400, "The recording is empty")
        if len(data) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "The recording is too long")
        try:
            text = await eleven.transcribe(data, audio.filename or "question.webm", content_type)
        except ElevenLabsError as error:
            raise _upstream(error) from error
        return {"text": text}

    @app.post("/api/voice/speak")
    async def speak(body: SpeakRequest, eleven: ElevenLabs = Depends(voice)) -> Response:
        try:
            audio = await eleven.speak(body.text)
        except ElevenLabsError as error:
            raise _upstream(error) from error
        return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})

    return app


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS, pattern=r"\S")


async def _warm_up(client: ElevenLabs) -> None:
    try:
        await client.warm_up()
        log.info("ElevenLabs voice %s ready (%s)", client.current_voice(), client.tts_model)
    except ElevenLabsError as error:
        # Not fatal: the first answer will surface the same problem to the user.
        log.warning("ElevenLabs warm-up failed: %s", error)


def _upstream(error: ElevenLabsError) -> HTTPException:
    # Auth and quota problems are configuration issues on our side; report them as such.
    # ElevenLabs also uses 401 for exhausted credits, so keep its own reason in the message.
    if error.status in (401, 403):
        return HTTPException(502, f"ElevenLabs refused the request (check the API key, its permissions and remaining credits). {error}")
    if error.status == 429:
        return HTTPException(429, "ElevenLabs rate limit or quota reached; try again shortly")
    return HTTPException(502, str(error))


app = create_app()

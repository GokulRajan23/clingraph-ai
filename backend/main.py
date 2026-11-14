"""Backend for ClinGraph: voice through ElevenLabs and answers from an LLM.

The graph stays in the frontend for v1, which sends it with each question; this server exists so
the API keys stay out of the browser. Run: uvicorn backend.main:app --port 8000
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

from .answers import Answerer, AnswerError, AskRequest, load_answerer
from .config import Settings, load_settings
from .elevenlabs import ElevenLabs, ElevenLabsError

MAX_AUDIO_BYTES = 10 * 1024 * 1024
MAX_TEXT_CHARS = 2500
AUDIO_TYPES = ("audio/", "video/webm")  # Some browsers label MediaRecorder output video/webm.
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
# Vercel sets these to the deployment's own domains.
VERCEL_HOST_VARS = ("VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL")


def allowed_hosts() -> set[str]:
    """This machine, the Vercel deployment's own domains, and any in ALLOWED_HOSTS (comma-separated)."""
    extra = [os.environ.get(name, "") for name in VERCEL_HOST_VARS] + os.environ.get("ALLOWED_HOSTS", "").split(",")
    return LOCAL_HOSTS | {h.strip().lower() for h in extra if h.strip()}
log = logging.getLogger("uvicorn.error")


# Passed as `answerer` to build no answerer even when LLM_MODEL is set (tests).
NO_ANSWERER = object()


def create_app(settings: Settings | None = None, client: ElevenLabs | None = None, warm_up: bool = True, answerer: Answerer | object | None = None) -> FastAPI:
    settings = settings or load_settings()
    if answerer is None and settings.llm_model:
        answerer = load_answerer(settings.llm_model)
    if answerer is NO_ANSWERER:
        answerer = None
    if client is None and settings.api_key:
        client = ElevenLabs(api_key=settings.api_key, stt_model=settings.stt_model, tts_model=settings.tts_model, voice_id=settings.voice_id, language=settings.language)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        tasks = []
        if warm_up and client is not None:
            tasks.append(asyncio.create_task(_warm_up_voice(client)))
        if warm_up and isinstance(answerer, Answerer):
            tasks.append(asyncio.create_task(_warm_up_answers(answerer)))
        yield
        for task in tasks:
            task.cancel()
        if client is not None:
            await client.aclose()

    app = FastAPI(title="ClinGraph voice", docs_url=None, redoc_url=None, lifespan=lifespan)
    app.state.settings = settings
    app.state.client = client
    app.state.answerer = answerer

    # Every call spends ElevenLabs and LLM credits. Browsers send Origin on cross-site POSTs, and a
    # multipart upload needs no preflight, so refuse anything not from this machine or this app's
    # own deployment. Requests without Origin (curl, tests) and same-machine pages on any port
    # (Vite may move off 5173) pass.
    hosts = allowed_hosts()

    @app.middleware("http")
    async def own_origin_only(request: Request, call_next):
        origin = request.headers.get("origin")
        if origin and origin != "null" and (urlsplit(origin).hostname or "") not in hosts:
            return JSONResponse({"detail": "Requests are only accepted from this app"}, status_code=403)
        host = (request.headers.get("host") or "").rsplit(":", 1)[0].strip("[]").lower()
        if host and host not in hosts | {"testserver"}:
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
            audio = await eleven.speak(body.text, body.previous_text)
        except ElevenLabsError as error:
            raise _upstream(error) from error
        return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})

    @app.post("/api/ask")
    async def ask(body: AskRequest, request: Request) -> StreamingResponse:
        """The answer as NDJSON: a {"type": "sentence"} event per sentence, then "done" with the
        sources and highlights, or "error" (possibly after some sentences) if the model fails or stalls."""
        answerer = request.app.state.answerer
        if answerer is None:
            raise HTTPException(503, "Answers are not configured: set LLM_MODEL and the provider's API key")

        async def events():
            try:
                async for event in answerer.stream(body):
                    yield json.dumps(event) + "\n"
            except TimeoutError:
                yield _error("The language model took too long to answer")
            except AnswerError as error:
                yield _error(str(error))
            except Exception as error:  # Provider errors: auth, quota, unknown model. Details go to the log.
                log.exception("LLM answer failed (%s)", answerer.name)
                yield _error(f"The language model failed ({type(error).__name__})")

        return StreamingResponse(events(), media_type="application/x-ndjson", headers={"Cache-Control": "no-store"})

    return app


def _error(detail: str) -> str:
    return json.dumps({"type": "error", "detail": detail}) + "\n"


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS, pattern=r"\S")
    # What was said just before, when an answer is spoken line by line.
    previous_text: str | None = Field(default=None, max_length=MAX_TEXT_CHARS)


async def _warm_up_voice(client: ElevenLabs) -> None:
    try:
        await client.warm_up()
        log.info("ElevenLabs voice %s ready (%s)", client.current_voice(), client.tts_model)
    except ElevenLabsError as error:
        # Not fatal: the first answer will surface the same problem to the user.
        log.warning("ElevenLabs warm-up failed: %s", error)


async def _warm_up_answers(answerer: Answerer) -> None:
    try:
        await answerer.warm_up()
        log.info("LLM %s ready", answerer.name)
    except Exception as error:  # Not fatal either: the first question reports it.
        log.warning("LLM warm-up failed (%s): %s", answerer.name, type(error).__name__)


def _upstream(error: ElevenLabsError) -> HTTPException:
    # Auth and quota problems are configuration issues on our side; report them as such.
    # ElevenLabs also uses 401 for exhausted credits, so keep its own reason in the message.
    if error.status in (401, 403):
        return HTTPException(502, f"ElevenLabs refused the request (check the API key, its permissions and remaining credits). {error}")
    if error.status == 429:
        return HTTPException(429, "ElevenLabs rate limit or quota reached; try again shortly")
    return HTTPException(502, str(error))


app = create_app()

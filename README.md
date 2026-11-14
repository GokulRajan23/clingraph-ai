# ClinGraph AI · v1

Upload a patient's PDF reports, explore them as a knowledge graph and ask questions about the patient's history, typed or by voice.

## Run

Node.js 22.12 or newer and Python 3.11 or newer. From this folder:

```powershell
.\start.ps1          # Windows
```

```bash
./start.sh           # macOS/Linux
```

Both install dependencies when needed, start the voice backend on port 8000 and the interface at http://127.0.0.1:5173 (Vite moves to the next free port if 5173 is taken; the terminal shows the address). The interface proxies `/api` to the backend.

### Voice (ElevenLabs)

Copy `.env.example` to `.env` (git-ignored) and set `ELEVENLABS_API_KEY`. The key stays in the backend; the browser never sees it. Without a key, or without the backend, the mic and listen buttons are hidden and typing works as usual.

- **Ask by voice:** click the mic, ask your question, and pause. Recording stops by itself after about 1.5 s of quiet (or click the mic again), is transcribed with ElevenLabs Scribe (`scribe_v3`, English) and sent as the question.
- **Answers aloud:** answers to spoken questions are read out with ElevenLabs text-to-speech (`eleven_multilingual_v2`). Every answer has a **Listen** button to play or stop it.
- **Voice:** Nathaniel C, "Calm Medical Support Agent" from the ElevenLabs Voice Library (`eIYyt1GDV2CYz5Ccyam2`), unless `ELEVENLABS_VOICE_ID` is set. If that library voice is ever withdrawn, the first voice on your account is used. The backend sends one tiny warm-up request at start, because a library voice's first request can take several seconds.
- **Why these:** chosen by benchmarking the app's own answers on 8 voices and 5 models (latency, plus a speech-to-text round trip scoring the clinical wording). All models pronounced the clinical terms clearly; `eleven_multilingual_v2` returns a full answer in about 1 s, `eleven_flash_v2_5` in about 0.5 s with plainer delivery, and `eleven_v4`/`eleven_v3` take 3.5-4 s. `scribe_v3` transcribed every test question word for word.
- The key needs access to speech-to-text and text-to-speech (and reading voices for the fallback). Each question and each spoken answer uses ElevenLabs credits.

## What v1 does

- **Reports (left):** upload one or more PDFs with the button or by dropping them anywhere on the page. Each file shows its size and a processing → processed status, and can be removed (which starts a new conversation, since the graph changes). Non-PDF files and duplicates are skipped with a notice.
- **Knowledge graph (centre):** a spinner while reports are processed, then the patient's graph: reports, findings and their states over time, diagnoses, procedures and medications. Pan, zoom and drag nodes; click a node to highlight its neighbourhood and see its properties and source reports.
- **Chat (right):** once the graph is shown, suggested questions appear. Each answer cites its source reports and highlights the nodes it is about.

## Not connected yet

PDFs never leave the browser and are not parsed: the graph is a synthetic fixture (`frontend/src/graph/fixture.ts`) whose five report nodes take the uploaded file names in upload order, and chat answers are hardcoded (`frontend/src/chat/script.ts`). Questions other than the suggested ones get a fallback answer.

Everything the UI needs goes through `frontend/src/api.ts`. Connecting PDF parsing, graph building and graph querying means replacing `processReports`, `fetchGraph`, `fetchSuggestions` and `ask`; the `Graph` shape is defined in `frontend/src/graph/types.ts`. The voice functions there already call the backend (`backend/`).

## Checks

```bash
cd frontend
npm run typecheck
npm test
npm run build
```

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
```

Backend tests replace ElevenLabs with a mock, so they need no key or network. On macOS/Linux, use `.venv/bin/python`.

Design references are in `docs/`.

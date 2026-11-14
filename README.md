# ClinGraph AI · v1

Find a patient, tap the pill and ask about their history out loud. ClinGraph answers by voice from the patient's reports and opens their knowledge graph with what the answer is about highlighted; click any highlighted item to see the report sentence it came from.

> **Demo data.** For the demo the reports are taken as already uploaded (or connected from an external source), so there is no upload. The patients, the knowledge graph and the report excerpts are hardcoded in `frontend/src/demo/data.ts`. The record is the synthetic urology case in the five demo PDFs (Martin Keller, SYN-URO-001, January to March 2026: a 6 mm left ureteric stone, stented, then treated by ureteroscopy), and the pop-up quotes follow the PDFs' wording. Changing the case means changing that file only; keep its shapes and IDs.

## Run

Node.js 22.12 or newer and Python 3.11 or newer. From this folder:

```powershell
.\start.ps1          # Windows
```

```bash
./start.sh           # macOS/Linux
```

Both install dependencies when needed, start the backend (voice and answers) on port 8000 and the interface at http://127.0.0.1:5173 (Vite moves to the next free port if 5173 is taken; the terminal shows the address). The interface proxies `/api` to the backend.

### Voice (ElevenLabs)

Copy `.env.example` to `.env` (git-ignored) and set `ELEVENLABS_API_KEY`. The key stays in the backend; the browser never sees it. Without a key, or without the backend, the pill can't listen: questions are typed and the answers are shown as text.

- **The pill:** a 3D particle capsule (the ClinGraph mark) that is the microphone. It breathes at rest, swells with your voice while listening, pulses while working and sends a wave along itself while speaking. Tap it to ask, tap again to send, tap while it speaks to stop. The keyboard icon opens a text box as a fallback; Esc closes it.
- **Ask by voice:** tap the pill, ask your question, and pause. Recording stops by itself after about 0.8 s of quiet, with a soft chime (or tap the pill; **Cancel** throws it away), is transcribed with ElevenLabs Scribe (`scribe_v3`, English) and sent as the question.
- **Answers aloud:** every answer is read out with ElevenLabs text-to-speech (`eleven_multilingual_v2`), a sentence at a time: the first sentence plays while the rest are still being written and synthesised. The text is hidden unless **Show model response** is ticked; the question it heard is always shown under the pill.
- **Speed:** the browser console logs each spoken turn (`[voice] transcribed / first sentence / first audio`, in ms from the end of the recording) and the backend logs each stage. The backend keeps one connection to ElevenLabs open and warms up the voice and the LLM at start.
- **Voice:** Nathaniel C, "Calm Medical Support Agent" from the ElevenLabs Voice Library (`eIYyt1GDV2CYz5Ccyam2`), unless `ELEVENLABS_VOICE_ID` is set. If that library voice is ever withdrawn, the first voice on your account is used. The backend sends one tiny warm-up request at start, because a library voice's first request can take several seconds.
- **Why these:** chosen by benchmarking the app's own answers on 8 voices and 5 models (latency, plus a speech-to-text round trip scoring the clinical wording). All models pronounced the clinical terms clearly; `eleven_multilingual_v2` speaks a one-line answer in about 0.5 s on a warm connection, `eleven_flash_v2_5` starts about 0.3 s sooner with plainer delivery, and `eleven_v4`/`eleven_v3` take 3.5-4 s. `scribe_v3` transcribed every test question word for word.
- The key needs access to speech-to-text and text-to-speech (and reading voices for the fallback). Each question and each spoken answer uses ElevenLabs credits.

### Answers (LLM through LangChain)

The suggested questions have scripted answers that appear at once. Any other question, typed or spoken, goes to `/api/ask` with the graph on screen and the last few turns, and an LLM answers from that record only, the way a colleague would brief you: the direct answer first, then the detail that matters, in one to three short sentences. The same words are shown (as a short paragraph, with the source reports below) and spoken. Highlights the graph doesn't have are dropped.

- Set `FIREWORKS_API_KEY` in `.env`. The model is `LLM_MODEL` (`provider:model` for LangChain's `init_chat_model`); empty means DeepSeek V4.1 Flash (1017) on Fireworks AI, `fireworks:accounts/fireworks/models/deepseek-v4p1-flash-1017`. For GLM 5.3 Flash set `LLM_MODEL=fireworks:accounts/fireworks/models/glm-5p3-flash`. Another provider works too once its LangChain package is installed (for example `langchain-openai`) and its key is set.
- The answer streams: the model writes one sentence per line and a final `HIGHLIGHT:` line naming the nodes the answer is about (the reports among them are its sources), and `/api/ask` sends each sentence on as NDJSON as soon as it is complete. If the model fails partway, the sentences so far stay with a note that the answer was cut short.
- Reasoning is off (`reasoning_effort="none"`): the first sentence arrives about 0.7 s sooner and the answers were as good.
- Without a key the backend logs "LLM answers are off" and free questions get the fallback answer; the suggested questions still work.

## Deploy (Vercel)

`vercel.json` builds the interface into `frontend/dist` and serves the backend as one Python function (`api/index.py`) for every `/api` route. In the Vercel project settings add the environment variables `ELEVENLABS_API_KEY` and `FIREWORKS_API_KEY` (optionally `LLM_MODEL`, `ELEVENLABS_VOICE_ID`), then deploy with `npx vercel --prod` or by importing the GitHub repo. The backend only answers its own deployment domain (from Vercel's `VERCEL_*` variables) and localhost; add others to `ALLOWED_HOSTS` (comma-separated). Anyone who can open the URL spends your ElevenLabs and Fireworks credits, so keep the link private or turn on Vercel's deployment protection.

## What v1 does

- **Landing:** the ClinGraph mark, two sentences on what it does, and a patient search. Type a name or the start of an insurance number; arrows and Enter (or a click) pick a patient. Only Martin Keller (try "martin" or "K417") has reports connected; the others say so.
- **History at a glance:** once a patient is picked, a horizontal timeline shows one stop per report (Stone found, Stent placed, Discharged, Stone removed, Recovered). Hover or focus a stop for what happened; click it to open the report. It gives way to the graph after the first answer.
- **Ask:** under the timeline the pill appears with "Tap to ask about Martin's history". The first answer opens the knowledge graph across three quarters of the screen and moves the pill to the column on the right.
- **Knowledge graph:** greyscale, with entity type shown by shape (legend bottom left). What the latest answer is about, nodes and the relationships between them, is drawn in blue with labels and framed in view; everything else fades to its shape (hover for its name). An answer with nothing specific to show leaves the whole graph at normal strength.
- **Sources:** click any node for a pop-up with its details and every report it comes from: the report's kind, department and date, the quoted sentence the node was read from, and what else that report documents (click to follow). A report shows everything it documents; the patient shows all their reports.
- **Right column:** the patient (✕ goes back to the search), the pill and its status, the question it heard, the conversation as text when **Show model response** is on (with source links), and the typed fallback.

Designed for a 16:9 laptop or projector (1440×900, 1920×1080; works from 1280 wide). The look is the light version of `mockup/DESIGN.md`: Inter and Departure Mono (both SIL Open Font License, self-hosted; no font requests to Google), cool greys and one accent blue.

## Not connected yet

There is no upload or PDF parsing: the patients, graph and report excerpts are the demo data in `frontend/src/demo/data.ts`, and the four suggested questions keep scripted answers (`frontend/src/chat/script.ts`) if asked word for word. Every other question is answered by the LLM over the patient's graph (`backend/answers.py`), or gets a fallback answer when no model is configured.

The `Graph` shape is defined in `frontend/src/graph/types.ts`; `frontend/src/api.ts` is the seam to the backend (`ask` sends whatever graph is shown, and the voice functions call `backend/`). Connecting real records means filling the same `Patient`, `Graph` and `ReportSource` shapes from a backend instead of the demo file.

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

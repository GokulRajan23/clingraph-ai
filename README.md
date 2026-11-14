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

Copy `.env.example` to `.env` (git-ignored) and set `ELEVENLABS_API_KEY`. The key stays in the backend; the browser never sees it. With voice on, the chat panel is voice first: an animated orb is the microphone. Without a key, or without the backend, the orb and listen buttons are hidden and the panel is a plain typed chat.

- **The orb:** large while the conversation is empty, with suggested questions below it; after the first question it docks to a bar under the conversation. It swells with your voice while listening, stirs faster while transcribing and answering, and glows while speaking. Tap it to ask, tap again to send, tap while it speaks to stop. **Type a question instead** (or the keyboard icon in the bar) opens a text input; Esc closes it.
- **Ask by voice:** tap the orb, ask your question, and pause. Recording stops by itself after about 1.5 s of quiet (or tap **Send**; **Cancel** throws it away), is transcribed with ElevenLabs Scribe (`scribe_v3`, English) and sent as the question.
- **Answers aloud:** answers to spoken questions are read out with ElevenLabs text-to-speech (`eleven_multilingual_v2`). Every answer has a **Listen** button to play or stop it.
- **Voice:** Nathaniel C, "Calm Medical Support Agent" from the ElevenLabs Voice Library (`eIYyt1GDV2CYz5Ccyam2`), unless `ELEVENLABS_VOICE_ID` is set. If that library voice is ever withdrawn, the first voice on your account is used. The backend sends one tiny warm-up request at start, because a library voice's first request can take several seconds.
- **Why these:** chosen by benchmarking the app's own answers on 8 voices and 5 models (latency, plus a speech-to-text round trip scoring the clinical wording). All models pronounced the clinical terms clearly; `eleven_multilingual_v2` returns a full answer in about 1 s, `eleven_flash_v2_5` in about 0.5 s with plainer delivery, and `eleven_v4`/`eleven_v3` take 3.5-4 s. `scribe_v3` transcribed every test question word for word.
- The key needs access to speech-to-text and text-to-speech (and reading voices for the fallback). Each question and each spoken answer uses ElevenLabs credits.

## What v1 does

- **Reports (left):** upload one or more PDFs with the button or by dropping them anywhere on the page. Each file shows its size and a processing → processed status, and can be removed (which starts a new conversation, since the graph changes). Non-PDF files and duplicates are skipped with a notice.
- **Centre:** two tabs, **Knowledge graph** and **Clinical timeline**, with a spinner while reports are processed. The collapse button (top right) folds the whole centre panel into a narrow strip so reports and chat get the room; click the strip to bring it back. The open tab and the collapsed state are remembered in the browser.
  - **Knowledge graph:** the patient's reports, findings and their states over time, diagnoses, procedures and medications. Pan, zoom and drag nodes; click a node to highlight its neighbourhood and see its properties and source reports.
  - **Clinical timeline:** the same history on a date axis. Each report is a dashed tick labelled with its file name and date. Every finding has a lane showing how it changed at each report (New, Progressed, Stable, Improved, each with its own colour and glyph; Documented where a report mentions it without a change), followed by lanes for diagnoses, procedures and therapy (a bar per medication; ongoing ones run to the end). Hover or focus an item for its details; click it to highlight what it is connected to and open its details below. The selection is shared with the graph.
- **Chat (right):** once the graph is shown, suggested questions appear. Each answer cites its source reports and highlights the items it is about in both the graph and the timeline.

The interface uses Google Sans (SIL Open Font License), bundled through `@fontsource-variable/google-sans`, so no font requests go to Google.

The voice orb is FluidOrb from [Rare UI](https://rareui.com) by Swami Malode, adapted in `frontend/src/components/FluidOrb.tsx` (MIT + Commons Clause + Attribution; the notice is kept in that file).

## Not connected yet

PDFs never leave the browser and are not parsed: the graph is a synthetic fixture (`frontend/src/graph/fixture.ts`) whose five report nodes take the uploaded file names in upload order, and chat answers are hardcoded (`frontend/src/chat/script.ts`). Questions other than the suggested ones get a fallback answer.

Everything the UI needs goes through `frontend/src/api.ts`. Connecting PDF parsing, graph building and graph querying means replacing `processReports`, `fetchGraph`, `fetchSuggestions` and `ask`; the `Graph` shape is defined in `frontend/src/graph/types.ts`. `fetchTimeline` derives the timeline from the graph (`frontend/src/graph/timeline.ts`: report dates, observation `Change`/`Date`, procedure `Date`, medication `Started`/`Stopped`), so it follows any graph of that shape; a backend can return a `Timeline` instead as long as its node IDs match the graph's. The voice functions there already call the backend (`backend/`).

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

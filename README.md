# ClinGraph AI · v1

Upload a patient's PDF reports, explore them as a knowledge graph and ask questions about the patient's history.

## Run

Node.js 22.12 or newer. From this folder:

```powershell
.\start.ps1          # Windows
```

```bash
./start.sh           # macOS/Linux
```

Both install dependencies when needed and start the dev server at http://127.0.0.1:5173. Or run it directly:

```bash
cd frontend
npm ci
npm run dev
```

## What v1 does

- **Reports (left):** upload one or more PDFs with the button or by dropping them anywhere on the page. Each file shows its size and a processing → processed status, and can be removed (which starts a new conversation, since the graph changes). Non-PDF files and duplicates are skipped with a notice.
- **Knowledge graph (centre):** a spinner while reports are processed, then the patient's graph: reports, findings and their states over time, diagnoses, procedures and medications. Pan, zoom and drag nodes; click a node to highlight its neighbourhood and see its properties and source reports.
- **Chat (right):** once the graph is shown, suggested questions appear. Each answer cites its source reports and highlights the nodes it is about.

## Not connected yet

There is no backend in v1. PDFs never leave the browser and are not parsed: the graph is a synthetic fixture (`frontend/src/graph/fixture.ts`) whose five report nodes take the uploaded file names in upload order, and chat answers are hardcoded (`frontend/src/chat/script.ts`). Questions other than the suggested ones get a fallback answer.

Everything the UI needs goes through `frontend/src/api.ts` (`processReports`, `fetchGraph`, `ask`). Connecting PDF parsing, graph building and graph querying means replacing those three functions; the `Graph` shape is defined in `frontend/src/graph/types.ts`.

## Checks

```bash
cd frontend
npm run typecheck
npm test
npm run build
```

Design references are in `docs/`.

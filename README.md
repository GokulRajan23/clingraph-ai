# ClinGraph AI · Phase 5

Local single-patient document workspace with clinical event extraction and findings linked across reports. The development reference studio is preserved at `/reference.html`.

## Run

Python 3.12 is recommended. From this folder:

```powershell
.\start.ps1          # Windows
```

```bash
./start.sh           # macOS/Linux (macOS: brew install python@3.12)
```

Open http://127.0.0.1:8000. The first PDF downloads Docling/OCR models; allow internet access and time for CPU processing. Text uploads do not need those models. The app must run through the backend, rather than opening index.html directly.

## Implemented

- Multiple PDF/UTF-8 text uploads and drag/drop; one local synthetic patient collection.
- Durable SQLite records and original files in ignored `runtime/`.
- Queued, processing, ready and failed states; retry failed documents. Restart resumes interrupted jobs.
- Docling PDF layout/text extraction with German RapidOCR in an isolated process (10-minute conversion limit, two CPU threads). Native failures do not stop the server; failed or partial conversions remain failed.
- Original document viewer and passage selection with report ID, character offsets and PDF page/bounding-box provenance.
- Conservative detection of explicitly labelled report dates. Missing/conflicting dates need confirmation. Manual correction and timestamped history persist; event dates are separate and not inferred.
- SHA-256 duplicate detection, UTF-8 validation, 20 MB upload limit and 100-page PDF conversion limit.
- Six text sample inputs under `samples/`; development/selection/evaluation fixtures remain in `data/v1.0.0/`.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe scripts/validate_dataset.py
```

On macOS/Linux, use `.venv/bin/python` in place of `.\.venv\Scripts\python.exe`.

Files under `data/` are checked out with LF line endings on every OS (see `.gitattributes`) so the manifest checksums match. If an older Windows checkout fails validation, delete the `data` folder and run `git checkout -- data` once.

API tests use an isolated temporary store. The PDF adapter test checks API provenance plumbing, not OCR quality. Real PDF/OCR smoke checks should also run before relying on the local installation.

## Scope and provenance

This is a local, single-user, single-patient demo, bound to loopback. Phase 2 prepares source documents, Phase 4 extracts events per report and Phase 5 links them across reports; the timeline with corrections and the chat are later phases. Reference labels remain unreviewed. Offsets index Python Unicode characters into each document's canonical `text`, with an exclusive end. For PDFs, item offsets index canonical text; Docling provenance charspans index individual items and are retained separately. Bounding boxes retain Docling's coordinate origin.

Do not use held-out patients to tune prompts or choose models. Uploaded data and model caches are local and excluded from Git. Uploading does not send report text anywhere. Only the **Extract events** button does: it sends that one report's text to DeutschlandGPT.

## Extraction model (Phase 3 decision)

Clinical extraction uses **DeutschlandGPT** (`claude-sonnet-5`, OpenAI-compatible API at `https://api.deutschlandgpt.de/v2`). It was chosen over local Qwen 3.5 4B after the Phase 3 benchmark (`benchmark/scorecard.md`): it labels events more accurately and runs about twice as fast. Extraction therefore sends report text to DeutschlandGPT. **Use synthetic reports only** until a data processing agreement and legal review (GDPR Art. 9, §203 StGB) are in place.

Put the API key in a git-ignored `.env` file in this folder (`DEUTSCHLANDGPT_API_KEY=...`) or set it as an environment variable. Never commit it. API calls use paid credits, so run the benchmark sparingly:

```bash
.venv/bin/python scripts/benchmark_extraction.py --split model_selection --backend deutschlandgpt --model claude-sonnet-5
```

## Clinical event extraction (Phase 4)

Select a processed report and click **Extract events** (`POST /api/documents/{id}/extract`). Extraction never starts automatically, because each request sends report text to DeutschlandGPT and uses credits.

- The model proposes events (concept, category, assertion, change, event date, cited segment and quote) using prompt `v2`, the prompt frozen in Phase 3. Pydantic validates them against the schema.
- Code checks that each quote is an exact passage of the cited segment and computes character offsets and the PDF page/box itself. Proposals that fail are rejected, listed with a reason and never shown as events. Clicking an event highlights its passage.
- An event date that is not written in the cited passage is flagged for review. Flags never change the model's output. All events are `unreviewed`.
- Each extraction records the model, prompt version, settings, endpoint, text SHA-256, time and latency. A result for unchanged text, model and prompt is reused without an API call.
- Failures (missing key, HTTP errors, unreachable API, invalid output, reports over 40,000 characters) are shown on the document with a retry button. Error messages and logs never contain report text. A restart marks unfinished extractions as interrupted instead of resuming them.
- Report dates are read from the document, so date corrections apply to extracted events. "First documented" means first documented *in this report*; Phase 5 decides it across reports.

Check the pipeline against labelled examples (one API call per report; 8 calls for both splits):

```bash
.venv/bin/python scripts/evaluate_pipeline.py --split development --reports D01   # smoke test
.venv/bin/python scripts/evaluate_pipeline.py --split development
.venv/bin/python scripts/evaluate_pipeline.py --split model_selection
```

Results (2026-11-13): F1 1.00 on both splits (17 and 4 events), no serious errors, no rejected proposals, and the same category errors as Phase 3. Details and deferred items, including the clinician-reviewed German rule layer and section handling: `benchmark/phase4_pipeline.md`.

## Findings across reports (Phase 5)

After extraction, the **Findings across reports** panel groups observations of the same finding and shows how each one is linked (`GET /api/findings`). Linking uses fixed rules, not a language model, so it costs no credits and gives the same result every time.

- Side, comparison dates and measurements are read from the German evidence quote, not from the model's English label. Measurements are shown but never decide identity or change.
- **Explicit comparison:** a quote such as "gegenüber dem CT vom 05.02.2024" links to the matching observation in the report with that date, even if a newer report exists.
- **Candidate link:** otherwise, the most recent earlier observation with the same normalised label and side. Always marked *needs review*.
- A comparison with a study that is not uploaded is shown as unresolved, never linked to the nearest report. Undated reports are never ordered by filename.
- "First documented" is recomputed per finding across the collection and marked uncertain when an undated report also mentions it. First documented ≠ onset.
- Observations, findings and links are derived database tables. They are rebuilt after every extraction, date correction and restart. Observation IDs are keyed to report and evidence offsets.
- A workspace holds **one patient**. Try the linking patient in an empty workspace (`samples/linking/L01–L05.txt`, built by `scripts/build_linking_fixture.py`); do not mix it with `samples/D01–D06`.

Check it without API calls (pipeline mode uses saved Phase 4 runs):

```bash
.venv/bin/python scripts/evaluate_linking.py --split linking_check --source reference
.venv/bin/python scripts/evaluate_linking.py --split linking_check --source pipeline
```

Results (2026-11-13): on reference events, all links on all three splits (7/7, 1/1, 8/8) with no wrong merges. On real extractions of the linking patient, 5 of 8 links: all found links correct, no wrong merges, but candidate links were missed where the model worded the same finding differently. Details: `benchmark/phase5_linking.md`.

Official converter/provenance reference: https://docling-project.github.io/docling/reference/document_converter/

## Current verification

Twenty-five tests pass (14 ingestion and Phase 3 scoring tests, 5 Phase 4 extraction tests and 6 Phase 5 linking tests, all without network access), along with the Phase 1 dataset consistency checks and `pip check`. Browser interaction checks passed for text upload, report-date detection/correction and original-text display. Phase 4 browser checks (extract, evidence highlight, rejected proposals, date flag, 390 px width) passed with a fake extractor, as did the Phase 5 findings panel (links, review flags, unresolved comparison, opening evidence, 390 px width).

Real PDF/OCR smoke verification remains outstanding: the first model download hit a native allocation failure on this machine. A lower-memory retry was stopped when available system memory remained low. The converter now uses streamed model downloads, two CPU threads and an isolated child process. After freeing memory, run `.\.venv\Scripts\python.exe scripts/smoke_pdf.py` to test a digital PDF and an image-only PDF. Do not treat the API adapter tests as proof of successful OCR.

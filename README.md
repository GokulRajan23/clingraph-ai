# ClinGraph AI · Phase 2

Local single-patient document ingestion workspace. The development reference studio is preserved at `/reference.html`.

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

This is a local, single-user, single-patient demo, bound to loopback. Phase 2 prepares source documents; clinical extraction, longitudinal linking and chat are later phases. Reference labels remain unreviewed. Offsets index Python Unicode characters into each document's canonical `text`, with an exclusive end. For PDFs, item offsets index canonical text; Docling provenance charspans index individual items and are retained separately. Bounding boxes retain Docling's coordinate origin.

Do not use held-out patients to tune prompts or choose models. Uploaded data and model caches are local and excluded from Git. Uploading to this workspace does not send report text to a hosted language model.


Official converter/provenance reference: https://docling-project.github.io/docling/reference/document_converter/

## Current verification

Eight API tests pass, along with the Phase 1 dataset consistency checks and `pip check`. Browser interaction checks passed for text upload, report-date detection/correction and original-text display. Screenshot capture was unavailable.

Real PDF/OCR smoke verification remains outstanding: the first model download hit a native allocation failure on this machine. A lower-memory retry was stopped when available system memory remained low. The converter now uses streamed model downloads, two CPU threads and an isolated child process. After freeing memory, run `.\.venv\Scripts\python.exe scripts/smoke_pdf.py` to test a digital PDF and an image-only PDF. Do not treat the API adapter tests as proof of successful OCR.

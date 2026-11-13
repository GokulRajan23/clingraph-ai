"""Phase 4 check: run the app's extraction pipeline (upload segmentation -> DeutschlandGPT -> evidence
verification) on a labelled split and score it with the Phase 3 rules. Uses paid API credits: one call per report.

  .venv/bin/python scripts/evaluate_pipeline.py --split development --reports D01   # smoke test, prints only
  .venv/bin/python scripts/evaluate_pipeline.py --split model_selection
"""
import argparse
import json
import os
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
# Importing app.main opens a document store; keep it away from runtime/.
os.environ["CLINGRAPH_DATA_DIR"] = tempfile.mkdtemp(prefix="clingraph-eval-")
from app.extraction.deutschlandgpt import DeutschlandGPTExtractor  # noqa: E402
from app.extraction.models import ExtractedEvent  # noqa: E402
from app.extraction.prompt import PROMPT_VERSION, SETTINGS  # noqa: E402
from app.extraction.scoring import ALLOWED_SPLITS, coverage, load_split, score_run  # noqa: E402
from app.extraction.service import report_input, verify  # noqa: E402
from app.main import text_segments  # noqa: E402


def as_upload(report):
    """The document the app would hold after uploading this report as samples/<id>.txt."""
    header = f"Berichtsdatum: {report['report_date']}\n" if report["report_date"] else ""  # D05 has no date
    text = header + report["text"]
    spans = []
    for sentence in report["sentences"]:
        start = len(header) + report["text"].index(sentence["text"])
        spans.append((sentence["id"], start, start + len(sentence["text"])))
    return {"id": report["id"], "text": text, "segments": text_segments(text)}, spans


def to_reference_ids(events, spans):
    """Map verified events to the reference sentence that contains their evidence span (by offsets)."""
    mapped = []
    for e in events:
        ev = e["evidence"]
        sentence_id = next((sid for sid, s, t in spans if s <= ev["start"] and ev["end"] <= t), f"none:{ev['segment_id']}")
        mapped.append(ExtractedEvent(concept=e["concept"], category=e["category"], assertion=e["assertion"],
                                     change=e["change"], event_date=e["event_date"], sentence_id=sentence_id,
                                     quote=ev["quote"]))
    return mapped


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--split", required=True, choices=ALLOWED_SPLITS)
    parser.add_argument("--reports", nargs="*", help="Only these report ids (smoke test; no results file).")
    args = parser.parse_args()
    reports, references = load_split(args.split)
    if args.reports:
        reports = [r for r in reports if r["id"] in args.reports]
        references = [e for e in references if e["report_id"] in args.reports]
    extractor = DeutschlandGPTExtractor()
    predictions, invalid, per_report = {}, [], []
    for report in reports:
        document, spans = as_upload(report)
        started = time.perf_counter()
        try:
            events, rejected = verify(document, extractor.extract(report_input(document)))
        except Exception as exc:  # counted like a schema-invalid output in Phase 3
            events, rejected = [], []
            invalid.append({"report_id": report["id"], "error": f"{type(exc).__name__}: {str(exc)[:200]}"})
        latency = round(time.perf_counter() - started, 2)
        predictions[report["id"]] = to_reference_ids(events, spans)
        refs = {e["evidence"]["sentence_id"]: e for e in references if e["report_id"] == report["id"]}
        flagged = [{"event": e["id"], "event_date": e["event_date"],
                    "reference_event_date": (refs.get(p.sentence_id) or {}).get("event_date"),
                    "date_wrong": e["event_date"] != (refs.get(p.sentence_id) or {}).get("event_date")}
                   for e, p in zip(events, predictions[report["id"]]) if e["flags"]]
        per_report.append({"report_id": report["id"], "latency_s": latency, "events": events,
                           "rejected": rejected, "flagged": flagged})
        print(f"{report['id']}: {len(events)} events, {len(rejected)} rejected, {len(flagged)} flagged, {latency}s", flush=True)

    scores = score_run(reports, references, predictions, invalid)
    summary = {
        "reports": len(reports), "references": scores["references"], "accepted_events": scores["predictions"],
        "rejected_proposals": sum(len(r["rejected"]) for r in per_report),
        "flagged_events": sum(len(r["flagged"]) for r in per_report),
        "flagged_with_wrong_date": sum(f["date_wrong"] for r in per_report for f in r["flagged"]),
        **{k: scores[k] for k in ("precision", "recall", "f1", "field_accuracy", "evidence_supported")},
        "serious_errors": scores["serious_errors"], "schema_invalid_reports": invalid,
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    if args.reports:
        return
    result = {"pipeline": "phase4", "model": extractor.model, **extractor.info(), "split": args.split,
              "prompt_version": PROMPT_VERSION, "settings": SETTINGS,
              "created_at": datetime.now().isoformat(timespec="seconds"), "coverage": coverage(references),
              "summary": summary, "concept_pairs": scores["concept_pairs"], "reports": per_report}
    out = ROOT / "benchmark" / "results" / f"{datetime.now():%Y%m%d-%H%M%S}_pipeline_{args.split}.json"
    out.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

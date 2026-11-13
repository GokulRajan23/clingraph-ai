"""Split loading, matching and scoring for the Phase 3 benchmark (rules: benchmark/matching_rules.md)."""
import json
from collections import Counter
from pathlib import Path

from app.extraction.models import ExtractedEvent

DATA = Path(__file__).resolve().parents[2] / "data" / "v1.0.0"
ALLOWED_SPLITS = ("development", "model_selection")
FIELDS = ("category", "assertion", "change", "event_date")


def load_split(split):
    """Return (reports, reference events) for a benchmark split. The held-out split is refused."""
    if split not in ALLOWED_SPLITS:
        raise ValueError(f"Split {split!r} is not available to the benchmark.")
    patients = set(json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))["splits"][split])
    reports = [r for r in json.loads((DATA / "reports.json").read_text(encoding="utf-8")) if r["patient_id"] in patients]
    events = [e for e in json.loads((DATA / "events.json").read_text(encoding="utf-8")) if e["patient_id"] in patients]
    return reports, events


def evidence_offsets(report, prediction):
    """Offsets of the quote inside the cited sentence, or None when the sentence does not contain it."""
    sentence = next((s["text"] for s in report["sentences"] if s["id"] == prediction.sentence_id), None)
    if not sentence or not prediction.quote or prediction.quote not in sentence:
        return None
    start = report["text"].index(sentence) + sentence.index(prediction.quote)
    return start, start + len(prediction.quote)


def score_run(reports, references, predictions, invalid_reports=()):
    """predictions: {report_id: [ExtractedEvent]}. Returns metrics, serious errors and concept pairs."""
    by_id = {r["id"]: r for r in reports}
    matched, false_positives, serious, concepts = [], 0, [], []
    supported = total_predictions = 0
    for report_id, preds in predictions.items():
        report = by_id[report_id]
        refs = {e["evidence"]["sentence_id"]: e for e in references if e["report_id"] == report_id}
        total_predictions += len(preds)
        supported += sum(evidence_offsets(report, p) is not None for p in preds)
        taken = set()
        # Prefer a prediction whose assertion agrees with the reference; the rest are duplicates.
        ordered = sorted(preds, key=lambda p: p.sentence_id not in refs or p.assertion != refs[p.sentence_id]["assertion"])
        for p in ordered:
            ref = refs.get(p.sentence_id)
            if ref is None or p.sentence_id in taken:
                false_positives += 1
                continue
            taken.add(p.sentence_id)
            matched.append((p, ref))
            concepts.append({"reference": ref["concept"], "predicted": p.concept, "sentence_id": p.sentence_id})
            serious += serious_errors(p, ref)
    n_refs, n_matched = len(references), len(matched)
    precision = n_matched / total_predictions if total_predictions else 0.0
    recall = n_matched / n_refs if n_refs else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    accuracy = {f: (sum(_value(p, f) == ref[f] for p, ref in matched) / n_matched if n_matched else None) for f in FIELDS}
    return {
        "precision": precision, "recall": recall, "f1": f1,
        "predictions": total_predictions, "matched": n_matched, "false_positives": false_positives,
        "references": n_refs, "field_accuracy": accuracy,
        "evidence_supported": supported / total_predictions if total_predictions else None,
        "schema_invalid_reports": list(invalid_reports),
        "serious_errors": serious, "concept_pairs": concepts,
    }


def serious_errors(p, ref):
    errors, where = [], {"sentence_id": p.sentence_id}
    predicted_date = _value(p, "event_date")
    if {p.assertion, ref["assertion"]} == {"present", "absent"}:
        errors.append({"type": "negation_flip", **where, "predicted": p.assertion, "reference": ref["assertion"]})
    # A copied report date is the more specific error, so it is not also counted as invented.
    if predicted_date is not None and predicted_date == ref["report_date"] and ref["event_date"] != ref["report_date"]:
        errors.append({"type": "report_date_as_event_date", **where, "predicted": predicted_date})
    elif ref["event_date"] is None and predicted_date is not None:
        errors.append({"type": "invented_event_date", **where, "predicted": predicted_date})
    if p.change in ("progressed", "improved", "stable") and p.change != ref["change"]:
        errors.append({"type": "unsupported_change", **where, "predicted": p.change, "reference": ref["change"]})
    return errors


def coverage(references):
    """Reference counts per label value; values with fewer than 2 examples are flagged."""
    counts = {f: Counter(e[f] for e in references) for f in ("category", "assertion", "change")}
    counts["event_date"] = Counter("explicit" if e["event_date"] else "none" for e in references)
    thin = sorted(f"{f}={v}" for f, c in counts.items() for v, n in c.items() if n < 2)
    return {"counts": {f: dict(c) for f, c in counts.items()}, "fewer_than_2": thin,
            "not_labelled": ["abbreviations", "units", "anatomy", "cross-date comparisons"]}


def _value(prediction: ExtractedEvent, field):
    value = getattr(prediction, field)
    return value.isoformat() if field == "event_date" and value else value

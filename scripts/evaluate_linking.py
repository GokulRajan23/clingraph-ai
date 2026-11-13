"""Phase 5 check: run the rule-based linker on a labelled split and score it against reference links. No API calls.

  --source reference  links the reference events (tests the rules alone)
  --source pipeline   links the events from the latest saved Phase 4 run of scripts/evaluate_pipeline.py

  .venv/bin/python scripts/evaluate_linking.py --split linking_check --source pipeline
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))
from app.extraction.scoring import ALLOWED_SPLITS, load_links, load_split  # noqa: E402
from app.linking import build, observation  # noqa: E402
from evaluate_pipeline import as_upload  # noqa: E402


def reference_observations(reports, references):
    by_id = {r["id"]: r for r in reports}
    pairs = []
    for e in references:
        report = by_id[e["report_id"]]
        o = observation({"id": report["id"], "report_date": report["report_date"], "filename": report["id"]}, e, report["patient_id"])
        pairs.append((o, e["id"]))
    return pairs


def pipeline_observations(split, reports, references, run=None):
    """Observations from a saved Phase 4 run (default: the latest for the split), paired with reference ids."""
    runs = [run] if run else sorted((ROOT / "benchmark" / "results").glob(f"*_pipeline_{split}.json"))
    if not runs:
        raise SystemExit(f"No saved Phase 4 run for {split}. Run scripts/evaluate_pipeline.py --split {split} first.")
    saved = json.loads(runs[-1].read_text(encoding="utf-8"))
    by_sentence = {e["evidence"]["sentence_id"]: e["id"] for e in references}
    pairs = []
    for report in reports:
        _, spans = as_upload(report)
        events = next(r["events"] for r in saved["reports"] if r["report_id"] == report["id"])
        for e in events:
            ev = e["evidence"]
            sentence = next((sid for sid, s, t in spans if s <= ev["start"] and ev["end"] <= t), None)
            o = observation({"id": report["id"], "report_date": report["report_date"], "filename": report["id"]}, e, report["patient_id"])
            pairs.append((o, by_sentence.get(sentence)))
    return pairs, runs[-1].name


def score(pairs, references, reference_links, reference_unresolved):
    result = build([o for o, _ in pairs])
    links, unresolved, findings = result["links"], result["unresolved"], result["findings"]
    to_ref = {o["id"]: ref for o, (_, ref) in zip(result["observations"], pairs)}
    chain = {e["id"]: e["chain_id"] for e in references}
    expected = {(x["from_event"], x["to_event"]): x for x in reference_links}
    matched, false_positive, wrong_merges, details = {}, [], [], []
    for link in links:
        pair = (to_ref.get(link["from_observation"]), to_ref.get(link["to_observation"]))
        ref = expected.get(pair)
        details.append({**link, "reference_pair": pair, "matched": ref is not None and pair not in matched})
        if ref is not None and pair not in matched:
            matched[pair] = (link, ref)
        else:
            false_positive.append(pair)
        a, b = (chain.get(x) if x else None for x in pair)
        if a is None or a != b:
            wrong_merges.append({"pair": pair, "review_required": link["review_required"], "basis": link["basis"]})
    agree = {f: sum(link[f] == ref[f] for link, ref in matched.values()) for f in ("relationship", "review_required", "comparison_date")}
    predicted_unresolved = {(to_ref.get(u["observation"]), u["comparison_date"]) for u in unresolved}
    expected_unresolved = {(u["event_id"], u["comparison_date"]) for u in reference_unresolved}
    reference_chains = {}
    for e in references:
        if e["chain_id"]:
            reference_chains.setdefault(e["chain_id"], set()).add(e["id"])
    predicted_chains = [{to_ref.get(o) for o in f["observations"]} for f in findings]
    rebuilt = sorted(c for c, members in reference_chains.items() if members in predicted_chains)
    n = len(links)
    return {
        "observations": len(pairs), "unmapped_observations": sum(ref is None for _, ref in pairs),
        "reference_links": len(expected), "predicted_links": n, "matched_links": len(matched),
        "precision": len(matched) / n if n else None, "recall": len(matched) / len(expected) if expected else None,
        "agreement_on_matched": agree, "missed_links": sorted(set(expected) - set(matched)),
        "extra_links": false_positive, "wrong_merges": wrong_merges,
        "unresolved": {"expected": sorted(expected_unresolved), "predicted": sorted(predicted_unresolved, key=str),
                       "matched": len(expected_unresolved & predicted_unresolved)},
        "chains_rebuilt": f"{len(rebuilt)}/{len(reference_chains)}", "chains_rebuilt_ids": rebuilt,
    }, details, findings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--split", required=True, choices=ALLOWED_SPLITS)
    parser.add_argument("--source", required=True, choices=["reference", "pipeline"])
    args = parser.parse_args()
    reports, references = load_split(args.split)
    reference_links, reference_unresolved = load_links(args.split)
    source_file = None
    if args.source == "reference":
        pairs = reference_observations(reports, references)
    else:
        pairs, source_file = pipeline_observations(args.split, reports, references)
    summary, details, findings = score(pairs, references, reference_links, reference_unresolved)
    print(json.dumps(summary, indent=2, ensure_ascii=False, default=list))
    out = ROOT / "benchmark" / "results" / f"{datetime.now():%Y%m%d-%H%M%S}_linking_{args.split}_{args.source}.json"
    out.write_text(json.dumps({"split": args.split, "source": args.source, "pipeline_results": source_file,
                               "created_at": datetime.now().isoformat(timespec="seconds"), "summary": summary,
                               "links": details, "findings": findings}, indent=2, ensure_ascii=False, default=list), encoding="utf-8")
    print(f"Wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

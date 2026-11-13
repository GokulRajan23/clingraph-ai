"""Phase 6 check: repair the SYN-004 chains that Phase 5 missed, with label corrections only. No API calls.

The saved Phase 4 extraction of the linking patient is linked twice with the app's own code: as extracted,
and after three concept corrections that a reviewer would make in the timeline, applied through
app.corrections (the overlay the app uses). This shows that corrections reach the linker. It does not show
that the linker improved: the corrections were chosen after seeing the Phase 5 misses.

  .venv/bin/python scripts/repair_linking_check.py           # prints only
  .venv/bin/python scripts/repair_linking_check.py --save    # also writes benchmark/results/
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))
from app.corrections import apply  # noqa: E402
from app.extraction.scoring import load_links, load_split  # noqa: E402
from app.linking import assign_ids  # noqa: E402
from evaluate_linking import pipeline_observations, score  # noqa: E402

SPLIT = "linking_check"
RUN = ROOT / "benchmark" / "results" / "20261113-201612_pipeline_linking_check.json"
# (observation id, quote the correction was made against, extracted concept, corrected concept).
# Each renames a finding to the wording an earlier report of the same chain already uses.
CORRECTIONS = [
    ("L02:26-95", "Die bekannte Läsion im rechten Leberlappen misst sonographisch 15 mm.",
     "Right hepatic lobe lesion", "Hypodense lesion in right liver lobe"),
    ("L02:96-139", "Neu zeigt sich wenig Aszites perihepatisch.", "Perihepatic ascites", "Ascites"),
    ("L03:267-351", "Ein Gallengangsstent liegt regelrecht in situ; das Einlagedatum ist nicht angegeben.",
     "Bile duct stent", "Biliary stent"),
]
# Renaming the earlier report instead (L01 to L02's wording) is checked to show that direction matters.
REVERSE = [("L01:26-94", "Im rechten Leberlappen zeigt sich eine 14 mm große hypodense Läsion.",
            "Hypodense lesion in right liver lobe", "Right hepatic lobe lesion")] + CORRECTIONS[1:]


def entries(corrections):
    return [{"id": f"c{n}", "observation_id": oid, "action": "edit", "changes": {"concept": new},
             "previous": {"concept": old}, "target": {"quote": quote}}
            for n, (oid, quote, old, new) in enumerate(corrections, 1)]


def corrected(pairs, log):
    """Pairs with the log applied; the reference ids follow their observations."""
    observations = assign_ids([o for o, _ in pairs])
    active, rejected, log = apply(observations, log)
    assert not rejected and len(active) == len(pairs), "this check only edits concepts"
    return list(zip(active, [ref for _, ref in pairs])), log


def brief(summary):
    keys = ("reference_links", "predicted_links", "matched_links", "precision", "recall", "missed_links",
            "extra_links", "wrong_merges", "chains_rebuilt")
    return {**{k: summary[k] for k in keys}, "unresolved_matched": summary["unresolved"]["matched"],
            "unresolved_predicted": summary["unresolved"]["predicted"]}


def run(path=RUN):
    reports, references = load_split(SPLIT)
    reference_links, reference_unresolved = load_links(SPLIT)
    pairs, source = pipeline_observations(SPLIT, reports, references, Path(path))
    before, _, _ = score(pairs, references, reference_links, reference_unresolved)
    repaired, log = corrected(pairs, entries(CORRECTIONS))
    after, details, findings = score(repaired, references, reference_links, reference_unresolved)
    reverse_pairs, reverse_log = corrected(pairs, entries(REVERSE))
    reverse, _, _ = score(reverse_pairs, references, reference_links, reference_unresolved)
    return {"split": SPLIT, "pipeline_results": source, "corrections": log, "before": brief(before),
            "after": brief(after), "stale_corrections": sum(e["stale"] for e in log),
            "reverse_direction": {"corrections": reverse_log, "summary": brief(reverse)},
            "links": details, "findings": findings}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", default=str(RUN), help="Saved Phase 4 run (default: the pinned SYN-004 run).")
    parser.add_argument("--save", action="store_true", help="Write the result to benchmark/results/.")
    args = parser.parse_args()
    result = run(args.run)
    for name in ("before", "after"):
        print(name, json.dumps(result[name], ensure_ascii=False, default=list))
    print("stale corrections:", result["stale_corrections"])
    print("reverse direction", json.dumps(result["reverse_direction"]["summary"], ensure_ascii=False, default=list))
    if args.save:
        out = ROOT / "benchmark" / "results" / f"{datetime.now():%Y%m%d-%H%M%S}_corrections_{SPLIT}.json"
        out.write_text(json.dumps({**result, "created_at": datetime.now().isoformat(timespec="seconds")},
                                  indent=2, ensure_ascii=False, default=list), encoding="utf-8")
        print(f"Wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

"""Phase 3 extraction benchmark: local Ollama or hosted DeutschlandGPT, same prompt and scoring.

  .venv/bin/python scripts/benchmark_extraction.py --split development --coverage
  .venv/bin/python scripts/benchmark_extraction.py --split model_selection --model qwen3.5:4b --think false
  .venv/bin/python scripts/benchmark_extraction.py --split model_selection --backend deutschlandgpt --model <model>
"""
import argparse
import json
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.extraction.prompt import PROMPT_VERSION, SETTINGS  # noqa: E402
from app.extraction.scoring import ALLOWED_SPLITS, coverage, load_split, score_run  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--split", required=True, choices=ALLOWED_SPLITS)
    parser.add_argument("--model")
    parser.add_argument("--backend", choices=["ollama", "deutschlandgpt"], default="ollama")
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--think", choices=["true", "false"], help="Only for models that support thinking.")
    parser.add_argument("--coverage", action="store_true", help="Print reference coverage and exit.")
    args = parser.parse_args()
    reports, references = load_split(args.split)
    if args.coverage or not args.model:
        print(json.dumps(coverage(references), indent=2))
        return

    if args.backend == "ollama":
        from app.extraction.ollama import OllamaExtractor
        extractor = OllamaExtractor(args.model, think=None if args.think is None else args.think == "true")
    else:
        from app.extraction.deutschlandgpt import DeutschlandGPTExtractor
        extractor = DeutschlandGPTExtractor(args.model)
    runs = []
    for run in range(1, args.runs + 1):
        predictions, invalid, latency, raw = {}, [], {}, {}
        for report in reports:
            started = time.perf_counter()
            try:
                predictions[report["id"]] = extractor.extract(report)
            except Exception as exc:  # invalid JSON or schema violation counts against the model
                predictions[report["id"]] = []
                invalid.append({"report_id": report["id"], "error": str(exc)[:300]})
            latency[report["id"]] = round(time.perf_counter() - started, 2)
            raw[report["id"]] = [p.model_dump(mode="json") for p in predictions[report["id"]]]
        scores = score_run(reports, references, predictions, invalid)
        runs.append({"run": run, "scores": scores, "latency_s": latency, "predictions": raw})
        print(f"run {run}: P={scores['precision']:.2f} R={scores['recall']:.2f} F1={scores['f1']:.2f} "
              f"serious={len(scores['serious_errors'])} invalid={len(invalid)}", flush=True)

    summary = {k: _spread([r["scores"][k] for r in runs]) for k in ("precision", "recall", "f1")}
    summary["serious_errors"] = _spread([len(r["scores"]["serious_errors"]) for r in runs])
    summary["latency_s_per_report"] = _spread([statistics.mean(r["latency_s"].values()) for r in runs])
    result = {
        "model": args.model, **extractor.info(), "split": args.split,
        "prompt_version": PROMPT_VERSION, "settings": {**SETTINGS, "think": args.think},
        "created_at": datetime.now().isoformat(timespec="seconds"), "coverage": coverage(references),
        "summary": summary, "runs": runs,
    }
    out = ROOT / "benchmark" / "results" / f"{datetime.now():%Y%m%d-%H%M%S}_{args.model.replace(':', '-')}_{args.split}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(f"Wrote {out.relative_to(ROOT)}")


def _spread(values):
    return {"mean": round(statistics.mean(values), 3), "min": round(min(values), 3), "max": round(max(values), 3)}


if __name__ == "__main__":
    main()

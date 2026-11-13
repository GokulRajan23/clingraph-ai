# Phase 5 — linking check

**Preliminary technical check, not clinical validation.** Labels are hand-authored and not clinician-reviewed.

The linker (`app/linking.py`) uses fixed rules and no language model. It reads side, comparison dates and measurements from the German evidence quote verified in Phase 4, not from the model's English label.
- **Explicit link:** the quote states a comparison date, and the report with that date has an observation of the same finding on the same side.
- **Candidate link:** the most recent earlier observation with the same normalised label and side. Always flagged for review.

Script: `scripts/evaluate_linking.py`. No API calls; it reads saved Phase 4 runs.

## Data
- **Development (SYN-001):** 6 reports, 7 reference links. The rules were designed with this split visible.
- **Model selection (SYN-002):** 2 reports, 1 link.
- **Linking check (SYN-004, `data/linking-v1/`):** 5 reports, 14 events, 8 links, 1 unresolved comparison. Written on 2026-11-13 after the rules were specified and before any run, by the same author as the rules, so it is not an independent test.
  - Traps: a comparison with a report that is not the most recent; a comparison with an MRT that was never uploaded; an undated report; a device across three reports; a right lesion vs a left absent "new lesion" and a left cyst; a 14 → 15 mm change without a stated comparison.
- **Final evaluation:** not loaded.

## Results

| Split | Source | Links found / reference | Precision | Wrong merges | Unresolved found | Chains rebuilt |
|---|---|---|---|---|---|---|
| Development | reference events | 7 / 7 | 7 / 7 | 0 | – | 4 / 4 |
| Development | Phase 4 extraction | 7 / 7 | 7 / 7 | 0 | – | 4 / 4 |
| Model selection | reference events | 1 / 1 | 1 / 1 | 0 | – | 2 / 2 |
| Model selection | Phase 4 extraction | 1 / 1 | 1 / 1 | 0 | – | 2 / 2 |
| Linking check | reference events | 8 / 8 | 8 / 8 | 0 | 1 / 1 | 4 / 4 |
| Linking check | Phase 4 extraction | **5 / 8** | 5 / 5 | 0 | 1 / 1 | **1 / 4** |

For every matched link, relationship, review flag and comparison date agree with the reference. Results files: `results/20261113-2006*_linking_*.json` and `results/20261113-201612_linking_linking_check_pipeline.json`. The SYN-004 extraction itself is in `results/20261113-201612_pipeline_linking_check.json` (Phase 4 scores: F1 1.00, no serious errors).

## What the linking check shows
- **Explicit comparisons work on real extractions.** Both SYN-004 explicit links were found, including the comparison that skips the more recent report. The comparison with the uploaded-nowhere MRT is reported as unresolved instead of being linked to the nearest report.
- **Candidate links miss when the model words the same finding differently.**
  - All three misses are candidate links, e.g. "Hypodense lesion in right liver lobe" vs "Right hepatic lobe lesion", "Ascites" vs "Perihepatic ascites", "Biliary stent" vs "Bile duct stent".
  - The model's wording also changed between two runs at temperature 0. The first run's files were deleted by mistake (see below), and both runs found 5 of 8, but different stent links were missed.
  - The misses are not wrong links: precision stayed at 5/5 and nothing unrelated was merged. But it means extra review work and chains split into pieces.
- **The side check matters.** In the second run the model labelled "Im linken Leberlappen keine neue Läsion" as "Left hepatic lobe lesion", dropping "new". Only the side read from the German quote kept it out of the right-lesion chain.

## Changes made after seeing results
- After the first reference-event run on SYN-004, one rule was corrected: an explicit comparison of a finding without a side (ascites) was flagged for review. The rule is now "review when the side is known on one end only". The SYN-004 label, written beforehand, already expected no review. The plan was updated to say this.
- The candidate-link rule was **not** tuned on the SYN-004 extraction results, so the 5/8 above is the honest number for the rules as specified.

## Record-keeping note
The first SYN-004 extraction run (5 API calls) produced the same 5/8. Its results file was deleted by an over-broad cleanup command before commit. With the user's approval the extraction was run once more; only the second run's files are kept.

## Gaps and next steps
- **Label wording:** candidate matching needs a finding identity that does not depend on the model's English wording. Options:
  - match on German head terms from the quote (Läsion, Aszites, Gallengangsstent); this is a small terminology layer that would need review;
  - add a normalised finding field to the prompt, which needs a new prompt version and a re-benchmark (credits).
  Either one needs fresh linking data to measure, because SYN-004 has now been used.
- A related absent observation before a "new" finding (D01 "Keine Pleuraergüsse" before D02 "Neu … Pleuraerguss") is not linked, because no side is stated. Onset bounds are therefore not shown.
- Run-to-run spread for linking on real extractions: 2 runs, same score, different misses.

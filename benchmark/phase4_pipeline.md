# Phase 4 — extraction pipeline check

**Preliminary technical check, not clinical validation.** Reference labels are hand-authored and not clinician-reviewed.

What was checked: the app's own path. Each report is built as the uploaded `samples/<id>.txt` would be (header line + text, same line segmentation as upload). It is sent to DeutschlandGPT `claude-sonnet-5` with prompt `v2` (frozen, unchanged from Phase 3), and every proposal goes through evidence verification (`app/extraction/service.py`). Verified events are mapped to reference sentences by character offsets, because upload segment ids are shifted by the date line, and then scored with the Phase 3 rules (`matching_rules.md`). Script: `scripts/evaluate_pipeline.py`. One run per split (2026-11-13), plus one smoke call on D01.

| | Development (SYN-001) | Model selection (SYN-002) |
|---|---|---|
| Reports / reference events | 6 / 17 | 2 / 4 |
| Proposals rejected by evidence verification | 0 | 0 |
| Displayed events / matched | 17 / 17 | 4 / 4 |
| Precision / recall / F1 | 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 |
| Category / assertion / change / event-date accuracy | 0.94 / 1.00 / 1.00 / 1.00 | 0.50 / 1.00 / 1.00 / 1.00 |
| Evidence quote supported | 17 / 17 | 4 / 4 |
| Serious errors | 0 | 0 |
| `event_date_not_in_evidence` flags | 0 | 0 |
| Latency per report | 3.3–5.0 s | 4.7–5.8 s |

Sources: `results/20261113-194044_pipeline_development.json`, `results/20261113-194055_pipeline_model_selection.json`.

Negation and uncertainty are covered only by the development split: 5 absent, 2 suspected, 1 historical, 1 unknown/pending and 2 contradictory (`unclear`) events, all labelled correctly. The model-selection split has 1 absent event and none of the others.

## Errors and review notes
- Category errors are the same as in Phase 3: D01:s2 (inconsistent reference label) and hydronephrosis labelled `finding` in M02 (not among the prompt's complication examples). Prompt `v2` was not changed, because a new prompt would need a new benchmark.
- Concept wording (human review, not scored): six wording or granularity differences, such as "Pneumothorax" vs "Post-procedure pneumothorax". In D05:s1 the model wrote "Pleural puncture" where the reference says "Right pleural puncture". The cited sentence states no side, so the model is closer to the text.
- The date flag fired 0 times, and no event date was wrong, so its usefulness is not measured yet. In the offline check with reference events it also fired 0 times, so it raised no false alarms there.

## Deferred, with reasons
- **Clinician-reviewed German terminology and rule layer** (abbreviations, synonyms, negation, uncertainty, anatomy, units): no clinician reviewer is available. The model already scores 1.00 on negation and uncertainty here, so no rule could show an improvement on this data. Revisit with a larger, reviewed dataset.
- **Section handling** (e.g. *Fragestellung* or *Anamnese* text read as findings): the dataset has no section-labelled examples, so it cannot be evaluated yet. Only D06 has a *Beurteilung:* prefix.
- **Run-to-run spread**: one run per split, to save credits. Phase 3 found 3 identical runs at temperature 0. The API ignores `seed`.
- The final-evaluation split was not loaded.

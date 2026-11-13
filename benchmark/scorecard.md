# Phase 3 scorecard — extraction model comparison

**Preliminary technical benchmark, not clinical validation.** Reference labels are hand-authored and not clinician-reviewed.

**Decision (team, 2026-11-13):** use Claude Sonnet 5 via DeutschlandGPT for extraction. The benchmark below is the evidence; the decision was made by the team.

Prompt `v2` (frozen), identical schema and scoring for both models. Rules: `matching_rules.md`.

## Model-selection split (SYN-002: 2 reports, 4 reference events, 3 runs each)

| | Qwen 3.5 4B (local, Ollama) | Claude Sonnet 5 (DeutschlandGPT) |
|---|---|---|
| Precision / recall / F1 | 1.00 / 1.00 / 1.00 (all runs) | 1.00 / 1.00 / 1.00 (all runs) |
| Category accuracy | 0.50 | 0.50 |
| Assertion accuracy | 1.00 | 1.00 |
| Change accuracy | 0.75 | 1.00 |
| Event-date accuracy | 1.00 | 1.00 |
| Evidence quote supported | 1.00 | 1.00 |
| Schema-invalid outputs | 0 | 0 |
| Serious errors | 0 | 0 |
| Run-to-run variation | none (3 identical runs) | none (3 identical runs) |
| Latency per report | 7.2 s (Apple M4, 16 GB) | 3.1 s |
| Memory / cost | 3.1 GB loaded; no per-call cost | no local memory; billed per token |

Sources: `results/20261113-171620_qwen3.5-4b_model_selection.json`, `results/20261113-171639_claude-sonnet-5_model_selection.json`.

### Errors on this split
- **Both:** hydronephrosis labelled `finding`; the reference says `complication`. Hydronephrosis is not among the prompt's complication examples, which were taken from the development split only.
- **Qwen only:** the double-J stent got change `performed`; the reference says `unknown`.
- **Concept wording (human review):** both models wrote "Right hydronephrosis" where the reference says "Right urinary obstruction".

## Development split (SYN-001: 6 reports, 17 events; used for prompt iteration, 1 run each)

| | Qwen 3.5 4B | Claude Sonnet 5 |
|---|---|---|
| Precision / recall / F1 | 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 |
| Category / assertion / change accuracy | 0.94 / 0.94 / 0.71 | 0.94 / 1.00 / 1.00 |
| Serious errors | 1 (negation flip, D06:s2) | 0 |
| Latency per report (mean, range) | 10.8 s (7.5–14.7) | 5.0 s (2.9–10.1) |
| Time for all 6 reports | 64.8 s | 30.0 s |

Sources: `results/20261113-171517_qwen3.5-4b_development.json`, `results/20261113-171948_claude-sonnet-5_development.json` (both prompt v2).

Qwen's development errors fall in the categories the model-selection split lacks:
- change `first_documented` on absent findings (D01:s2, D03:s3)
- `performed` on a historical procedure (D05:s1)
- the D06 contradiction: one statement read as absent instead of present, and both marked `first_documented` instead of `unclear`

It also misread D01:s3: "Ein entzündlicher Ursprung des Rundherdes ist möglich" became a suspected "Right upper-lobe pulmonary nodule", although the nodule itself is present. The automatic score does not catch this, because concept wording is reviewed by hand. Claude's only development error is the D01:s2 category, where the reference labels are inconsistent.

## Caveats
- **The model-selection split cannot separate these models.** It has 4 events, only 1 absent example, and none that are suspected, historical, explicitly dated or contradictory (coverage report in the results files). Both score 1.00 F1; the visible differences are one change label and latency.
- Abbreviations, units, anatomy and cross-date comparisons are not separately labelled, so they are not scored separately.
- **Reference inconsistency:** the absent effusion in D01 is labelled `finding`, while later effusions are `complication`.
- DeutschlandGPT ignores `seed`; its consistency here comes from temperature 0 only.

## Licence and deployment notes
- **Qwen 3.5 4B:** runs offline; report text stays on the machine. Licence unverified (earlier Qwen 3 releases were Apache 2.0). CPU-only Windows laptops will be considerably slower (not measured).
- **Claude Sonnet 5 via DeutschlandGPT:** hosted by DeutschlandGPT on German infrastructure (T-Systems) with stated zero data retention. Where the underlying model inference runs is unverified. Real patient data would need a data processing agreement and a legal review (GDPR Art. 9, §203 StGB). Requires internet and API credits.

## Trade-offs
- Accuracy on this data: indistinguishable on extraction; Sonnet was more consistent on change labels and contradictions in development.
- Speed: Sonnet is about 2.3× faster per report on this Mac.
- Privacy and cost: Qwen keeps the "data never leaves the machine" claim and has no running cost; Sonnet depends on a third party and credits.
- A decision based on accuracy needs a larger model-selection split, covering the thin categories above.

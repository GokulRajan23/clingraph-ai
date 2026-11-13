# Phase 3 matching and scoring rules

Written before any model run. Applies identically to every candidate.

## Matching
- A prediction matches a reference event when both are in the same report and cite the same sentence (`evidence.sentence_id`). Each reference sentence carries exactly one reference event.
- Matching is one-to-one. If several predictions cite the same reference sentence, the first one whose assertion equals the reference is matched (otherwise the first one); the rest are duplicates.
- Unmatched predictions and duplicates are false positives. Unmatched references are false negatives.
- Concept wording is not scored automatically: references use English labels, reports are German. Matched concept pairs are written to the results file for human review.

## Scores (per run)
- Precision = matched / predictions, recall = matched / references, F1 = harmonic mean.
- Field accuracy over matched pairs: category, assertion, change, event_date (null equals null).
- Evidence support over all predictions: the quote is a non-empty exact substring of the cited sentence. Offsets are computed from the quote by code, not taken from the model.
- Schema-invalid outputs: reports whose model output fails validation. That report contributes zero predictions.

## Serious errors (listed individually)
- Negation flip: matched pair where one assertion is `present` and the other `absent`.
- Invented event date: reference `event_date` is null, prediction gives one.
- Report date as event date: predicted `event_date` equals the report date while the reference `event_date` differs.
- Unsupported change: prediction says `progressed`, `improved` or `stable` and the reference change differs.

## Reporting
Three runs per model with temperature 0 and a fixed seed; report mean and min–max. The final_evaluation split is never loaded.

import pytest

from app.extraction.models import Event, ExtractedEvent
from app.extraction.scoring import load_split, score_run


def perfect(references):
    predictions = {}
    for e in references:
        p = ExtractedEvent(concept=e["concept"], category=e["category"], assertion=e["assertion"], change=e["change"],
                           event_date=e["event_date"], sentence_id=e["evidence"]["sentence_id"], quote=e["evidence"]["quote"])
        predictions.setdefault(e["report_id"], []).append(p)
    return predictions


@pytest.fixture(scope="module")
def development():
    reports, references = load_split("development")
    return reports, references, perfect(references)


def test_held_out_split_is_refused():
    with pytest.raises(ValueError):
        load_split("final_evaluation")


def test_reference_events_match_event_model():
    for split in ("development", "model_selection"):
        for e in load_split(split)[1]:
            Event.model_validate(e)


def test_perfect_predictions_score_one(development):
    reports, references, predictions = development
    scores = score_run(reports, references, predictions)
    assert (scores["precision"], scores["recall"], scores["f1"]) == (1.0, 1.0, 1.0)
    assert scores["evidence_supported"] == 1.0 and scores["serious_errors"] == []
    assert all(v == 1.0 for v in scores["field_accuracy"].values())


def test_duplicate_counts_as_false_positive(development):
    reports, references, predictions = development
    predictions = {k: v + [v[0]] if k == "D01" else v for k, v in predictions.items()}
    scores = score_run(reports, references, predictions)
    assert scores["false_positives"] == 1 and scores["recall"] == 1.0 and scores["precision"] < 1.0


def edited(development, report_id, sentence_id, **changes):
    reports, references, predictions = development
    predictions = {k: [ExtractedEvent.model_validate({**p.model_dump(), **changes}) if p.sentence_id == sentence_id else p for p in v]
                   for k, v in predictions.items() if k == report_id}
    refs = [e for e in references if e["report_id"] == report_id]
    return score_run(reports, refs, predictions)


def test_serious_errors_are_detected(development):
    flip = edited(development, "D01", "D01:s2", assertion="present")
    assert [e["type"] for e in flip["serious_errors"]] == ["negation_flip"]
    copied = edited(development, "D01", "D01:s1", event_date="2024-01-10")
    assert [e["type"] for e in copied["serious_errors"]] == ["report_date_as_event_date"]
    invented = edited(development, "D01", "D01:s1", event_date="2023-12-01")
    assert [e["type"] for e in invented["serious_errors"]] == ["invented_event_date"]
    change = edited(development, "D01", "D01:s1", change="progressed")
    assert [e["type"] for e in change["serious_errors"]] == ["unsupported_change"]


def test_unsupported_quote_is_detected(development):
    scores = edited(development, "D01", "D01:s1", quote="Großer Rundherd links.")
    assert scores["evidence_supported"] < 1.0 and scores["recall"] == 1.0

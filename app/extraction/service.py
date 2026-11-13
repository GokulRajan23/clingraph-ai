"""Phase 4: turn model proposals for one uploaded document into events with verified evidence.

The model only proposes. Code checks that every quote is an exact substring of the cited segment,
computes offsets itself and copies the segment's source location. Proposals that fail are rejected
with a reason and never displayed as events. Checks flag doubtful values; they never rewrite them.
"""
import re

MAX_CHARS = 40_000


def report_input(document):
    """The extractor input for an uploaded document: its segments, keyed by segment id."""
    return {"sentences": [{"id": s["id"], "text": s["text"]} for s in document["segments"]]}


def verify(document, extracted):
    """Return (events, rejected) for a document's ExtractedEvent proposals."""
    segments = {s["id"]: s for s in document["segments"]}
    events, rejected = [], []
    for n, proposal in enumerate(extracted, 1):
        segment = segments.get(proposal.sentence_id)
        if segment is None:
            reason = f"cited segment {proposal.sentence_id!r} does not exist"
        elif not proposal.quote or proposal.quote not in segment["text"]:
            reason = "quote is not an exact passage of the cited segment"
        else:
            reason = None
        if reason:
            rejected.append({"proposal": proposal.model_dump(mode="json"), "reason": reason})
            continue
        start = segment["start"] + segment["text"].index(proposal.quote)
        event_date = proposal.event_date.isoformat() if proposal.event_date else None
        events.append({
            "id": f"{document['id']}:e{n}", "report_id": document["id"], "concept": proposal.concept,
            "category": proposal.category, "assertion": proposal.assertion, "change": proposal.change,
            "event_date": event_date,
            "evidence": {"segment_id": segment["id"], "quote": proposal.quote, "start": start,
                         "end": start + len(proposal.quote), "provenance": segment["provenance"]},
            "review_status": "unreviewed", "flags": flags(event_date, segment["text"]),
        })
    return events, rejected


def flags(event_date, text):
    """An event date must be written in the cited passage; otherwise it may be invented or copied."""
    if event_date and not date_in_text(event_date, text):
        return ["event_date_not_in_evidence"]
    return []


def date_in_text(iso, text):
    year, month, day = iso.split("-")
    german = rf"(?<!\d)0?{int(day)}\.0?{int(month)}\.{year}(?!\d)"
    return iso in text or re.search(german, text) is not None

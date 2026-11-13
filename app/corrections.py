"""Phase 6: reviewer corrections, kept as an append-only log and applied as an overlay before linking.

The original extraction is never modified. A correction is keyed on an observation id (report id and
evidence offsets) and on the evidence quote it was made against. A correction applies only while an
observation with that id and quote exists; otherwise it is stale. Stale corrections are kept and shown,
never applied and never dropped, and apply again if their target returns.
- confirm / reject / restore set the review decision; restore clears it.
- edit overrides event fields. An edit back to the extracted value removes that correction.
Rejected observations are returned separately and must not be linked.
"""
from app.linking import label_key

EDITABLE = ("concept", "category", "assertion", "change", "event_date")
ACTIONS = ("confirm", "reject", "restore", "edit")


def applies(entry, observation):
    return entry["observation_id"] == observation["id"] and entry["target"]["quote"] == observation["quote"]


def review(observation, entries):
    """The observation with corrected values and review fields; entries are its corrections in log order."""
    decision, overrides = None, {}
    for e in entries:
        if e["action"] == "edit":
            overrides.update({f: v for f, v in e["changes"].items() if f in EDITABLE})
        else:
            decision = {"confirm": "confirmed", "reject": "rejected", "restore": None}[e["action"]]
    original = {f: observation[f] for f in EDITABLE}
    effective = {**original, **overrides}
    corrected = [f for f in EDITABLE if effective[f] != original[f]]
    status = ("rejected" if decision == "rejected" else "corrected" if corrected
              else "confirmed" if decision == "confirmed" else "unreviewed")
    return {**observation, **effective, "label_key": list(label_key(effective["concept"])), "original": original,
            "corrected_fields": corrected, "correction_ids": [e["id"] for e in entries], "review_status": status}


def apply(observations, log):
    """Return (active, rejected, entries). Observations must have unique ids and extracted values;
    entries are the log with a computed `stale` flag."""
    by_id = {}
    for e in log:
        by_id.setdefault(e["observation_id"], []).append(e)
    active, rejected, applied = [], [], set()
    for o in observations:
        entries = [e for e in by_id.get(o["id"], []) if applies(e, o)]
        applied.update(e["id"] for e in entries)
        reviewed = review(o, entries)
        (rejected if reviewed["review_status"] == "rejected" else active).append(reviewed)
    return active, rejected, mark_stale(log, applied)


def mark_stale(log, applied):
    """The log in order, each entry flagged stale unless its id is in `applied`."""
    return [{**e, "stale": e["id"] not in applied} for e in log]


def applied_ids(observations):
    """Ids of the corrections currently applied to these (already reviewed) observations."""
    return {cid for o in observations for cid in o.get("correction_ids", [])}

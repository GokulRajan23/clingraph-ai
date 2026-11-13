"""Phase 5: link observations of the same finding across reports with fixed, testable rules.

Features come from the German evidence quote that Phase 4 verified, not from the model's English label.
- Explicit comparison: the quote states a comparison date; link to the matching observation in the report
  with that date, even when a more recent report exists. Review when the side is known on one end only.
- Candidate: otherwise link to the most recent earlier observation with the same normalised label and side.
  Always flagged for review. Similar wording alone never confirms a link.
Undated reports are never ordered and never the earlier end of a link. Different patients and observations
in the same report are never linked. Measurements are recorded but never decide identity or change.
Phase 6 corrections (app/corrections.py) are applied before linking: corrected values are linked like
extracted ones, and rejected observations are never passed in.
"""
import re

DATE = r"(\d{1,2})\.(\d{1,2})\.(\d{4})|(\d{4})-(\d{2})-(\d{2})"
COMPARISON_CUE = re.compile(r"(gegenüber|vergleich|voruntersuchung|vorbefund|voraufnahme)", re.I)
RIGHT = re.compile(r"\b(rechts\w*|rechte[nrms]?|re\.)(?=\W|$)", re.I)
LEFT = re.compile(r"\b(links\w*|linke[nrms]?|li\.)(?=\W|$)", re.I)
BILATERAL = re.compile(r"\b(beidseit\w*|bilateral\w*)\b", re.I)
MEASUREMENT = re.compile(r"\b(\d+(?:,\d+)?)(?:\s*(?:auf|bis|x|×)\s*(\d+(?:,\d+)?))?\s*(mm|cm|ml)\b", re.I)
# Words that describe side, size or grade rather than which finding it is. "new" is kept on purpose:
# "no new nodules" is a different statement from the known nodule.
IGNORED = {"right", "left", "bilateral", "sided", "side", "grade", "i", "ii", "iii", "iv", "small", "large",
           "mild", "moderate", "severe", "known", "the", "of", "a", "an"}
CHANGE_RELATIONSHIPS = {"progressed", "stable", "improved"}


def laterality(quote):
    sides = {side for side, pattern in (("right", RIGHT), ("left", LEFT), ("bilateral", BILATERAL)) if pattern.search(quote)}
    return sides.pop() if len(sides) == 1 else None


def comparison_dates(quote):
    """ISO dates written in the quote shortly after a comparison word ("gegenüber dem CT vom 10.01.2024")."""
    found = []
    for m in re.finditer(DATE, quote):
        if COMPARISON_CUE.search(quote[max(0, m.start() - 40):m.start()]):
            day, month, year = (m[1], m[2], m[3]) if m[1] else (m[6], m[5], m[4])
            found.append(f"{int(year):04d}-{int(month):02d}-{int(day):02d}")
    return found


def measurements(quote):
    return [m[0] for m in MEASUREMENT.finditer(quote)]


def label_key(concept):
    words = re.sub(r"[^a-z0-9äöüß]+", " ", concept.lower()).split()
    return tuple(w for w in words if w not in IGNORED and not w.isdigit())


def observation(document, event, patient_id="local"):
    """An observation for linking, keyed to the report and evidence offsets so it survives re-extraction."""
    ev = event["evidence"]
    return {"id": f"{document['id']}:{ev['start']}-{ev['end']}", "event_id": event["id"], "patient_id": patient_id,
            "report_id": document["id"], "report_date": document.get("report_date"), "filename": document.get("filename"),
            "concept": event["concept"], "category": event["category"], "assertion": event["assertion"],
            "change": event["change"], "event_date": event["event_date"], "quote": ev["quote"], "start": ev["start"],
            "end": ev["end"], "laterality": laterality(ev["quote"]), "comparison_dates": comparison_dates(ev["quote"]),
            "measurements": measurements(ev["quote"]), "label_key": list(label_key(event["concept"]))}


def build(observations):
    """Return observations (same order, ids made unique by assign_ids), links, unresolved comparisons
    and findings."""
    observations = assign_ids(observations)
    links, unresolved = [], []
    for later in observations:
        made = _explicit_links(later, observations, unresolved)
        if not made:
            made = _candidate_links(later, observations)
        links += made
    return {"observations": observations, "links": links, "unresolved": unresolved,
            "findings": _findings(observations, links)}


def assign_ids(observations):
    """Same order; a repeated evidence span gets a #n suffix. Idempotent, so ids assigned before
    corrections are applied stay the same inside build."""
    seen, out = {}, []
    for o in observations:
        n = seen[o["id"]] = seen.get(o["id"], 0) + 1
        out.append(o if n == 1 else {**o, "id": f"{o['id']}#{n}"})
    return out


def _comparable(a, b):
    return a["patient_id"] == b["patient_id"] and a["report_id"] != b["report_id"]


def _same_side(a, b):
    return a["laterality"] == b["laterality"]


def _explicit_links(later, observations, unresolved):
    links = []
    for when in later["comparison_dates"]:
        reports = [o for o in observations if _comparable(o, later) and o["report_date"] == when]
        if not reports:
            unresolved.append(_unresolved(later, when, "study_not_in_collection",
                                          f"Compared with a study dated {when} that is not in this collection."))
            continue
        # The comparison anchors identity, so a label that only adds words ("new right effusion") still matches.
        key = set(later["label_key"])
        targets = [o for o in reports if (key <= set(o["label_key"]) or set(o["label_key"]) <= key) and o["label_key"]
                   and (o["laterality"] is None or later["laterality"] is None or _same_side(o, later))]
        if not targets:
            unresolved.append(_unresolved(later, when, "no_matching_observation",
                                          f"The report dated {when} has no observation of this finding on this side."))
        for earlier in targets:
            # Review when the side is known on one end only; findings without a side (ascites) need none.
            relationship = later["change"] if later["change"] in CHANGE_RELATIONSHIPS else "compared"
            links.append(_link(earlier, later, relationship, when, "Explicit comparison",
                               not _same_side(earlier, later) or len(targets) > 1))
    return links


def _candidate_links(later, observations):
    def matches(o):
        if not _comparable(o, later) or o["report_date"] is None or o["label_key"] != later["label_key"] or not o["label_key"]:
            return False
        if later["report_date"] is not None and o["report_date"] >= later["report_date"]:
            return False
        # A historical statement refers back to earlier documentation, so it may omit the side.
        return _same_side(o, later) or (later["assertion"] == "historical" and later["laterality"] is None)
    earlier = [o for o in observations if matches(o)]
    if not earlier:
        return []
    latest = max(o["report_date"] for o in earlier)
    relationship = ("historical_reference" if later["assertion"] == "historical"
                    else "unclear" if later["change"] == "unclear" else "same_finding")
    basis = "Same finding and side; no resolved comparison; review required"
    if later["report_date"] is None:
        basis += "; later report is undated, so order is unknown"
    return [_link(o, later, relationship, None, basis, True) for o in earlier if o["report_date"] == latest]


def _link(earlier, later, relationship, comparison_date, basis, review):
    return {"id": f"{earlier['id']}>{later['id']}", "from_observation": earlier["id"], "to_observation": later["id"],
            "relationship": relationship, "comparison_date": comparison_date, "basis": basis, "review_required": review,
            "evidence": {"from": earlier["quote"], "to": later["quote"]}}


def _unresolved(o, when, reason, message):
    return {"observation": o["id"], "comparison_date": when, "reason": reason, "message": message}


def _findings(observations, links):
    """Connected observations form a finding; any link that needs review flags the whole finding."""
    parent = {o["id"]: o["id"] for o in observations}

    def root(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for link in links:
        parent[root(link["from_observation"])] = root(link["to_observation"])
    groups = {}
    for o in observations:
        groups.setdefault(root(o["id"]), []).append(o)
    findings = []
    for members in groups.values():
        members.sort(key=lambda o: (o["report_date"] is None, o["report_date"] or "", o["start"]))
        ids = {o["id"] for o in members}
        own = [link for link in links if link["to_observation"] in ids]
        documented = [o for o in members if o["report_date"] and o["assertion"] in ("present", "suspected")]
        undated = any(o["report_date"] is None for o in members)
        findings.append({
            "id": "f:" + members[0]["id"], "concept": members[0]["concept"], "laterality": members[0]["laterality"],
            "observations": [o["id"] for o in members],
            "first_documented": documented[0]["report_date"] if documented else None,
            "first_documented_uncertain": undated and len(members) > 1,
            "review_required": any(link["review_required"] for link in own),
        })
    findings.sort(key=lambda f: (f["first_documented"] is None, f["first_documented"] or "", f["concept"]))
    return findings

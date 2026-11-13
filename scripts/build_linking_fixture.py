"""Write data/linking-v1 (synthetic patient SYN-004) and samples/linking. Labels were written before any run."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT, SAMPLES = ROOT / "data" / "linking-v1", ROOT / "samples" / "linking"
P = "SYN-004"
# (report id, report date, title, [(event id, sentence, concept, category, assertion, change, chain)])
REPORTS = [
    ("L01", "2024-02-05", "CT Abdomen", [
        ("LE01", "Im rechten Leberlappen zeigt sich eine 14 mm große hypodense Läsion.", "Right liver lesion", "finding", "present", "first_documented", "lesion"),
        ("LE02", "Im linken Leberlappen findet sich eine 5 mm große Zyste.", "Left liver cyst", "finding", "present", "first_documented", "cyst"),
        ("LE03", "Kein Aszites.", "Ascites", "complication", "absent", "unknown", "ascites")]),
    ("L02", "2024-03-11", "Sonographie Abdomen", [
        ("LE04", "Die bekannte Läsion im rechten Leberlappen misst sonographisch 15 mm.", "Right liver lesion", "finding", "present", "unknown", "lesion"),
        ("LE05", "Neu zeigt sich wenig Aszites perihepatisch.", "Ascites", "complication", "present", "first_documented", "ascites")]),
    ("L03", "2024-04-22", "CT Abdomen Verlauf", [
        ("LE06", "Die Läsion im rechten Leberlappen ist gegenüber dem CT vom 05.02.2024 von 14 auf 19 mm größenprogredient.", "Right liver lesion", "finding", "present", "progressed", "lesion"),
        ("LE07", "Die Zyste im linken Leberlappen ist gegenüber dem MRT vom 10.01.2023 unverändert.", "Left liver cyst", "finding", "present", "stable", "cyst"),
        ("LE08", "Der Aszites ist gegenüber dem 11.03.2024 rückläufig.", "Ascites", "complication", "present", "improved", "ascites"),
        ("LE09", "Ein Gallengangsstent liegt regelrecht in situ; das Einlagedatum ist nicht angegeben.", "Biliary stent", "device", "present", "unknown", "stent")]),
    ("L04", "2024-06-03", "Sonographie Abdomen", [
        ("LE10", "Kein Aszites nachweisbar.", "Ascites", "complication", "absent", "unknown", "ascites"),
        ("LE11", "Der Gallengangsstent liegt in situ.", "Biliary stent", "device", "present", "unknown", "stent"),
        ("LE12", "Im linken Leberlappen keine neue Läsion.", "New left liver lesion", "finding", "absent", "unknown", None)]),
    ("L05", None, "Arztbrief (Auszug), undatiert", [
        ("LE13", "Laut Vorbefund wurde eine Leberbiopsie rechts durchgeführt; das Datum ist nicht angegeben.", "Right liver biopsy", "procedure", "historical", "unknown", None),
        ("LE14", "Ein Gallengangsstent ist einliegend.", "Biliary stent", "device", "present", "unknown", "stent")]),
]
REVIEW = "Same finding and side; no resolved comparison; review required"
LINKS = [
    ("LE01", "LE04", "same_finding", None, REVIEW, True, "No comparison stated; 14 to 15 mm must not be read as progression"),
    ("LE01", "LE06", "progressed", "2024-02-05", "Explicit comparison", False, "Compared with L01, not the more recent L02"),
    ("LE03", "LE05", "same_finding", None, REVIEW, True, "Absent, then new"),
    ("LE05", "LE08", "improved", "2024-03-11", "Explicit comparison", False, None),
    ("LE02", "LE07", "same_finding", None, REVIEW, True, "Stated comparison is with an MRT that is not in the collection"),
    ("LE08", "LE10", "same_finding", None, REVIEW, True, None),
    ("LE09", "LE11", "same_finding", None, REVIEW, True, "Device present; placement date unknown"),
    ("LE11", "LE14", "same_finding", None, REVIEW, True, "Later observation is in an undated report"),
]
UNRESOLVED = [{"event_id": "LE07", "comparison_date": "2023-01-10", "reason": "study_not_in_collection"}]
TRAPS = {
    "comparison_not_most_recent": "LE06 compares with L01 although L02 is more recent",
    "study_not_uploaded": "LE07 compares with an MRT from 2023-01-10",
    "undated_report": "L05",
    "device_across_reports": "LE09, LE11, LE14",
    "opposite_side_same_organ": "LE12 (left, absent) vs the right liver lesion; LE02 left cyst vs right lesion",
    "measurement_without_comparison": "LE04 measures 15 mm without a stated comparison",
}


def main():
    reports, events = [], []
    for rid, rdate, title, items in REPORTS:
        text = "\n".join(sentence for _, sentence, *_ in items)
        sentences, offset = [], 0
        for n, (eid, sentence, concept, category, assertion, change, chain) in enumerate(items, 1):
            sid = f"{rid}:s{n}"
            sentences.append({"id": sid, "text": sentence})
            events.append({"id": eid, "patient_id": P, "report_id": rid, "concept": concept, "category": category,
                           "assertion": assertion, "change": change, "chain_id": chain, "report_date": rdate,
                           "event_date": None, "event_date_basis": "unknown",
                           "evidence": {"sentence_id": sid, "quote": sentence, "start": offset, "end": offset + len(sentence)},
                           "review_status": "reference_unreviewed", "issue": None if rdate else "Report date missing; do not order by filename"})
            offset += len(sentence) + 1
        reports.append({"id": rid, "patient_id": P, "split": "linking_check", "language": "de", "title": title,
                        "report_date": rdate, "date_type": "report_date", "text": text, "sentences": sentences})
        header = f"Berichtsdatum: {rdate}\n" if rdate else ""
        (SAMPLES / f"{rid}.txt").write_text(header + text + "\n", encoding="utf-8")
    links = {"links": [{"from_event": a, "to_event": b, "relationship": r, "comparison_date": d, "basis": basis,
                        "review_required": review, "note": note} for a, b, r, d, basis, review, note in LINKS],
             "unresolved_comparisons": UNRESOLVED}
    files = {"reports.json": reports, "events.json": events, "links.json": links}
    for name, data in files.items():
        (OUT / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    manifest = {"version": "linking-1.0.0", "synthetic": True, "clinical_review": "Pending — hand-authored technical references",
                "split_unit": "patient", "splits": {"linking_check": [P]},
                "provenance": "Written on 2026-11-13 after the Phase 5 rules were specified and before any linker or model run on it, by the same author as the rules. A technical check, not an independent test.",
                "traps": TRAPS, "counts": {"reports": len(reports), "events": len(events), "links": len(LINKS)},
                "sha256": {n: hashlib.sha256((OUT / n).read_bytes()).hexdigest() for n in files}}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(reports)} reports, {len(events)} events, {len(LINKS)} links")


if __name__ == "__main__":
    main()

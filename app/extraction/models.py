"""Event models for clinical extraction (mirrors data/v1.0.0/event.schema.json)."""
from datetime import date
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict

Category = Literal["finding", "complication", "procedure", "device"]
Assertion = Literal["present", "absent", "suspected", "historical", "unknown"]
Change = Literal["first_documented", "progressed", "stable", "improved", "performed", "unknown", "unclear"]


class Evidence(BaseModel):
    sentence_id: str
    quote: str
    start: int
    end: int


class Event(BaseModel):
    id: str
    patient_id: str
    report_id: str
    concept: str
    category: Category
    assertion: Assertion
    change: Change
    report_date: date | None
    event_date: date | None
    event_date_basis: str = "unknown"
    evidence: Evidence
    review_status: str


class ExtractedEvent(BaseModel):
    """What the model returns; ids, report date and offsets are filled in by code."""
    model_config = ConfigDict(extra="forbid")

    concept: str
    category: Category
    assertion: Assertion
    change: Change
    event_date: date | None
    sentence_id: str
    quote: str


class Extraction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[ExtractedEvent]


class Extractor(Protocol):
    def extract(self, report: dict) -> list[ExtractedEvent]: ...

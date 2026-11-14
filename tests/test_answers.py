"""LLM answer tests. The chat model is a fake with LangChain's structured-output shape; no network or key."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from backend.answers import Answerer, AskRequest, GraphAnswer, build_messages, clean, describe_graph, load_answerer, parse_text
from backend.config import Settings
from backend.main import NO_ANSWERER, create_app

GRAPH = {
    "nodes": [
        {"id": "r1", "type": "report", "label": "CT_chest.pdf · 10 Feb 2022", "props": [["Report date", "10 Feb 2022"]]},
        {"id": "r2", "type": "report", "label": "Discharge.pdf · 28 Mar 2022", "props": []},
        {"id": "pembrolizumab", "type": "medication", "label": "Pembrolizumab", "props": [["Status", "Ongoing"]]},
    ],
    "edges": [{"source": "pembrolizumab", "target": "r2", "relation": "documented_in"}],
}


class FakeStructured:
    def __init__(self, result: dict[str, Any]) -> None:
        self.result = result
        self.calls: list[list[Any]] = []

    async def ainvoke(self, messages: list[Any]) -> dict[str, Any]:
        self.calls.append(messages)
        return self.result


class FakeModel:
    """Stands in for a LangChain chat model; records how structured output was requested."""

    def __init__(self, result: dict[str, Any]) -> None:
        self.structured = FakeStructured(result)
        self.kwargs: dict[str, Any] = {}

    def with_structured_output(self, schema: Any, **kwargs: Any) -> FakeStructured:
        assert schema is GraphAnswer
        self.kwargs = kwargs
        return self.structured


def parsed(lines: list[dict[str, Any]], highlight: list[str]) -> dict[str, Any]:
    return {"raw": None, "parsed": GraphAnswer.model_validate({"lines": lines, "highlight": highlight}), "parsing_error": None}


def settings() -> Settings:
    return Settings(api_key=None, voice_id=None, stt_model="stt", tts_model="tts", language="en")


def client_for(model: FakeModel) -> TestClient:
    return TestClient(create_app(settings(), warm_up=False, answerer=Answerer(model, "fake:model")))


def ask(client: TestClient, question: str = "What is she on now?", **extra: Any):
    return client.post("/api/ask", json={"question": question, "graph": GRAPH, **extra})


def test_answers_from_the_graph_with_citations_and_highlights() -> None:
    model = FakeModel(parsed([{"text": "Pembrolizumab, still ongoing.", "cites": ["r2"]}], ["pembrolizumab"]))
    response = ask(client_for(model))
    assert response.status_code == 200
    assert response.json() == {"lines": [{"text": "Pembrolizumab, still ongoing.", "cites": ["r2"]}], "highlight": ["pembrolizumab", "r2"]}
    # Native JSON-schema output (not forced tool calls), with the raw reply kept for recovery.
    assert model.kwargs == {"method": "json_schema", "include_raw": True}


def test_the_prompt_carries_the_record_history_and_question() -> None:
    model = FakeModel(parsed([{"text": "Yes.", "cites": []}], []))
    history = [{"role": "user", "text": "What is the treatment?"}, {"role": "assistant", "text": "Pembrolizumab."}]
    ask(client_for(model), "Since when?", history=history)
    system, *turns = model.structured.calls[0]
    assert isinstance(system, SystemMessage)
    assert "- pembrolizumab [medication] Pembrolizumab (Status: Ongoing)" in system.content
    assert "- pembrolizumab documented_in r2" in system.content
    assert [type(t) for t in turns] == [HumanMessage, AIMessage, HumanMessage]
    assert turns[-1].content == "Since when?"


def test_drops_citations_and_highlights_the_graph_does_not_have() -> None:
    answer = GraphAnswer.model_validate(
        {"lines": [{"text": "  Ongoing   since 2023. ", "cites": ["r2", "pembrolizumab", "r9", "r2"]}, {"text": " ", "cites": []}], "highlight": ["ghost", "pembrolizumab"]}
    )
    # Only report nodes can be cited; unknown IDs and blank lines go; cited reports are highlighted.
    assert clean(answer, AskRequest(question="q", graph=GRAPH).graph) == {"lines": [{"text": "Ongoing since 2023.", "cites": ["r2"]}], "highlight": ["pembrolizumab", "r2"]}


def test_recovers_json_wrapped_in_reasoning_and_fences() -> None:
    raw = AIMessage('<think>The record says r2.</think>\n```json\n{"lines": [{"text": "Pembrolizumab.", "cites": ["r2"]}], "highlight": []}\n```')
    model = FakeModel({"raw": raw, "parsed": None, "parsing_error": ValueError("not JSON")})
    response = ask(client_for(model))
    assert response.status_code == 200
    assert response.json()["lines"] == [{"text": "Pembrolizumab.", "cites": ["r2"]}]


def test_unusable_reply_is_a_bad_gateway() -> None:
    model = FakeModel({"raw": AIMessage("I am not sure."), "parsed": None, "parsing_error": ValueError("not JSON")})
    response = ask(client_for(model))
    assert response.status_code == 502
    assert "usable answer" in response.json()["detail"]


def test_provider_errors_are_reported_without_details() -> None:
    class Failing(FakeStructured):
        async def ainvoke(self, messages: list[Any]) -> dict[str, Any]:
            raise RuntimeError("401 invalid key sk-secret")

    model = FakeModel({})
    model.structured = Failing({})
    response = ask(client_for(model))
    assert response.status_code == 502
    assert "sk-secret" not in response.text


def test_without_a_model_answers_are_unavailable() -> None:
    client = TestClient(create_app(settings(), warm_up=False, answerer=NO_ANSWERER))
    assert ask(client).status_code == 503


def test_rejects_bad_requests() -> None:
    client = TestClient(create_app(settings(), warm_up=False, answerer=NO_ANSWERER))
    assert client.post("/api/ask", json={"question": "   ", "graph": GRAPH}).status_code == 422
    assert client.post("/api/ask", json={"question": "q"}).status_code == 422


def test_refuses_other_origins() -> None:
    model = FakeModel(parsed([{"text": "x", "cites": []}], []))
    response = client_for(model).post("/api/ask", json={"question": "q", "graph": GRAPH}, headers={"Origin": "https://evil.example"})
    assert response.status_code == 403
    assert model.structured.calls == []


def test_parse_text_needs_an_object() -> None:
    with pytest.raises(ValueError):
        parse_text("no json here")


def test_missing_provider_key_turns_answers_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FIREWORKS_API_KEY", raising=False)
    assert load_answerer("fireworks:accounts/fireworks/models/glm-5p3-flash") is None


def test_describes_every_node_and_relation() -> None:
    text = describe_graph(AskRequest(question="q", graph=GRAPH).graph)
    assert text.count("\n- ") == 4  # three nodes, one relation
    assert build_messages(AskRequest(question=" q ", graph=GRAPH))[-1].content == "q"

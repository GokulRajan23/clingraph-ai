"""LLM answer tests. The chat model is a fake that streams LangChain message chunks; no network or key."""

from __future__ import annotations

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, SystemMessage

from backend.answers import Answerer, AskRequest, SentenceReader, build_messages, describe_graph, load_answerer
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


class FakeModel:
    """Stands in for a LangChain chat model: streams `chunks`, then raises `error` if set."""

    def __init__(self, *chunks: str, error: Exception | None = None) -> None:
        self.chunks = chunks
        self.error = error
        self.calls: list[list[Any]] = []

    async def astream(self, messages: list[Any]):
        self.calls.append(messages)
        for chunk in self.chunks:
            yield AIMessageChunk(content=chunk)
        if self.error:
            raise self.error

    async def ainvoke(self, messages: list[Any]) -> AIMessage:
        return AIMessage("OK")


def settings() -> Settings:
    return Settings(api_key=None, voice_id=None, stt_model="stt", tts_model="tts", language="en")


def client_for(model: FakeModel) -> TestClient:
    return TestClient(create_app(settings(), warm_up=False, answerer=Answerer(model, "fake:model")))


def ask(client: TestClient, question: str = "What is she on now?", **extra: Any):
    return client.post("/api/ask", json={"question": question, "graph": GRAPH, **extra})


def events(response) -> list[dict[str, Any]]:
    assert response.headers["content-type"].startswith("application/x-ndjson")
    return [json.loads(line) for line in response.text.splitlines()]


def reader() -> SentenceReader:
    return SentenceReader(AskRequest(question="q", graph=GRAPH).graph)


def test_streams_sentences_then_sources_and_highlights() -> None:
    model = FakeModel("She's on pembrolizumab, ", "started in 2023.\nIt's still ongoing.\nHIGHLIGHT: pembrolizumab, r2\n")
    response = ask(client_for(model))
    assert response.status_code == 200
    assert events(response) == [
        {"type": "sentence", "text": "She's on pembrolizumab, started in 2023."},
        {"type": "sentence", "text": "It's still ongoing."},
        {"type": "done", "sources": ["r2"], "highlight": ["pembrolizumab", "r2"]},
    ]


def test_a_sentence_is_sent_as_soon_as_it_is_complete() -> None:
    sentences = reader()
    assert sentences.feed("Stable at 19 ") == []
    assert sentences.feed("mm.\nIt was") == ["Stable at 19 mm."]
    assert sentences.finish() == ["It was"]


def test_the_prompt_carries_the_record_history_and_question() -> None:
    model = FakeModel("Yes.")
    history = [{"role": "user", "text": "What is the treatment?"}, {"role": "assistant", "text": "Pembrolizumab."}]
    ask(client_for(model), "Since when?", history=history)
    system, *turns = model.calls[0]
    assert isinstance(system, SystemMessage)
    assert "- pembrolizumab [medication] Pembrolizumab (Status: Ongoing)" in system.content
    assert "- pembrolizumab documented_in r2" in system.content
    assert [type(t) for t in turns] == [HumanMessage, AIMessage, HumanMessage]
    assert turns[-1].content == "Since when?"


def test_only_real_nodes_are_highlighted_and_reports_are_the_sources() -> None:
    sentences = reader()
    # Bullets, stray citation brackets, blank lines and spare spaces go; unknown IDs are dropped.
    assert sentences.feed("-   Ongoing   since 2023. [r2]\n \nHIGHLIGHT: [ghost, pembrolizumab, r2, r1]\n") == ["Ongoing since 2023."]
    assert sentences.highlight == ["pembrolizumab", "r2", "r1"]
    assert sentences.sources == ["r2", "r1"]


def test_drops_reasoning_before_the_answer() -> None:
    sentences = reader()
    assert sentences.feed("<think>The record\nsays r2.") == []
    assert sentences.feed("</think>\nPembrolizumab.\n") == ["Pembrolizumab."]


def test_keeps_at_most_five_sentences() -> None:
    assert len(reader().feed("".join(f"Fact {i}.\n" for i in range(8)))) == 5


def test_an_empty_answer_is_an_error_event() -> None:
    assert events(ask(client_for(FakeModel("\nHIGHLIGHT: r2\n")))) == [{"type": "error", "detail": "The language model returned an empty answer"}]


def test_a_failure_midway_keeps_the_sentences_already_sent() -> None:
    model = FakeModel("Pembrolizumab.\n", error=RuntimeError("401 invalid key sk-secret"))
    response = ask(client_for(model))
    sent = events(response)
    assert sent[0] == {"type": "sentence", "text": "Pembrolizumab."}
    assert sent[1]["type"] == "error"
    assert "sk-secret" not in response.text


def test_without_a_model_answers_are_unavailable() -> None:
    client = TestClient(create_app(settings(), warm_up=False, answerer=NO_ANSWERER))
    assert ask(client).status_code == 503


def test_rejects_bad_requests() -> None:
    client = TestClient(create_app(settings(), warm_up=False, answerer=NO_ANSWERER))
    assert client.post("/api/ask", json={"question": "   ", "graph": GRAPH}).status_code == 422
    assert client.post("/api/ask", json={"question": "q"}).status_code == 422


def test_refuses_other_origins() -> None:
    model = FakeModel("x")
    response = client_for(model).post("/api/ask", json={"question": "q", "graph": GRAPH}, headers={"Origin": "https://evil.example"})
    assert response.status_code == 403
    assert model.calls == []


def test_missing_provider_key_turns_answers_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FIREWORKS_API_KEY", raising=False)
    assert load_answerer("fireworks:accounts/fireworks/models/deepseek-v4p1-flash-1017") is None
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    assert load_answerer("groq:llama-3.3-70b-versatile") is None


def test_groq_is_not_sent_a_reasoning_effort(monkeypatch: pytest.MonkeyPatch) -> None:
    # Groq rejects reasoning_effort for models that don't reason; Fireworks gets "none".
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setenv("FIREWORKS_API_KEY", "test-key")
    groq = load_answerer("groq:llama-3.3-70b-versatile")
    fireworks = load_answerer("fireworks:accounts/fireworks/models/deepseek-v4p1-flash-1017")
    assert groq is not None and fireworks is not None
    assert getattr(groq._model, "reasoning_effort", None) is None
    assert getattr(fireworks._model, "reasoning_effort", None) == "none"


def test_describes_every_node_and_relation() -> None:
    text = describe_graph(AskRequest(question="q", graph=GRAPH).graph)
    assert text.count("\n- ") == 4  # three nodes, one relation
    assert build_messages(AskRequest(question=" q ", graph=GRAPH))[-1].content == "q"

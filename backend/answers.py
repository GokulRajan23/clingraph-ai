"""Answers questions about the patient's knowledge graph with an LLM, streamed sentence by sentence.

The model is whatever LangChain's `init_chat_model` makes of LLM_MODEL ("provider:model", e.g.
"fireworks:accounts/fireworks/models/deepseek-v4p1-flash-1017"); the provider reads its own key from the
environment (FIREWORKS_API_KEY for Fireworks). The frontend sends the graph it shows with every
question, so the answer's sources and highlights are nodes the UI knows.

The model answers like a colleague, one sentence per line, then one "HIGHLIGHT: ..." line naming
the nodes the answer is about; the reports among them are its sources. Each sentence is sent on as
soon as it is complete, so the first can be spoken while the rest are still being written.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from collections.abc import AsyncIterator
from typing import Any, Literal, Protocol

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field

log = logging.getLogger("uvicorn.error")

DEFAULT_LLM_MODEL = "fireworks:accounts/fireworks/models/deepseek-v4p1-flash-1017"
# Measured 2026-11-14: without reasoning the first line arrives ~0.7 s sooner, and the answers
# were as good.
REASONING_EFFORT = "none"
MAX_TOKENS = 1024
TIMEOUT_S = 45.0
MAX_SENTENCES = 5
REPORT = "report"


# What the frontend sends.


class Node(BaseModel):
    id: str = Field(max_length=100)
    type: str = Field(max_length=40)
    label: str = Field(max_length=300)
    props: list[tuple[str, str]] = Field(default_factory=list, max_length=40)


class Edge(BaseModel):
    source: str = Field(max_length=100)
    target: str = Field(max_length=100)
    relation: str = Field(max_length=60)


class Graph(BaseModel):
    nodes: list[Node] = Field(max_length=1000)
    edges: list[Edge] = Field(max_length=4000)


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=4000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000, pattern=r"\S")
    graph: Graph
    # Earlier turns, oldest first, so follow-ups ("and before that?") make sense.
    history: list[Turn] = Field(default_factory=list, max_length=12)


SYSTEM = """You are a clinical colleague briefing a doctor about one patient, by voice. Your only source is the patient record below: a knowledge graph built from the patient's medical reports.

Facts:
- Use only facts in the record. Never guess, never add outside medical knowledge, and do not recommend treatment.
- If the record does not answer the question, say so plainly in one sentence (for example "I don't see a blood type anywhere in her reports.").

How to talk:
- Answer the question directly in your first sentence, then add only the detail that matters, connected the way you would tell it at handover. One to three sentences in all.
- Keep every sentence short enough to say in one breath, about 20 words at most. Split rather than chain clauses with semicolons, and keep the first sentence the shortest.
- Speak naturally: vary your sentences, link events ("then", "after that", "when the nodule grew"), and do not start every sentence the same way. No greetings, no "Sure", no "Based on the record", no offers to say more.
- Refer to the patient as she or her (or he or him, as the record says).
- Keep clinical terms and drug names, but write shorthand out in words: "every three weeks" not "q3w", "right upper lobe" not "RUL".
- Dates: say the month and year ("in March 2022"); give the exact day only when the question is about timing. Keep units as numbers ("19 mm").
- Follow-up questions build on the conversation so far: do not repeat what was already said.
- The question may be a speech transcript: allow for misheard words (for example "pembro" for pembrolizumab).

Format: plain text, no markdown, one sentence per line. Then one last line: "HIGHLIGHT:" and the comma-separated IDs of the nodes the answer is about, including the report nodes the facts come from (a node's reports are the targets of its documented_in relations; an observation's report is the one with the same date).

Example, for a different patient:
The thyroid nodule hasn't changed, it's been 12 mm on every scan since June 2021.
It was last measured in April 2024, with no new findings.
HIGHLIGHT: thyroid-nodule, thyroid-nodule-1, thyroid-nodule-3, r1, r4

Patient record:
"""


def describe_graph(graph: Graph) -> str:
    """The graph as compact text: one line per node, then one per relation."""
    nodes = []
    for node in graph.nodes:
        props = "; ".join(f"{key}: {value}" for key, value in node.props)
        nodes.append(f"- {node.id} [{node.type}] {node.label}" + (f" ({props})" if props else ""))
    edges = [f"- {edge.source} {edge.relation} {edge.target}" for edge in graph.edges]
    return "Nodes:\n" + "\n".join(nodes) + "\n\nRelations:\n" + "\n".join(edges)


def build_messages(request: AskRequest) -> list[BaseMessage]:
    messages: list[BaseMessage] = [SystemMessage(SYSTEM + describe_graph(request.graph))]
    for turn in request.history:
        messages.append(HumanMessage(turn.text) if turn.role == "user" else AIMessage(turn.text))
    messages.append(HumanMessage(request.question.strip()))
    return messages


_BRACKETS = re.compile(r"\s*\[[^\[\]]*\]")
_BULLET = re.compile(r"^(?:[-*•]|\d+[.)])\s+")
_HIGHLIGHT = re.compile(r"^\W*highlight\W*:(.*)$", re.IGNORECASE)


class SentenceReader:
    """Reads the model's text, fed in chunks, into sentences and the nodes the answer is about.

    Only real nodes are highlighted; the reports among them are the sources. Bullets, stray
    citation brackets, blank lines and anything past MAX_SENTENCES are dropped.
    """

    def __init__(self, graph: Graph) -> None:
        self._nodes = {node.id: node.type for node in graph.nodes}
        self._buffer = ""
        self.highlight: list[str] = []
        self.sentences: list[str] = []

    @property
    def sources(self) -> list[str]:
        return [i for i in self.highlight if self._nodes[i] == REPORT]

    def feed(self, chunk: str) -> list[str]:
        """Adds model text; returns the sentences it completed."""
        self._buffer += chunk
        # Some models think aloud in <think>...</think> first: hold that back, then drop it.
        if self._buffer.lstrip().startswith("<think>"):
            if "</think>" not in self._buffer:
                return []
            self._buffer = self._buffer.split("</think>", 1)[1]
        *complete, self._buffer = self._buffer.split("\n")
        return [sentence for raw in complete if (sentence := self._read(raw))]

    def finish(self) -> list[str]:
        """The last sentence, if the model did not end it with a newline."""
        rest, self._buffer = self._buffer, ""
        sentence = self._read(rest)
        return [sentence] if sentence else []

    def _read(self, raw: str) -> str | None:
        text = raw.strip().strip("`").strip()
        if match := _HIGHLIGHT.match(text):
            ids = [part.strip() for part in match.group(1).strip(" []").split(",")]
            self.highlight = list(dict.fromkeys(self.highlight + [i for i in ids if i in self._nodes]))
            return None
        text = " ".join(_BULLET.sub("", _BRACKETS.sub("", text)).split())
        if not text or len(self.sentences) >= MAX_SENTENCES:
            return None
        self.sentences.append(text)
        return text


class AnswerError(Exception):
    """The model replied, but not with a usable answer."""


class ChatModel(Protocol):
    def astream(self, messages: Any) -> AsyncIterator[Any]: ...
    async def ainvoke(self, messages: Any) -> Any: ...


class Answerer:
    def __init__(self, model: ChatModel, name: str) -> None:
        self.name = name
        self._model = model

    async def stream(self, request: AskRequest) -> AsyncIterator[dict[str, Any]]:
        """Yields {"type": "sentence", "text"} as sentences complete, then {"type": "done", "sources", "highlight"}."""
        reader = SentenceReader(request.graph)
        start = time.perf_counter()
        first: float | None = None
        async with asyncio.timeout(TIMEOUT_S):
            async for chunk in self._model.astream(build_messages(request)):
                for sentence in reader.feed(_text_of(chunk)):
                    first = first or time.perf_counter() - start
                    yield {"type": "sentence", "text": sentence}
        for sentence in reader.finish():
            first = first or time.perf_counter() - start
            yield {"type": "sentence", "text": sentence}
        if not reader.sentences:
            raise AnswerError("The language model returned an empty answer")
        log.info("Answer: first sentence %.2f s, done %.2f s, %d sentences", first, time.perf_counter() - start, len(reader.sentences))
        yield {"type": "done", "sources": reader.sources, "highlight": reader.highlight}

    async def warm_up(self) -> None:
        """One tiny request, so the first question doesn't also pay for opening the connection."""
        await asyncio.wait_for(self._model.ainvoke([HumanMessage("Reply with OK.")]), TIMEOUT_S)


def _text_of(chunk: Any) -> str:
    content = getattr(chunk, "content", "")
    if isinstance(content, str):
        return content
    # Content blocks: only text blocks are the answer (reasoning blocks are not).
    return "".join(block.get("text", "") for block in content if isinstance(block, dict) and block.get("type") == "text")


def load_answerer(model_name: str) -> Answerer | None:
    """Builds the answerer, or None (logged) when the provider package or its API key is missing."""
    from langchain.chat_models import init_chat_model

    try:
        model = init_chat_model(model_name, max_tokens=MAX_TOKENS, reasoning_effort=REASONING_EFFORT)
    except Exception as error:  # Missing key or provider package: answers fall back to the scripted ones.
        reason = " ".join(str(error).split())[:240] or type(error).__name__
        log.warning("LLM answers are off (%s); set the provider's API key, e.g. FIREWORKS_API_KEY. %s", model_name, reason)
        return None
    log.info("LLM answers from %s", model_name)
    return Answerer(model, model_name)

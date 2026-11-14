"""Answers questions about the patient's knowledge graph with an LLM.

The model is whatever LangChain's `init_chat_model` makes of LLM_MODEL ("provider:model", e.g.
"fireworks:accounts/fireworks/models/glm-5p3-flash"); the provider reads its own key from the
environment (FIREWORKS_API_KEY for Fireworks). The frontend sends the graph it shows with every
question, so the answer cites the same report IDs and highlights the same nodes the UI knows.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Literal, Protocol

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field, ValidationError

log = logging.getLogger("uvicorn.error")

DEFAULT_LLM_MODEL = "fireworks:accounts/fireworks/models/glm-5p3-flash"
# Room for a reasoning model to think before its short answer.
MAX_TOKENS = 4096
TIMEOUT_S = 45.0
MAX_LINES = 5
REPORT = "report"
SOURCE_RELATION = "documented_in"


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


# What the model must return; the same shape as the frontend's Answer.


class AnswerLine(BaseModel):
    text: str = Field(description="One short fact as a plain sentence that reads well aloud.")
    cites: list[str] = Field(description="IDs of the report nodes this line is taken from.")


class GraphAnswer(BaseModel):
    lines: list[AnswerLine] = Field(description="One to four lines answering the question.")
    highlight: list[str] = Field(description="IDs of the graph nodes the answer is about, including the cited reports.")


SYSTEM = """You answer a clinician's questions about one patient. Your only source is the patient record below: a knowledge graph built from the patient's medical reports.

How to answer:
- Use only facts in the record. Never guess, never add outside medical knowledge, and do not recommend treatment.
- Answer in one to four short lines, one fact per line, as plain sentences with no markdown. The answer is read aloud, so keep it brief and natural.
- Give dates as in the record (for example "14 May 2024") and keep units ("19 mm").
- Each line cites, in "cites", the IDs of the report nodes it comes from. A node's reports are the targets of its documented_in relations; an observation's report is the one with the same date.
- "highlight" lists the IDs of every node the answer is about, plus the reports it cites.
- If the record does not answer the question, say so in a single line with empty cites and an empty highlight.
- The question may be a speech transcript: allow for misheard words (for example "pembro" for pembrolizumab) and short follow-ups that refer to earlier turns.

Reply with only a JSON object of this shape: {"lines": [{"text": "...", "cites": ["r1"]}], "highlight": ["r1"]}

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


def clean(answer: GraphAnswer, graph: Graph) -> dict[str, Any]:
    """Keeps only what the UI can show: citations of real reports, highlights of real nodes."""
    ids = {node.id for node in graph.nodes}
    reports = {node.id for node in graph.nodes if node.type == REPORT}
    lines = []
    for line in answer.lines[:MAX_LINES]:
        text = " ".join(line.text.split())
        if text:
            lines.append({"text": text, "cites": list(dict.fromkeys(c for c in line.cites if c in reports))})
    cited = [c for line in lines for c in line["cites"]]
    highlight = list(dict.fromkeys([h for h in answer.highlight if h in ids] + cited))
    return {"lines": lines, "highlight": highlight}


_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)


def parse_text(text: str) -> GraphAnswer:
    """Recovers the answer from raw model text: drops reasoning tags and code fences, reads the JSON object."""
    text = _THINK.sub("", text)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("No JSON object in the model's reply")
    return GraphAnswer.model_validate(json.loads(text[start : end + 1]))


class AnswerError(Exception):
    """The model replied, but not with a usable answer."""


class ChatModel(Protocol):
    def with_structured_output(self, schema: Any, **kwargs: Any) -> Any: ...


class Answerer:
    def __init__(self, model: ChatModel, name: str) -> None:
        self.name = name
        # include_raw: a parse failure comes back with the raw reply instead of raising, so an
        # open model that wraps its JSON in reasoning or fences can still be read.
        self._structured = model.with_structured_output(GraphAnswer, method="json_schema", include_raw=True)

    async def answer(self, request: AskRequest) -> dict[str, Any]:
        result = await asyncio.wait_for(self._structured.ainvoke(build_messages(request)), TIMEOUT_S)
        parsed = result.get("parsed")
        if not isinstance(parsed, GraphAnswer):
            raw = result.get("raw")
            try:
                parsed = parse_text(_text_of(raw))
            except (ValueError, ValidationError) as error:
                log.warning("Unusable answer from %s: %s", self.name, result.get("parsing_error") or error)
                raise AnswerError("The language model did not return a usable answer") from error
        answer = clean(parsed, request.graph)
        if not answer["lines"]:
            raise AnswerError("The language model returned an empty answer")
        return answer


def _text_of(message: Any) -> str:
    if message is None:
        return ""
    text = getattr(message, "text", None)
    if isinstance(text, str):
        return text
    content = getattr(message, "content", "")
    return content if isinstance(content, str) else json.dumps(content)


def load_answerer(model_name: str) -> Answerer | None:
    """Builds the answerer, or None (logged) when the provider package or its API key is missing."""
    from langchain.chat_models import init_chat_model

    try:
        model = init_chat_model(model_name, max_tokens=MAX_TOKENS)
    except Exception as error:  # Missing key or provider package: answers fall back to the scripted ones.
        reason = " ".join(str(error).split())[:240] or type(error).__name__
        log.warning("LLM answers are off (%s); set the provider's API key, e.g. FIREWORKS_API_KEY. %s", model_name, reason)
        return None
    log.info("LLM answers from %s", model_name)
    return Answerer(model, model_name)

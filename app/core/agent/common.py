"""Shared types and OpenAI helpers for StockGraph agents."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Literal, TypedDict

from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()

NEWS_MODEL = os.getenv("NEWS_MODEL", "gpt-4o-mini")
FINANCIAL_MODEL = os.getenv("FINANCIAL_MODEL", "gpt-4o-mini")
MANAGER_MODEL = os.getenv("MANAGER_MODEL", "gpt-4.1")

AgentName = Literal["news", "financial", "manager"]


class ChatMessage(TypedDict):
    role: Literal["system", "user", "assistant"]
    content: str


@dataclass
class AgentContext:
    """Context snippets and citations collected before an agent LLM call."""

    snippets: list[str] = field(default_factory=list)
    citations: list[str] = field(default_factory=list)
    sources: list[dict[str, str]] = field(default_factory=list)
    graph_paths: list[str] = field(default_factory=list)
    diagnostics: dict = field(default_factory=dict)


_client: AsyncOpenAI | None = None


def openai_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _client


async def chat_complete(
    messages: list[ChatMessage],
    model: str,
    temperature: float = 0.2,
    response_format: dict | None = None,
) -> str:
    """Run a non-streaming chat completion without LangChain."""
    kwargs = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if response_format is not None:
        kwargs["response_format"] = response_format

    response = await openai_client().chat.completions.create(**kwargs)
    return (response.choices[0].message.content or "").strip()


async def stream_chat(
    messages: list[ChatMessage],
    model: str,
    temperature: float = 0.2,
) -> AsyncIterator[str]:
    """Stream chat tokens directly from the OpenAI async SDK."""
    stream = await openai_client().chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


def trim_history(messages: list[ChatMessage], max_turns: int = 3) -> list[ChatMessage]:
    """Keep the latest user-assistant pairs."""
    pairs: list[tuple[ChatMessage, ChatMessage]] = []
    pending_user: ChatMessage | None = None
    for msg in messages:
        if msg["role"] == "user":
            pending_user = msg
        elif msg["role"] == "assistant" and pending_user is not None:
            pairs.append((pending_user, msg))
            pending_user = None

    flat: list[ChatMessage] = []
    for user, assistant in pairs[-max_turns:]:
        flat.extend([user, assistant])
    return flat


__all__ = [
    "AgentContext",
    "AgentName",
    "ChatMessage",
    "NEWS_MODEL",
    "FINANCIAL_MODEL",
    "MANAGER_MODEL",
    "chat_complete",
    "stream_chat",
    "trim_history",
]

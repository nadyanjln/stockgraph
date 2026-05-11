"""Runtime orchestrator for StockGraph's multi-agent chat flow."""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from typing import AsyncIterator

from app.core.agent.common import AgentContext, ChatMessage, trim_history
from app.core.agent.financial_agent import run_financial_agent
from app.core.agent.manager_agent import (
    manager_plan,
    manager_synthesizer_messages,
    stream_synthesis,
    synthesize_answer,
)
from app.core.agent.news_agent import run_news_agent
from app.services.database.graphrag_engine import GraphRAGEngine

HISTORY_TURNS = 3


@dataclass
class Session:
    session_id: str
    history: list[ChatMessage] = field(default_factory=list)


class SessionStore:
    """In-memory session store with automatic history trimming."""

    def __init__(self, max_turns: int = HISTORY_TURNS):
        self._sessions: dict[str, Session] = {}
        self._max_turns = max_turns

    def get_or_create(self, session_id: str | None = None) -> Session:
        sid = session_id or str(uuid.uuid4())
        if sid not in self._sessions:
            self._sessions[sid] = Session(session_id=sid)
        return self._sessions[sid]

    def append(self, session_id: str, user_msg: str, ai_msg: str) -> None:
        session = self.get_or_create(session_id)
        session.history.append({"role": "user", "content": user_msg})
        session.history.append({"role": "assistant", "content": ai_msg})
        session.history = trim_history(session.history, self._max_turns)

    def history(self, session_id: str) -> list[ChatMessage]:
        return self.get_or_create(session_id).history

    def clear(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


class Orchestrator:
    """
    Coordinate manager, news, and financial agents without LangChain.

    Graph context retrieval stays in GraphRAG-SDK. Realtime typing is produced by
    OpenAI async streaming and forwarded through the FastAPI WebSocket.
    """

    def __init__(self, engine: GraphRAGEngine, session_store: SessionStore | None = None):
        self._engine = engine
        self.sessions = session_store or SessionStore()

    async def _run_specialists(
        self,
        question: str,
        year: int,
        agents: list[str],
        history: list[ChatMessage],
    ) -> tuple[dict[str, str], list[str]]:
        tasks = []
        if "news" in agents:
            tasks.append(("news", run_news_agent(question, year, history, self._engine)))
        if "financial" in agents:
            tasks.append(("financial", run_financial_agent(question, year, history, self._engine)))

        results = await asyncio.gather(*(task for _, task in tasks), return_exceptions=True)

        sub_answers: dict[str, str] = {}
        sub_citations: list[str] = []
        for (name, _), result in zip(tasks, results):
            if isinstance(result, Exception):
                sub_answers[name] = f"[error: {result}]"
                continue
            answer, ctx = result
            sub_answers[name] = answer
            if isinstance(ctx, AgentContext):
                sub_citations.extend(ctx.citations)

        return sub_answers, list(dict.fromkeys(sub_citations))[:8]

    async def run(self, session_id: str, question: str) -> dict:
        """Run the full flow without token streaming."""
        history = self.sessions.history(session_id)
        plan = await manager_plan(question, history, self._engine.available_years)
        sub_answers, sub_citations = await self._run_specialists(
            question,
            plan.year,
            plan.agents,
            history,
        )
        messages = manager_synthesizer_messages(question, history, sub_answers, sub_citations)
        final_answer = await synthesize_answer(messages)
        self.sessions.append(session_id, question, final_answer)
        return {
            "plan": plan,
            "target_year": plan.year,
            "sub_answers": sub_answers,
            "sub_citations": sub_citations,
            "final_answer": final_answer,
        }

    async def run_stream(
        self,
        session_id: str,
        question: str,
    ) -> AsyncIterator[dict]:
        """Stream manager planning, specialist completion, and final answer tokens."""
        history = self.sessions.history(session_id)

        try:
            plan = await manager_plan(question, history, self._engine.available_years)
            yield {
                "type": "plan",
                "agents": plan.agents,
                "year": plan.year,
                "rationale": plan.rationale,
            }

            tasks = []
            if "news" in plan.agents:
                yield {"type": "agent_start", "agent": "news"}
                tasks.append(("news", run_news_agent(question, plan.year, history, self._engine)))
            if "financial" in plan.agents:
                yield {"type": "agent_start", "agent": "financial"}
                tasks.append((
                    "financial",
                    run_financial_agent(question, plan.year, history, self._engine),
                ))

            results = await asyncio.gather(*(task for _, task in tasks), return_exceptions=True)
            sub_answers: dict[str, str] = {}
            sub_citations: list[str] = []
            for (name, _), result in zip(tasks, results):
                if isinstance(result, Exception):
                    sub_answers[name] = f"[error: {result}]"
                    yield {"type": "agent_done", "agent": name, "preview": str(result)[:120]}
                    continue

                answer, ctx = result
                sub_answers[name] = answer
                if isinstance(ctx, AgentContext):
                    sub_citations.extend(ctx.citations)
                yield {
                    "type": "agent_done",
                    "agent": name,
                    "preview": answer[:160] + ("..." if len(answer) > 160 else ""),
                }

            sub_citations = list(dict.fromkeys(sub_citations))[:8]
            messages = manager_synthesizer_messages(
                question,
                history,
                sub_answers,
                sub_citations,
            )

            full_answer_parts: list[str] = []
            async for delta in stream_synthesis(messages):
                full_answer_parts.append(delta)
                yield {"type": "token", "delta": delta}

            final_answer = "".join(full_answer_parts).strip()
            self.sessions.append(session_id, question, final_answer)

            yield {
                "type": "final",
                "answer": final_answer,
                "citations": sub_citations,
                "year": plan.year,
                "agents": plan.agents,
            }

        except Exception as exc:
            yield {"type": "error", "message": f"{type(exc).__name__}: {exc}"}


__all__ = ["Orchestrator", "SessionStore", "Session", "HISTORY_TURNS"]


"""News analyst agent."""

from __future__ import annotations

from app.core.agent.common import AgentContext, ChatMessage, NEWS_MODEL, chat_complete
from app.services.database.graphrag_engine import GraphRAGEngine

NEWS_SYSTEM = """\
Kamu adalah News Analyst spesialis pasar saham Indonesia (BEI).
Tugasmu: menganalisis berita terkini dan sentimennya terhadap emiten BEI berdasarkan
konteks dari knowledge graph. Fokus pada peristiwa, kebijakan, dan tokoh yang relevan.

Aturan:
- Jawab ringkas dalam Bahasa Indonesia.
- Cantumkan sitasi sumber dari context bila tersedia.
- Jika konteks tidak cukup, katakan "data berita tidak cukup untuk tahun X".
"""


async def retrieve_news_context(
    engine: GraphRAGEngine,
    question: str,
    year: int,
    limit: int = 6,
) -> AgentContext:
    """Retrieve news context via GraphRAG-SDK natural-language completion."""
    result = await engine.query(
        (
            "Ambil konteks berita saja untuk menjawab pertanyaan berikut. "
            "Fokus pada peristiwa, kebijakan, tokoh, sentimen, URL sumber, "
            f"dan dampaknya ke emiten. Pertanyaan: {question}"
        ),
        year=year,
        return_context=True,
    )
    snippets = result.context[:limit] or [result.answer]
    return AgentContext(snippets=snippets, citations=result.citations[:6])


async def run_news_agent(
    question: str,
    year: int,
    history: list[ChatMessage],
    engine: GraphRAGEngine,
) -> tuple[str, AgentContext]:
    """Answer using news-related graph context."""
    ctx = await retrieve_news_context(engine, question, year)
    if not ctx.snippets:
        return ("Tidak ditemukan berita relevan di graph.", ctx)

    context_block = "\n".join(ctx.snippets)
    messages: list[ChatMessage] = [
        {"role": "system", "content": NEWS_SYSTEM},
        *history[-6:],
        {"role": "user", "content": (
            f"Pertanyaan: {question}\n\n"
            f"Konteks berita (year={year}):\n{context_block}\n\n"
            f"Berikan analisis singkat berbasis berita."
        )},
    ]
    answer = await chat_complete(messages, model=NEWS_MODEL, temperature=0.3)
    return (answer, ctx)


__all__ = ["NEWS_SYSTEM", "retrieve_news_context", "run_news_agent"]

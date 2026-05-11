"""Financial analyst agent."""

from __future__ import annotations

from app.core.agent.common import AgentContext, ChatMessage, FINANCIAL_MODEL, chat_complete
from app.services.database.graphrag_engine import GraphRAGEngine

FINANCIAL_SYSTEM = """\
Kamu adalah Financial Analyst spesialis emiten BEI.
Tugasmu: menganalisis fundamental keuangan (revenue, laba, aset, ekuitas, EPS, ROE)
berdasarkan data IDX yang tersimpan di knowledge graph.

Aturan:
- Jawab ringkas dalam Bahasa Indonesia.
- Sajikan angka dengan unit (triliun rupiah / persen).
- Jika ada perbandingan multi-tahun, tampilkan tren YoY.
- Jika data tidak ada, katakan "data fundamental tidak ditemukan untuk Y".
"""


async def retrieve_financial_context(
    engine: GraphRAGEngine,
    question: str,
    year: int,
    limit: int = 8,
) -> AgentContext:
    """Retrieve financial context via GraphRAG-SDK natural-language completion."""
    result = await engine.query(
        (
            "Ambil konteks financial statement saja untuk menjawab pertanyaan berikut. "
            "Fokus pada revenue, laba bersih, aset, ekuitas, EPS, tren tahunan, "
            f"dan sumber IDX. Pertanyaan: {question}"
        ),
        year=year,
        return_context=True,
    )
    snippets = result.context[:limit] or [result.answer]
    citations = result.citations[:6] or ([f"IDX FY{year}"] if snippets else [])
    return AgentContext(snippets=snippets, citations=citations)


async def run_financial_agent(
    question: str,
    year: int,
    history: list[ChatMessage],
    engine: GraphRAGEngine,
) -> tuple[str, AgentContext]:
    """Answer using financial statement graph context."""
    ctx = await retrieve_financial_context(engine, question, year)
    if not ctx.snippets:
        return ("Tidak ditemukan data fundamental di graph.", ctx)

    context_block = "\n".join(ctx.snippets)
    messages: list[ChatMessage] = [
        {"role": "system", "content": FINANCIAL_SYSTEM},
        *history[-6:],
        {"role": "user", "content": (
            f"Pertanyaan: {question}\n\n"
            f"Data fundamental (year={year}):\n{context_block}\n\n"
            f"Berikan analisis berbasis angka."
        )},
    ]
    answer = await chat_complete(messages, model=FINANCIAL_MODEL, temperature=0.1)
    return (answer, ctx)


__all__ = ["FINANCIAL_SYSTEM", "retrieve_financial_context", "run_financial_agent"]

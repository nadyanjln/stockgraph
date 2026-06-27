"""Financial analyst agent."""

from __future__ import annotations

import re

from app.core.agent.common import AgentContext, ChatMessage, FINANCIAL_MODEL, chat_complete
from app.services.database.graphrag_engine import GraphRAGEngine
from app.services.database.evidence_retriever import retrieve_local_evidence

FINANCIAL_SYSTEM = """\
Kamu adalah Financial Analyst spesialis emiten BEI.
Tugasmu: menganalisis fundamental keuangan (revenue, laba, aset, ekuitas, EPS, ROE)
berdasarkan data IDX yang tersimpan di knowledge graph.

Aturan:
- Jawab ringkas dalam Bahasa Indonesia.
- Sajikan angka dengan unit (triliun rupiah / persen).
- Jika ada perbandingan multi-tahun, tampilkan tren YoY.
- Gunakan laporan keuangan terbaru yang tersedia dan sebutkan periodenya.
- Jangan membuat nomor sitasi; Manager Agent akan menempatkan sitasi tervalidasi.
- Gunakan hanya angka dan fakta yang muncul pada context retrieval.
- Jika konteks kosong, jelaskan keterbatasan fundamental secara spesifik.
"""


async def retrieve_financial_context(
    engine: GraphRAGEngine,
    question: str,
    year: int,
    limit: int = 8,
) -> AgentContext:
    """Retrieve the latest available financial period plus semantic context."""
    local = retrieve_local_evidence(question, target_year=year, max_hops=2)
    snippets = list(local.financial_snippets[:limit])
    sources = list(local.financial_sources)
    graph_paths = list(local.graph_paths)
    diagnostics = local.diagnostics.as_dict() if local.diagnostics else {}

    financial_year = year
    period = diagnostics.get("financial_period_used", "")
    match = re.search(r"(20\d{2})", str(period))
    if match:
        financial_year = int(match.group(1))

    if financial_year in engine.available_years:
        result = await engine.query(
            (
                "Ambil konteks financial statement saja untuk menjawab pertanyaan berikut. "
                "Fokus pada revenue, laba bersih, aset, ekuitas, EPS, tren tahunan, "
                f"dan sumber IDX. Pertanyaan: {question}"
            ),
            year=financial_year,
            return_context=True,
        )
        if result.context:
            snippets.extend(result.context[: max(0, limit - len(snippets))])
            sources.extend(
                source
                for source in result.sources
                if source.get("source_type") in {"financial_report", "", None}
            )
            diagnostics["vector_chunks_retrieved"] = len(result.context)
            diagnostics.setdefault("retrieval_strategy_used", []).append("graphrag_semantic")
            diagnostics["retrieval_status"] = "semantic_and_provenance_retrieval_success"
        else:
            diagnostics["retrieval_status"] = "semantic_empty_using_provenance_fallback"
    elif snippets:
        diagnostics["retrieval_status"] = "semantic_graph_unavailable_using_provenance_fallback"

    deduped_sources: list[dict[str, str]] = []
    seen: set[str] = set()
    for source in sources:
        key = str(source.get("source_id") or source.get("url") or "").lower()
        if not key or key in seen:
            continue
        seen.add(key)
        deduped_sources.append(source)

    return AgentContext(
        snippets=snippets[:limit],
        citations=[source.get("source_id", "") for source in deduped_sources[:6]],
        sources=deduped_sources[:6],
        graph_paths=graph_paths,
        diagnostics=diagnostics,
    )


async def run_financial_agent(
    question: str,
    year: int,
    history: list[ChatMessage],
    engine: GraphRAGEngine,
) -> tuple[str, AgentContext]:
    """Answer using financial statement graph context."""
    ctx = await retrieve_financial_context(engine, question, year)
    if not ctx.snippets:
        return (
            "Laporan keuangan yang berhasil diproses belum ditemukan pada corpus; "
            "validasi fundamental menjadi terbatas.",
            ctx,
        )

    context_block = "\n".join(ctx.snippets)
    messages: list[ChatMessage] = [
        {"role": "system", "content": FINANCIAL_SYSTEM},
        *history[-6:],
        {"role": "user", "content": (
            f"Pertanyaan: {question}\n\n"
            f"Data fundamental terbaru yang tersedia:\n{context_block}\n\n"
            f"Berikan analisis berbasis angka."
        )},
    ]
    answer = await chat_complete(messages, model=FINANCIAL_MODEL, temperature=0.1)
    return (answer, ctx)


__all__ = ["FINANCIAL_SYSTEM", "retrieve_financial_context", "run_financial_agent"]

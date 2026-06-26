"""News analyst agent."""

from __future__ import annotations

from app.core.agent.common import AgentContext, ChatMessage, NEWS_MODEL, chat_complete
from app.services.database.graphrag_engine import GraphRAGEngine
from app.services.database.evidence_retriever import retrieve_local_evidence

NEWS_SYSTEM = """\
Kamu adalah News Analyst spesialis pasar saham Indonesia (BEI).
Tugasmu: menganalisis berita terkini dan sentimennya terhadap emiten BEI berdasarkan
konteks dari knowledge graph. Fokus pada peristiwa, kebijakan, dan tokoh yang relevan.

Aturan:
- Jawab ringkas dalam Bahasa Indonesia.
- Jangan membuat nomor sitasi; Manager Agent akan menempatkan sitasi tervalidasi.
- Gunakan hanya fakta yang muncul pada context retrieval.
- Jangan menyatakan seluruh data tidak tersedia bila hanya aspek berita yang terbatas.
- Jika konteks berita kosong, jelaskan keterbatasan berita secara spesifik.
"""


async def retrieve_news_context(
    engine: GraphRAGEngine,
    question: str,
    year: int,
    limit: int = 6,
) -> AgentContext:
    """Combine exact ticker/graph traversal with semantic GraphRAG context."""
    local = retrieve_local_evidence(question, target_year=year, max_hops=2, news_limit=limit)
    snippets = list(local.news_snippets[:limit])
    sources = list(local.news_sources[:limit])
    graph_paths = list(local.graph_paths)
    diagnostics = local.diagnostics.as_dict() if local.diagnostics else {}

    if year in engine.available_years:
        result = await engine.query(
            (
                "Ambil konteks berita saja untuk menjawab pertanyaan berikut. "
                "Fokus pada peristiwa, kebijakan, tokoh, sentimen, URL sumber, "
                f"dan dampaknya ke emiten. Pertanyaan: {question}"
            ),
            year=year,
            return_context=True,
        )
        if result.context:
            snippets.extend(result.context[: max(0, limit - len(snippets))])
            sources.extend(
                source
                for source in result.sources
                if source.get("source_type", "news") == "news"
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
        citations=[source.get("source_id", "") for source in deduped_sources[:limit]],
        sources=deduped_sources[:limit],
        graph_paths=graph_paths,
        diagnostics=diagnostics,
    )


async def run_news_agent(
    question: str,
    year: int,
    history: list[ChatMessage],
    engine: GraphRAGEngine,
) -> tuple[str, AgentContext]:
    """Answer using news-related graph context."""
    ctx = await retrieve_news_context(engine, question, year)
    if not ctx.snippets:
        return (
            "Berita relevan belum ditemukan pada corpus saat ini; "
            "analisis faktor eksternal dan sentimen menjadi terbatas.",
            ctx,
        )

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

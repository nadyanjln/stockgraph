"""
GraphRAG-SDK Engine — multi-tenant per-tahun.

Menggunakan FalkorDB GraphRAG-SDK untuk ekstraksi & query graph.
Tiap tahun (mis. 2023, 2024, 2025) punya KnowledgeGraph terpisah dengan ontology
sama (BEI_SCHEMA), sehingga query bisa di-scope per tahun fiskal.

Resource lifecycle:
  - Engine mempertahankan satu connection pool (FalkorDB) untuk semua tahun
  - GraphRAG instance lazy-init per tahun (di-cache)
  - Pakai async context manager via finalize() saat shutdown
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

from dotenv import load_dotenv
from graphrag_sdk import (
    ConnectionConfig,
    GraphRAG,
    LiteLLM,
    LiteLLMEmbedder,
)

from app.services.database.graph_builder import (
    GRAPH_PREFIX,
    GraphStats,
    IngestDocument,
    graph_name_for_year,
    list_year_graphs,
)

load_dotenv()

try:
    from app.services.database.schema import BEI_SCHEMA
except Exception:
    BEI_SCHEMA = None


@dataclass
class QueryResult:
    question: str
    answer: str
    year: int
    context: list[str] = field(default_factory=list)
    citations: list[str] = field(default_factory=list)


class GraphRAGEngine:
    """
    Multi-tenant GraphRAG manager.

    Usage:
        engine = GraphRAGEngine()
        await engine.initialize()  # lazy, hanya tahun yang ada di FalkorDB
        result = await engine.query("Bagaimana performa BBCA?", year=2024)
        await engine.close()

    Atau pakai sebagai async context manager:
        async with GraphRAGEngine() as engine:
            ...
    """

    def __init__(
        self,
        host: str | None = None,
        port: int | None = None,
        llm_model: str = "openai/gpt-4o-mini",
        embedder_model: str = "openai/text-embedding-3-small",
        embedder_dim: int = 256,
    ):
        self._host = host or os.getenv("FALKORDB_HOST", "localhost")
        self._port = port or int(os.getenv("FALKORDB_PORT", 6379))
        self._llm_model = llm_model
        self._embedder_model = embedder_model
        self._embedder_dim = embedder_dim
        self._instances: dict[int, GraphRAG] = {}
        self._available_years: list[int] = []

    async def __aenter__(self) -> "GraphRAGEngine":
        await self.initialize()
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.close()

    async def initialize(self) -> None:
        """Discover tahun-tahun graph yang sudah ada di FalkorDB."""
        self._available_years = list_year_graphs(self._host, self._port)
        print(f"[GraphRAG] Available years: {self._available_years}")

    @property
    def available_years(self) -> list[int]:
        return self._available_years

    async def _get_or_create(self, year: int) -> GraphRAG:
        """Lazy-init GraphRAG instance untuk satu tahun (cached)."""
        if year in self._instances:
            return self._instances[year]

        kwargs = {
            "connection": ConnectionConfig(
                host=self._host,
                port=self._port,
                graph_name=graph_name_for_year(year),
            ),
            "llm": LiteLLM(model=self._llm_model),
            "embedder": LiteLLMEmbedder(
                model=self._embedder_model, dimensions=self._embedder_dim,
            ),
        }
        if BEI_SCHEMA is not None:
            kwargs["schema"] = BEI_SCHEMA
        try:
            rag = GraphRAG(**kwargs)
        except TypeError:
            kwargs.pop("schema", None)
            rag = GraphRAG(**kwargs)
        await rag.__aenter__()
        self._instances[year] = rag
        return rag

    async def ingest_articles(
        self, year: int, articles: list[tuple[str, str]],
    ) -> None:
        """
        Ingest list (document_id, text) ke knowledge graph tahun-tahun tertentu.

        Args:
            year:     tahun fiskal target
            articles: list (id, text) — biasanya url + body artikel
        """
        rag = await self._get_or_create(year)
        for doc_id, text in articles:
            try:
                await self._ingest_text(rag, text, doc_id)
            except Exception as exc:
                print(f"[GraphRAG {year}] ingest fail {doc_id[:60]}: {exc}")
        await rag.finalize()

    async def ingest_documents(
        self,
        year: int,
        documents: list[IngestDocument],
    ) -> GraphStats:
        """Ingest prepared domain documents using GraphRAG-SDK ``rag.ingest``."""
        rag = await self._get_or_create(year)
        stats = GraphStats(graph_name=graph_name_for_year(year))

        for doc in documents:
            try:
                result = await self._ingest_text(rag, doc.text, doc.document_id)
                stats.documents_ingested += 1
                stats.nodes_created += int(getattr(result, "nodes_created", 0) or 0)
                stats.edges_created += int(
                    getattr(result, "relationships_created", None)
                    or getattr(result, "edges_created", 0)
                    or 0
                )
            except Exception as exc:
                stats.errors += 1
                stats.error_messages.append(f"{doc.document_id}: {exc}")

        try:
            await rag.finalize()
        except Exception as exc:
            stats.errors += 1
            stats.error_messages.append(f"finalize: {exc}")

        return stats

    async def _ingest_text(self, rag: GraphRAG, text: str, document_id: str):
        """Call GraphRAG-SDK ingest across minor API variants."""
        try:
            return await rag.ingest(document_id, text=text)
        except TypeError:
            try:
                return await rag.ingest(text=text, document_id=document_id)
            except TypeError:
                return await rag.ingest(text)

    async def query(
        self,
        question: str,
        year: int | None = None,
        return_context: bool = True,
    ) -> QueryResult:
        """
        Query knowledge graph satu tahun. Default: tahun terbaru yang tersedia.
        """
        target_year = year or (self._available_years[-1] if self._available_years else 0)
        if target_year == 0:
            return QueryResult(
                question=question, answer="Belum ada data graph.", year=0,
            )

        rag = await self._get_or_create(target_year)
        try:
            response = await rag.completion(question, return_context=return_context)
        except Exception as exc:
            return QueryResult(
                question=question,
                answer=f"[Error query year={target_year}]: {exc}",
                year=target_year,
            )

        ctx_lines: list[str] = []
        citations: list[str] = []
        ctx = getattr(response, "context", None)
        if ctx:
            for item in ctx:
                if isinstance(item, str):
                    ctx_lines.append(item)
                elif isinstance(item, dict):
                    src = item.get("source") or item.get("document_id")
                    if src:
                        citations.append(str(src))
                    snippet = item.get("text") or str(item)
                    ctx_lines.append(snippet[:500])

        return QueryResult(
            question=question,
            answer=getattr(response, "answer", str(response)),
            year=target_year,
            context=ctx_lines[:8],
            citations=list(dict.fromkeys(citations))[:8],
        )

    async def close(self) -> None:
        """Cleanup semua GraphRAG instances."""
        for rag in self._instances.values():
            try:
                await rag.__aexit__(None, None, None)
            except Exception:
                pass
        self._instances.clear()


def reset_graph(year: int, host: str | None = None, port: int | None = None) -> None:
    """Deprecated placeholder.

    Graph lifecycle should be managed by GraphRAG-SDK/FalkorDB administration
    tooling. The application no longer issues raw graph deletion operations.
    """
    _ = (year, host, port)
    print("[reset] skipped; manage graph deletion via FalkorDB/GraphRAG-SDK admin tooling")


__all__ = ["GraphRAGEngine", "QueryResult", "reset_graph", "GRAPH_PREFIX"]

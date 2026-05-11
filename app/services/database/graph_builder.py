"""
GraphRAG-SDK graph builder for StockGraph.

This module intentionally does not write Cypher. It converts crawled news and
IDX/yfinance financial data into domain documents, then delegates graph
construction to GraphRAG-SDK through ``rag.ingest`` via ``GraphRAGEngine``.

Graph naming convention: ``stockgraph_{year}``, for example ``stockgraph_2024``.
"""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv

from app.core.extractor.relevance_checker import CheckedResult
from app.services.crawler.financial_fetcher import FundamentalData, YearlySnapshot
from app.services.crawler.news_crawler import Article

load_dotenv()

GRAPH_PREFIX = "stockgraph"
REGISTRY_PATH = Path(os.getenv("STOCKGRAPH_REGISTRY", ".stockgraph_registry.json"))

SECTOR_BY_STOCK: dict[str, str] = {
    "BBCA": "perbankan", "BBRI": "perbankan", "BMRI": "perbankan", "BBNI": "perbankan",
    "BNGA": "perbankan", "BTPS": "perbankan", "PNBN": "perbankan", "BJTM": "perbankan",
    "TLKM": "telekomunikasi", "EXCL": "telekomunikasi", "ISAT": "telekomunikasi",
    "ASII": "otomotif", "AUTO": "otomotif",
    "UNVR": "consumer", "ICBP": "consumer", "MYOR": "consumer", "HMSP": "consumer",
    "GOTO": "teknologi", "BUKA": "teknologi",
}


@dataclass
class GraphStats:
    nodes_created: int = 0
    nodes_merged: int = 0
    edges_created: int = 0
    edges_merged: int = 0
    errors: int = 0
    error_messages: list[str] = field(default_factory=list)
    graph_name: str = ""
    documents_ingested: int = 0


@dataclass(frozen=True)
class IngestDocument:
    year: int
    document_id: str
    text: str


def graph_name_for_year(year: int) -> str:
    return f"{GRAPH_PREFIX}_{year}"


def _registry() -> dict:
    if not REGISTRY_PATH.exists():
        return {"years": []}
    try:
        return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"years": []}


def _save_registry(data: dict) -> None:
    REGISTRY_PATH.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")


def _register_years(years: Iterable[int]) -> None:
    data = _registry()
    known = {int(y) for y in data.get("years", []) if str(y).isdigit()}
    known.update(int(y) for y in years if int(y) > 0)
    data["years"] = sorted(known)
    _save_registry(data)


def list_year_graphs(host: str | None = None, port: int | None = None) -> list[int]:
    """Return known year graphs from the local SDK registry.

    ``host`` and ``port`` are accepted for backwards compatibility with older
    callers; GraphRAG-SDK owns the actual FalkorDB graph interaction.
    """
    _ = (host, port)
    return sorted(int(y) for y in _registry().get("years", []) if str(y).isdigit())


def _publication_year(published: str) -> int:
    if not published:
        return datetime.now().year
    for fmt in ("%a, %d %b %Y %H:%M:%S %Z", "%a, %d %b %Y %H:%M:%S %z", "%Y-%m-%d"):
        try:
            return datetime.strptime(published.strip(), fmt).year
        except ValueError:
            continue
    return datetime.now().year


def _article_document(article: Article) -> IngestDocument:
    year = _publication_year(article.published)
    text = "\n".join([
        "Jenis dokumen: Berita pasar modal Indonesia",
        f"Tahun: {year}",
        f"Kode saham: {article.stock_code}",
        f"Sektor: {SECTOR_BY_STOCK.get(article.stock_code, 'lainnya')}",
        f"Sumber: {article.source}",
        f"URL: {article.url}",
        f"Tanggal publikasi: {article.published}",
        f"Judul: {article.title}",
        "",
        article.text,
    ])
    return IngestDocument(year=year, document_id=article.url, text=text)


def _financial_document(code: str, data: FundamentalData, snap: YearlySnapshot) -> IngestDocument:
    lines = [
        "Jenis dokumen: Laporan keuangan emiten BEI",
        f"Tahun fiskal: {snap.year}",
        f"Kode saham: {code}",
        f"Nama perusahaan: {data.company_name or code}",
        f"Sektor: {SECTOR_BY_STOCK.get(code, 'lainnya')}",
        "Sumber: IDX financial statement dan data pasar terstruktur",
    ]
    metrics = {
        "Pendapatan": snap.revenue,
        "Pendapatan bunga bersih": snap.net_interest_income,
        "Laba bersih": snap.net_profit,
        "Total aset": snap.total_assets,
        "Total ekuitas": snap.total_equity,
        "Total utang": snap.total_debt,
        "Arus kas operasi": snap.operating_cash_flow,
        "EPS": snap.eps,
    }
    for label, value in metrics.items():
        if value is not None:
            lines.append(f"{label}: {value}")
    if snap.pdf_path:
        lines.append(f"Referensi IDX PDF: {snap.pdf_path}")
    if snap.raw_text:
        lines.extend(["", "Kutipan laporan:", snap.raw_text[:4000]])

    return IngestDocument(
        year=snap.year,
        document_id=f"idx:{code}:{snap.year}",
        text="\n".join(lines),
    )


def _documents_from_news(
    checked_results: dict[str, list[CheckedResult]],
    articles: dict[str, list[Article]],
    only_passed: bool,
) -> list[IngestDocument]:
    passed_refs: set[str] = set()
    for items in checked_results.values():
        for checked in items:
            if only_passed and not checked.score.passed:
                continue
            if checked.extraction.source_type == "news":
                passed_refs.add(checked.extraction.source_ref)

    docs: list[IngestDocument] = []
    for article_list in articles.values():
        for article in article_list:
            if not only_passed or article.url in passed_refs:
                docs.append(_article_document(article))
    return docs


def _documents_from_financial(financial_data: dict[str, FundamentalData]) -> list[IngestDocument]:
    docs: list[IngestDocument] = []
    for code, data in financial_data.items():
        for snap in data.historical:
            if snap.year > 0:
                docs.append(_financial_document(code, data, snap))
    return docs


def _merge_stats(target: GraphStats, source: GraphStats) -> None:
    target.nodes_created += source.nodes_created
    target.nodes_merged += source.nodes_merged
    target.edges_created += source.edges_created
    target.edges_merged += source.edges_merged
    target.errors += source.errors
    target.error_messages.extend(source.error_messages)
    target.documents_ingested += source.documents_ingested


async def build_graph_multi_tenant_async(
    checked_results: dict[str, list[CheckedResult]],
    articles: dict[str, list[Article]],
    financial_data: dict[str, FundamentalData],
    only_passed: bool = True,
    host: str | None = None,
    port: int | None = None,
) -> dict[int, GraphStats]:
    docs = [
        *_documents_from_news(checked_results, articles, only_passed),
        *_documents_from_financial(financial_data),
    ]

    grouped: dict[int, list[IngestDocument]] = {}
    for doc in docs:
        grouped.setdefault(doc.year, []).append(doc)

    from app.services.database.graphrag_engine import GraphRAGEngine

    stats_by_year: dict[int, GraphStats] = {}
    async with GraphRAGEngine(host=host, port=port) as engine:
        for year, year_docs in sorted(grouped.items()):
            stats = await engine.ingest_documents(year, year_docs)
            stats_by_year[year] = stats
            print(
                f"[{stats.graph_name}] ingested={stats.documents_ingested}, "
                f"nodes={stats.nodes_created}, edges={stats.edges_created}, errors={stats.errors}"
            )

    _register_years(stats_by_year)
    return stats_by_year


def build_graph_multi_tenant(
    checked_results: dict[str, list[CheckedResult]],
    articles: dict[str, list[Article]],
    financial_data: dict[str, FundamentalData],
    only_passed: bool = True,
    host: str | None = None,
    port: int | None = None,
) -> dict[int, GraphStats]:
    return asyncio.run(
        build_graph_multi_tenant_async(
            checked_results, articles, financial_data, only_passed, host, port,
        )
    )


def build_news_graph(
    checked_results: dict[str, list[CheckedResult]],
    articles: dict[str, list[Article]],
    only_passed: bool = True,
    host: str | None = None,
    port: int | None = None,
) -> dict[int, GraphStats]:
    return build_graph_multi_tenant(checked_results, articles, {}, only_passed, host, port)


def build_financial_graph(
    financial_data: dict[str, FundamentalData],
    host: str | None = None,
    port: int | None = None,
) -> dict[int, GraphStats]:
    return build_graph_multi_tenant({}, {}, financial_data, True, host, port)


def validate_graph(year: int, host: str | None = None, port: int | None = None) -> dict:
    _ = (host, port)
    years = list_year_graphs()
    return {
        "year": year,
        "graph_name": graph_name_for_year(year),
        "exists": year in years,
        "available_years": years,
        "note": "Graph details are managed by GraphRAG-SDK; no raw Cypher validation is executed.",
    }

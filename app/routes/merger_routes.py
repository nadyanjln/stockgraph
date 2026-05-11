"""Pipeline routes for crawling, financial fetch, extraction, and SDK ingestion."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.core.extractor.llm_extractor import extract_all, extract_search_keywords
from app.core.extractor.relevance_checker import filter_results
from app.services.crawler.financial_fetcher import fetch_multiple
from app.services.crawler.news_crawler import crawl_by_keywords
from app.services.database.graph_builder import build_graph_multi_tenant_async

router = APIRouter(prefix="/api/merger", tags=["merger"])


class MergerPipelineRequest(BaseModel):
    stock_codes: list[str] = Field(..., min_length=1)
    question: str = ""
    max_articles: int = Field(default=4, ge=1, le=20)
    threshold: float = Field(default=0.6, ge=0.0, le=1.0)
    try_idx_pdf: bool = True


@router.post("/pipeline")
async def run_merger_pipeline(req: MergerPipelineRequest, request: Request):
    """
    Run the full StockGraph pipeline and ingest to FalkorDB through GraphRAG-SDK.

    Flow:
      stock codes -> IDX/yfinance financial statements for the last 3 years
      -> Google News crawl -> extraction/filtering -> GraphRAG-SDK rag.ingest
      per fiscal year.
    """

    def crawl_and_extract():
        keywords: dict[str, list[str]] = {}
        articles: dict = {}
        seed = req.question or f"Analisis kinerja {' '.join(req.stock_codes)} di BEI"

        financial = fetch_multiple(req.stock_codes, try_idx_pdf=req.try_idx_pdf)

        for code in req.stock_codes:
            kws = extract_search_keywords(code, seed, n=3)
            keywords[code] = kws
            articles[code] = crawl_by_keywords(kws, code, max_total=req.max_articles)

        extractions = extract_all(articles, financial)
        company_names = {c: d.company_name for c, d in financial.items()}
        checked = filter_results(
            extractions,
            company_names=company_names,
            threshold=req.threshold,
        )
        return keywords, articles, financial, checked

    keywords, articles, financial, checked = await asyncio.to_thread(crawl_and_extract)
    stats = await build_graph_multi_tenant_async(checked, articles, financial)

    engine = getattr(request.app.state, "engine", None)
    if engine is not None:
        await engine.initialize()

    return {
        "keywords": keywords,
        "articles_count": {k: len(v) for k, v in articles.items()},
        "financial_count": len(financial),
        "graphs_built": [
            {
                "year": year,
                "graph_name": s.graph_name,
                "documents_ingested": s.documents_ingested,
                "nodes_created": s.nodes_created,
                "edges_created": s.edges_created,
                "errors": s.errors,
                "error_messages": s.error_messages[:5],
            }
            for year, s in stats.items()
        ],
    }

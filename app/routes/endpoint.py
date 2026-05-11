"""General API endpoints for StockGraph."""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.services.database.graph_builder import list_year_graphs, validate_graph

router = APIRouter(prefix="/api", tags=["endpoint"])


class QueryRequest(BaseModel):
    question: str
    year: int | None = None


@router.get("/health")
async def health(request: Request):
    engine = getattr(request.app.state, "engine", None)
    return {
        "status": "ok",
        "engine_ready": engine is not None,
        "years": engine.available_years if engine else list_year_graphs(),
    }


@router.get("/years")
async def get_years():
    years = list_year_graphs()
    return {"years": years, "default": years[-1] if years else None}


@router.get("/validate/{year}")
async def get_validate(year: int):
    return validate_graph(year)


@router.post("/query")
async def query_graph(req: QueryRequest, request: Request):
    engine = getattr(request.app.state, "engine", None)
    if engine is None:
        return {"error": "GraphRAG engine is not initialized"}
    result = await engine.query(req.question, year=req.year, return_context=True)
    return {
        "question": result.question,
        "answer": result.answer,
        "year": result.year,
        "citations": result.citations,
        "context": result.context,
    }


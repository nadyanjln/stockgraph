"""PyMuPDF-only PDF extraction helpers for financial reports."""

from __future__ import annotations

import contextlib
import io
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import fitz

from app.utils.logger import get_logger

logger = get_logger("stockgraph.pdf")

MIN_PAGE_TEXT_CHARS = 80


@dataclass
class PdfPageExtraction:
    text: str
    page_number: int
    source_file: str
    extraction_method: str = "pymupdf"
    document_type: str = "financial_report"
    document_year: int | None = None
    ticker: str = ""
    company: str = ""
    needs_review: bool = False
    extraction_warning: str = ""
    tables: list[dict[str, Any]] = field(default_factory=list)
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class PdfExtractionResult:
    source_file: str
    pages: list[PdfPageExtraction] = field(default_factory=list)
    error: str = ""

    @property
    def text(self) -> str:
        return combine_page_text(self.pages)

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_file": self.source_file,
            "pages": [page.to_dict() for page in self.pages],
            "error": self.error,
        }


def extract_pdf_pages(
    pdf_source: str | bytes,
    *,
    source_file: str = "",
    document_type: str = "financial_report",
    document_year: int | None = None,
    ticker: str = "",
    company: str = "",
    min_chars: int = MIN_PAGE_TEXT_CHARS,
) -> PdfExtractionResult:
    """Extract ordered page text and table markdown using only PyMuPDF."""
    resolved_source = _source_name(pdf_source, source_file)
    logger.info("Processing PDF %s with PyMuPDF", resolved_source)

    try:
        doc = _open_pdf(pdf_source)
    except Exception as exc:  # noqa: BLE001 - callers may batch many PDFs.
        logger.error("Failed to open PDF %s: %s", resolved_source, exc)
        return PdfExtractionResult(source_file=resolved_source, error=str(exc))

    pages: list[PdfPageExtraction] = []
    empty_or_short_pages = 0
    total_tables = 0

    try:
        total_pages = len(doc)
        logger.info("PDF %s opened; total_pages=%s", resolved_source, total_pages)

        for page_number, page in enumerate(doc, start=1):
            try:
                text = clean_pdf_text(page.get_text("text", sort=True) or "")
                tables = extract_page_tables(page, text)
                table_text = "\n\n".join(table["markdown"] for table in tables)
                page_text = _join_page_text(text, table_text)
                needs_review = len(text) < min_chars
                warning = (
                    "Native PDF text extraction returned insufficient content"
                    if needs_review
                    else ""
                )
                if needs_review:
                    empty_or_short_pages += 1
                total_tables += len(tables)

                pages.append(
                    PdfPageExtraction(
                        text=page_text,
                        page_number=page_number,
                        source_file=resolved_source,
                        extraction_method="pymupdf",
                        document_type=document_type,
                        document_year=document_year,
                        ticker=ticker,
                        company=company,
                        needs_review=needs_review,
                        extraction_warning=warning,
                        tables=tables,
                    )
                )
                logger.info(
                    "PDF page extracted; file=%s page=%s chars=%s tables=%s review=%s",
                    resolved_source,
                    page_number,
                    len(text),
                    len(tables),
                    needs_review,
                )
            except Exception as exc:  # noqa: BLE001 - keep processing pages.
                empty_or_short_pages += 1
                logger.warning(
                    "PDF page extraction failed; file=%s page=%s error=%s",
                    resolved_source,
                    page_number,
                    exc,
                )
                pages.append(
                    PdfPageExtraction(
                        text="",
                        page_number=page_number,
                        source_file=resolved_source,
                        extraction_method="pymupdf",
                        document_type=document_type,
                        document_year=document_year,
                        ticker=ticker,
                        company=company,
                        needs_review=True,
                        extraction_warning=(
                            "Native PDF text extraction failed for this page"
                        ),
                        error=str(exc),
                    )
                )

        logger.info(
            "PDF extraction summary; file=%s pages=%s extracted=%s review_pages=%s tables=%s",
            resolved_source,
            total_pages,
            len(pages),
            empty_or_short_pages,
            total_tables,
        )
    finally:
        doc.close()

    return PdfExtractionResult(source_file=resolved_source, pages=pages)


def extract_pdf_documents(pdf_sources: list[str | bytes]) -> list[PdfExtractionResult]:
    """Batch PDF extraction where a broken PDF does not stop later files."""
    return [extract_pdf_pages(pdf_source) for pdf_source in pdf_sources]


def combine_page_text(pages: list[PdfPageExtraction]) -> str:
    chunks: list[str] = []
    for page in pages:
        if not page.text.strip():
            continue
        header_parts = [
            f"source_file={page.source_file}",
            f"page_number={page.page_number}",
            "extraction_method=pymupdf",
            f"document_type={page.document_type}",
        ]
        if page.document_year:
            header_parts.append(f"document_year={page.document_year}")
        if page.ticker:
            header_parts.append(f"ticker={page.ticker}")
        if page.company:
            header_parts.append(f"company={page.company}")
        chunks.append(f"[{'; '.join(header_parts)}]\n{page.text.strip()}")
    return "\n\n".join(chunks)


def clean_pdf_text(text: str) -> str:
    text = text.replace("\x00", "")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    compact_lines: list[str] = []
    blank_seen = False
    for line in lines:
        if not line:
            if not blank_seen and compact_lines:
                compact_lines.append("")
            blank_seen = True
            continue
        compact_lines.append(line)
        blank_seen = False
    return "\n".join(compact_lines).strip()


def extract_page_tables(page: fitz.Page, native_text: str) -> list[dict[str, Any]]:
    find_tables = getattr(page, "find_tables", None)
    if not callable(find_tables):
        return []

    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(
            io.StringIO()
        ):
            table_finder = find_tables()
    except Exception as exc:  # noqa: BLE001 - table extraction is best-effort.
        logger.warning("PyMuPDF table detection failed on page %s: %s", page.number + 1, exc)
        return []

    tables: list[dict[str, Any]] = []
    for table_index, table in enumerate(getattr(table_finder, "tables", []) or [], start=1):
        try:
            rows = table.extract()
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "PyMuPDF table extraction failed on page %s table=%s: %s",
                page.number + 1,
                table_index,
                exc,
            )
            continue
        markdown = table_rows_to_markdown(rows)
        if not markdown or _is_duplicate_table(markdown, native_text):
            continue
        tables.append({
            "page_number": page.number + 1,
            "table_index": table_index,
            "extraction_method": "pymupdf",
            "markdown": markdown,
        })
    return tables


def table_rows_to_markdown(rows: list[list[Any]]) -> str:
    cleaned_rows = [
        [clean_pdf_text("" if cell is None else str(cell)) for cell in row]
        for row in rows
        if row
    ]
    cleaned_rows = [row for row in cleaned_rows if any(cell for cell in row)]
    if not cleaned_rows:
        return ""

    width = max(len(row) for row in cleaned_rows)
    normalized = [row + [""] * (width - len(row)) for row in cleaned_rows]
    header = normalized[0]
    separator = ["---"] * width
    body = normalized[1:]
    markdown_rows = [header, separator, *body]
    return "\n".join(
        "| " + " | ".join(_escape_markdown_cell(cell) for cell in row) + " |"
        for row in markdown_rows
    )


def _open_pdf(pdf_source: str | bytes) -> fitz.Document:
    if isinstance(pdf_source, str):
        return fitz.open(pdf_source)
    return fitz.open(stream=pdf_source, filetype="pdf")


def _source_name(pdf_source: str | bytes, source_file: str) -> str:
    if source_file:
        return source_file
    if isinstance(pdf_source, str):
        return Path(pdf_source).name
    return "<bytes>"


def _join_page_text(text: str, table_text: str) -> str:
    if text and table_text:
        return f"{text}\n\n### Tables detected by PyMuPDF\n{table_text}"
    return text or table_text


def _is_duplicate_table(markdown: str, native_text: str) -> bool:
    table_words = set(re.findall(r"\w+", markdown.lower()))
    text_words = set(re.findall(r"\w+", native_text.lower()))
    if len(table_words) < 4:
        return True
    overlap = len(table_words & text_words) / len(table_words)
    return overlap > 0.85


def _escape_markdown_cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


__all__ = [
    "PdfExtractionResult",
    "PdfPageExtraction",
    "clean_pdf_text",
    "combine_page_text",
    "extract_pdf_documents",
    "extract_pdf_pages",
    "extract_page_tables",
    "table_rows_to_markdown",
]

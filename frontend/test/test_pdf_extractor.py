import os
import sys

import fitz

from app.services.pdf_extractor import extract_pdf_documents, extract_pdf_pages


def _pdf_bytes_with_text(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def _blank_pdf_bytes() -> bytes:
    doc = fitz.open()
    doc.new_page()
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def test_text_pdf_extracts_with_pymupdf_and_page_metadata():
    pdf_bytes = _pdf_bytes_with_text(
        "Laporan Keuangan BBCA 2024\nTotal aset 1.234.567\nLaba bersih 123.456"
        "\nPendapatan bunga bersih dan catatan laporan keuangan tersedia lengkap."
    )

    result = extract_pdf_pages(pdf_bytes, source_file="bbca-2024.pdf")

    assert result.error == ""
    assert len(result.pages) == 1
    page = result.pages[0]
    assert page.extraction_method == "pymupdf"
    assert page.page_number == 1
    assert page.source_file == "bbca-2024.pdf"
    assert page.document_type == "financial_report"
    assert "Total aset" in page.text
    assert page.needs_review is False


def test_blank_page_is_marked_for_review_without_ocr():
    result = extract_pdf_pages(_blank_pdf_bytes(), source_file="scan-like.pdf")

    assert len(result.pages) == 1
    assert result.pages[0].needs_review is True
    assert result.pages[0].extraction_warning == (
        "Native PDF text extraction returned insufficient content"
    )
    assert result.pages[0].extraction_method == "pymupdf"


def test_pipeline_does_not_import_ocr_engine():
    module_name = "paddle" + "ocr"
    sys.modules.pop(module_name, None)

    extract_pdf_pages(_pdf_bytes_with_text("Normal native text " * 10))

    assert module_name not in sys.modules


def test_pipeline_runs_without_hugging_face_token():
    hf_key = "HF" + "_TOKEN"
    hub_key = "HUGGING" + "FACE_HUB_TOKEN"
    old_hf_token = os.environ.pop(hf_key, None)
    old_hub_token = os.environ.pop(hub_key, None)
    try:
        result = extract_pdf_pages(_pdf_bytes_with_text("Normal native text " * 10))
    finally:
        if old_hf_token is not None:
            os.environ[hf_key] = old_hf_token
        if old_hub_token is not None:
            os.environ[hub_key] = old_hub_token

    assert result.error == ""
    assert result.pages[0].extraction_method == "pymupdf"


def test_broken_pdf_does_not_stop_batch_ingestion():
    good_pdf = _pdf_bytes_with_text("Valid native financial report text " * 8)

    results = extract_pdf_documents([b"not a pdf", good_pdf])

    assert results[0].error
    assert results[1].error == ""
    assert len(results[1].pages) == 1
    assert results[1].pages[0].extraction_method == "pymupdf"

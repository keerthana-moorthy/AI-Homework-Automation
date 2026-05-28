from __future__ import annotations

from typing import Any

from .classification_service import classify_educational_content
from .common import chunk_text, dedupe_preserve_order, normalize_text
from .layout_service import extract_question_candidates, parse_document_layout


def build_document_package(
    *,
    file_name: str | None,
    file_type: str | None,
    route_decision: dict[str, Any],
    ocr_result: dict[str, Any],
    selected_subject: str | None = None,
) -> dict[str, Any]:
    raw_text = normalize_text(ocr_result.get("raw_text"))
    page_texts = ocr_result.get("page_texts") or []
    page_blocks = ocr_result.get("page_blocks") or []
    structured_document_json = parse_document_layout(raw_text=raw_text, page_texts=page_texts, page_blocks=page_blocks)
    question_candidates = extract_question_candidates(structured_document_json)
    layout_chunks = chunk_text(raw_text)

    classification = classify_educational_content(
        text=raw_text or structured_document_json.get("summary") or "",
        structured_document_json=structured_document_json,
        selected_subject=selected_subject,
    )

    return {
        "fileName": file_name,
        "fileType": file_type,
        "route": route_decision,
        "ocr": ocr_result,
        "structuredDocumentJson": structured_document_json,
        "questionCandidates": dedupe_preserve_order(question_candidates),
        "layoutChunks": layout_chunks,
        "classification": classification,
        "rawText": raw_text,
    }


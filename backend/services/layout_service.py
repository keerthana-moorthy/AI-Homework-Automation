from __future__ import annotations

import re
from typing import Any

from .common import dedupe_preserve_order, normalize_text, tokenize


QUESTION_PATTERNS = (
    r"^(?:q\.?|question)\s*\d+[\):.\-]?\s*(.+)$",
    r"^\d+[\).:-]?\s*(.+)$",
    r"^[A-D][\).:-]\s*(.+)$",
)

ANSWER_PREFIXES = ("answer", "ans", "solution", "working")
HEADING_PATTERNS = (
    r"^[A-Z][A-Z0-9\s,:;/\-()]+$",
    r"^[A-Z][A-Za-z0-9\s,:;/\-()]{3,}$",
)


def _split_lines(text: str | None) -> list[str]:
    if not text:
        return []
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [normalize_text(line) for line in normalized.split("\n")]
    return [line for line in lines if line]


def _classify_line(line: str) -> str:
    lowered = line.lower()
    if any(re.match(pattern, line) for pattern in QUESTION_PATTERNS):
        return "question"
    if any(lowered.startswith(prefix) for prefix in ANSWER_PREFIXES):
        return "answer"
    if any(re.match(pattern, line) for pattern in HEADING_PATTERNS) and len(line.split()) <= 8:
        return "heading"
    if "|" in line or "\t" in line:
        return "table"
    if any(symbol in line for symbol in ("=", "+", "-", "×", "÷", "∫", "√")):
        return "equation"
    if any(keyword in lowered for keyword in ("figure", "diagram", "graph", "chart")):
        return "diagram_reference"
    return "paragraph"


def parse_document_layout(
    *,
    raw_text: str | None,
    page_texts: list[dict[str, Any]] | None = None,
    page_blocks: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    lines = _split_lines(raw_text)
    blocks: list[dict[str, Any]] = []
    questions: list[dict[str, Any]] = []
    answers: list[dict[str, Any]] = []
    headings: list[str] = []
    equations: list[str] = []
    tables: list[str] = []
    diagram_references: list[str] = []

    for index, line in enumerate(lines, start=1):
        block_type = _classify_line(line)
        block = {
            "index": index,
            "type": block_type,
            "text": line,
            "tokens": tokenize(line),
        }
        blocks.append(block)

        if block_type == "question":
            questions.append(block)
        elif block_type == "answer":
            answers.append(block)
        elif block_type == "heading":
            headings.append(line)
        elif block_type == "equation":
            equations.append(line)
        elif block_type == "table":
            tables.append(line)
        elif block_type == "diagram_reference":
            diagram_references.append(line)

    if page_blocks:
        for page_block in page_blocks:
            if not isinstance(page_block, dict):
                continue
            text = normalize_text(page_block.get("text") or page_block.get("content"))
            if not text:
                continue
            block_type = _classify_line(text)
            if block_type == "question":
                questions.append({"type": "question", "text": text, "page": page_block.get("pageNum")})
            elif block_type == "answer":
                answers.append({"type": "answer", "text": text, "page": page_block.get("pageNum")})

    semantic_summary = " ".join(headings[:2] + [question["text"] for question in questions[:3]])
    if not semantic_summary:
        semantic_summary = raw_text or ""

    structured_document_json = {
        "summary": normalize_text(semantic_summary),
        "headings": dedupe_preserve_order(headings),
        "questions": dedupe_preserve_order(questions),
        "answers": dedupe_preserve_order(answers),
        "equations": dedupe_preserve_order(equations),
        "tables": dedupe_preserve_order(tables),
        "diagramReferences": dedupe_preserve_order(diagram_references),
        "blocks": blocks,
        "pageTexts": page_texts or [],
    }

    return structured_document_json


def extract_question_candidates(structured_document_json: dict[str, Any]) -> list[str]:
    questions = structured_document_json.get("questions") or []
    if not isinstance(questions, list):
        return []
    candidates: list[str] = []
    for item in questions:
        if isinstance(item, dict):
            text = normalize_text(item.get("text"))
            if text:
                candidates.append(text)
    if candidates:
        return candidates
    blocks = structured_document_json.get("blocks") or []
    fallback: list[str] = []
    for block in blocks:
        if isinstance(block, dict) and block.get("type") in {"question", "equation"}:
            text = normalize_text(block.get("text"))
            if text:
                fallback.append(text)
    return fallback


def extract_answer_regions(structured_document_json: dict[str, Any]) -> list[str]:
    answers = structured_document_json.get("answers") or []
    if not isinstance(answers, list):
        return []
    results: list[str] = []
    for item in answers:
        if isinstance(item, dict):
            text = normalize_text(item.get("text"))
            if text:
                results.append(text)
    return results


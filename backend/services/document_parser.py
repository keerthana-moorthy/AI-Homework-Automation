from __future__ import annotations

from typing import Any

from .classification_service import classify_educational_content
from .common import chunk_text, dedupe_preserve_order, normalize_text
from .layout_service import extract_question_candidates, parse_document_layout
from .common import top_keywords
import re


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


def parse_extracted_text_sections(raw_text: str | None) -> dict[str, Any]:
    """Parse markdown-like extracted text into structured fields.

    Returns keys: summary, mainTopic, keyPoints, importantConcepts, detailedExplanation, finalTakeaways, keywords
    """
    text = normalize_text(raw_text) or ""
    if not text:
        return {"summary": "", "mainTopic": "", "keyPoints": [], "importantConcepts": [], "detailedExplanation": "", "finalTakeaways": "", "keywords": []}

    # Split into lines and look for heading markers (#, ##) or section titles
    lines = [line.strip() for line in re.split(r"\r?\n", text) if line.strip()]

    sections: dict[str, list[str]] = {}
    current = "body"
    sections[current] = []
    heading_re = re.compile(r"^(#{1,3})\s*(.+)$")
    # Also accept '## Key Points' style without '#'
    simple_heading_re = re.compile(r"^(Summary|Main Topic|Key Points|Important Concepts|Detailed Analysis|Final Takeaways):?\s*$", re.IGNORECASE)

    for line in lines:
        m = heading_re.match(line)
        if m:
            current = m.group(2).strip()
            sections[current] = []
            continue
        m2 = simple_heading_re.match(line)
        if m2:
            current = m2.group(1).strip()
            sections[current] = []
            continue
        sections.setdefault(current, []).append(line)

    def join_section(name: str) -> str:
        return "\n".join(sections.get(name, [])).strip()

    # Extract summary
    summary = join_section("Summary") or join_section("summary") or ""
    if not summary:
        # Fallback: first 1-2 sentences of body
        body = join_section("body")
        summary = " ".join(re.split(r"(?<=[\.\?\!])\s+", body)[:2]).strip()

    main_topic = join_section("Main Topic") or ""

    # Key points from bullet lists or numbered lists
    key_points: list[str] = []
    for sec in ("Key Points", "Key points", "key points"):
        content = sections.get(sec) or sections.get(sec.lower())
        if content:
            for line in content:
                m = re.match(r"^[\-\*\•\s]*\s*(.+)$", line)
                if m:
                    key_points.append(m.group(1).strip())
    if not key_points:
        # try to extract bullets from body that look like list items
        for line in sections.get("body", [])[:40]:
            if line.startswith("-") or line.startswith("*"):
                kp = line.lstrip("-*• \t").strip()
                if kp:
                    key_points.append(kp)

    # Important concepts
    important_concepts: list[str] = []
    for sec in ("Important Concepts", "Important concepts", "important concepts"):
        content = sections.get(sec) or sections.get(sec.lower())
        if content:
            for line in content:
                m = re.match(r"^[\-\*\•\s]*\s*(.+)$", line)
                if m:
                    important_concepts.append(m.group(1).strip())
    if not important_concepts:
        # fallback to top keywords
        important_concepts = top_keywords(text, limit=6)

    detailed = join_section("Detailed Analysis") or join_section("Detailed analysis") or join_section("detailedanalysis") or "\n".join(lines)

    final_takeaways = join_section("Final Takeaways") or join_section("Final takeaways") or ""

    keywords = top_keywords(text, limit=8)

    # Clean up key_points/important_concepts duplicates
    key_points = [kp for kp in (key_points or []) if kp]
    important_concepts = [ic for ic in (important_concepts or []) if ic]

    return {
        "summary": normalize_text(summary),
        "mainTopic": normalize_text(main_topic) or (normalize_text(summary).split(".")[0] if summary else ""),
        "keyPoints": key_points[:6],
        "importantConcepts": important_concepts[:6],
        "detailedExplanation": normalize_text(detailed),
        "finalTakeaways": normalize_text(final_takeaways),
        "keywords": keywords,
    }


from __future__ import annotations

import base64
import json
import re
from typing import Any

from .solver import detect_subject
from .llm_router import get_llm_router

try:  # Optional dependency for PDF rendering/text extraction.
    import fitz  # type: ignore
except ImportError:  # pragma: no cover - handled at runtime.
    fitz = None


def normalize_text(text: str) -> str:
    return " ".join(
        str(text or "")
        .replace("â€“", "-")
        .replace("â€”", "-")
        .replace("âˆ’", "-")
        .replace("Ã—", "*")
        .replace("Â·", "*")
        .split()
    ).strip()


def is_pdf(file_type: str | None, file_name: str | None) -> bool:
    mime = (file_type or "").lower()
    name = (file_name or "").lower()
    return mime == "application/pdf" or name.endswith(".pdf")


def is_image(file_type: str | None, file_name: str | None) -> bool:
    mime = (file_type or "").lower()
    name = (file_name or "").lower()
    return mime.startswith("image/") or any(name.endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"))


def _safe_json_loads(content: str) -> dict[str, Any]:
    try:
        parsed = json.loads(content)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            return {}
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}


def _coerce_steps(raw_steps: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_steps, list):
        return []

    steps: list[dict[str, Any]] = []
    for index, step in enumerate(raw_steps, start=1):
        if not isinstance(step, dict):
            continue
        steps.append(
            {
                "stepNum": int(step.get("stepNum") or index),
                "title": str(step.get("title") or f"Step {index}"),
                "desc": str(step.get("desc") or step.get("description") or ""),
            }
        )
    return steps


def _coerce_recommendations(raw_recommendations: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_recommendations, list):
        return []

    recommendations: list[dict[str, Any]] = []
    for index, rec in enumerate(raw_recommendations, start=1):
        if not isinstance(rec, dict):
            continue
        recommendations.append(
            {
                "id": str(rec.get("id") or f"scan-rec-{index}"),
                "emoji": str(rec.get("emoji") or "💡"),
                "title": str(rec.get("title") or "Review the question"),
                "description": str(rec.get("description") or rec.get("desc") or ""),
            }
        )
    return recommendations


def _encode_image_data_url(raw_bytes: bytes, mime_type: str = "image/png") -> str:
    return f"data:{mime_type};base64,{base64.b64encode(raw_bytes).decode('utf-8')}"


def _extract_pdf_text_and_pages(file_bytes: bytes, max_pages: int = 3, zoom: float = 1.6) -> dict[str, Any]:
    if fitz is None:
        return {
            "pageCount": 0,
            "pageTexts": [],
            "pageImages": [],
            "combinedText": "",
        }

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    page_count = doc.page_count
    page_texts: list[dict[str, Any]] = []
    page_images: list[dict[str, Any]] = []
    matrix = fitz.Matrix(zoom, zoom)

    for index in range(min(page_count, max_pages)):
        page = doc.load_page(index)
        extracted_text = normalize_text(page.get_text("text"))
        if extracted_text:
            page_texts.append({"pageNum": index + 1, "text": extracted_text})

        pixmap = page.get_pixmap(matrix=matrix, alpha=False)
        page_images.append(
            {
                "pageNum": index + 1,
                "imageDataUrl": _encode_image_data_url(pixmap.tobytes("png"), "image/png"),
            }
        )

    combined_text = normalize_text(" ".join(item["text"] for item in page_texts))
    return {
        "pageCount": page_count,
        "pageTexts": page_texts,
        "pageImages": page_images,
        "combinedText": combined_text,
    }


def _call_llm_for_scan(
    *,
    file_name: str | None,
    file_type: str | None,
    input_method: str,
    selected_subject: str | None,
    language: str,
    extracted_text: str,
    page_images: list[dict[str, Any]],
) -> dict[str, Any]:
    router = get_llm_router()
    if not router.configured:
        return {}

    subject_hint = selected_subject or "maths"
    payload_description = [
        f"File name: {file_name or 'unknown'}",
        f"File type: {file_type or 'unknown'}",
        f"Input method: {input_method}",
        f"Selected subject hint: {subject_hint}",
        f"Preferred language: {language}",
    ]
    if extracted_text:
        payload_description.append("Extracted PDF text:")
        payload_description.append(extracted_text[:12000])

    content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                "You are a homework OCR and tutoring assistant. "
                "Analyze the scanned homework carefully and return valid JSON only. "
                "The JSON must include questionText, extractedText, detectedSubject, problemType, summary, detailedExplanation, steps, confidence, needsManualReview, and recommendations. "
                "Use simple English suitable for a class 8 student. "
                "Explain the concept or topic behind the question, not just the OCR text. "
                "If the page has multiple questions, choose the primary one and mention the others in the summary. "
                "Preserve equations exactly. "
                "If there is already extracted PDF text, use it together with the images. "
                "Prefer a concise, clean questionText that can be solved by the solver, and make detailedExplanation step-by-step and concept-focused."
            ),
        }
    ]

    content.append(
        {
            "type": "text",
            "text": "\n".join(payload_description),
        }
    )

    for page_image in page_images[:5]:
        content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": page_image["imageDataUrl"],
                },
            }
        )

    completion = router.complete(
        task="ocr_cleanup",
        messages=[
            {
                "role": "user",
                "content": content,
            }
        ],
        temperature=0.2,
        max_completion_tokens=1400,
        response_format={"type": "json_object"},
    )

    message_content = completion.choices[0].message.content or "{}"
    parsed = _safe_json_loads(message_content)
    parsed["model"] = completion.model
    return parsed


def scan_homework_document(
    *,
    file_name: str | None,
    file_type: str | None,
    file_bytes: bytes | None,
    input_method: str,
    subject: str | None,
    language: str,
    question_text: str | None = None,
    transcript: str | None = None,
    notes: str | None = None,
    ocr_text: str | None = None,
) -> dict[str, Any]:
    source_kind = "text"
    if is_pdf(file_type, file_name):
        source_kind = "pdf"
    elif is_image(file_type, file_name):
        source_kind = "image"

    fallback_text = normalize_text(
        question_text
        or ocr_text
        or transcript
        or notes
        or ""
    )

    page_scan: dict[str, Any] = {
        "sourceKind": source_kind,
        "scanMethod": "text",
        "fileName": file_name,
        "fileType": file_type,
        "pageCount": 0,
        "pageTexts": [],
        "pageImages": [],
        "extractedText": fallback_text,
        "questionText": fallback_text,
        "detailedExplanation": "",
        "summary": "",
        "confidence": 0.5,
        "detectedSubject": detect_subject(subject, fallback_text),
        "problemType": "text-input",
        "needsManualReview": False,
        "recommendations": [],
    }

    if not file_bytes:
        if fallback_text:
            page_scan["summary"] = "The question was entered as typed text."
        else:
            page_scan["needsManualReview"] = True
            page_scan["summary"] = "No file or question text was provided."
        return page_scan

    pdf_context = _extract_pdf_text_and_pages(file_bytes) if source_kind == "pdf" else {
        "pageCount": 1,
        "pageTexts": [],
        "pageImages": [{"pageNum": 1, "imageDataUrl": _encode_image_data_url(file_bytes, file_type or "image/png")}],
        "combinedText": "",
    }

    extracted_text = fallback_text or pdf_context.get("combinedText", "")

    groq_result = _call_llm_for_scan(
        file_name=file_name,
        file_type=file_type,
        input_method=input_method,
        selected_subject=subject,
        language=language,
        extracted_text=extracted_text,
        page_images=pdf_context.get("pageImages", []),
    )

    question_text = normalize_text(
        groq_result.get("questionText")
        or groq_result.get("question_text")
        or extracted_text
        or fallback_text
    )

    scan_method = "groq-vision" if groq_result else ("pdf-text" if source_kind == "pdf" and extracted_text else "file-upload")

    detected_subject = groq_result.get("detectedSubject") if isinstance(groq_result.get("detectedSubject"), dict) else None
    if not detected_subject:
        detected_subject = detect_subject(subject, question_text)

    page_scan.update(
        {
            "scanMethod": scan_method,
            "pageCount": pdf_context.get("pageCount", 0),
            "pageTexts": pdf_context.get("pageTexts", []),
            "pageImages": pdf_context.get("pageImages", []),
            "extractedText": extracted_text or question_text,
            "questionText": question_text or extracted_text,
            "detailedExplanation": str(
                groq_result.get("detailedExplanation")
                or groq_result.get("detailed_explanation")
                or groq_result.get("summary")
                or ""
            ),
            "summary": str(groq_result.get("summary") or ""),
            "confidence": float(groq_result.get("confidence") or detected_subject.get("confidence", 0.5)),
            "detectedSubject": detected_subject,
            "problemType": str(groq_result.get("problemType") or groq_result.get("problem_type") or "manual-review"),
            "needsManualReview": bool(groq_result.get("needsManualReview") or groq_result.get("needs_manual_review") or False),
            "recommendations": _coerce_recommendations(groq_result.get("recommendations")),
        }
    )

    raw_steps = groq_result.get("steps")
    if raw_steps:
        page_scan["steps"] = _coerce_steps(raw_steps)

    if groq_result.get("finalAnswer"):
        page_scan["finalAnswer"] = str(groq_result.get("finalAnswer"))
    if groq_result.get("final_answer"):
        page_scan["finalAnswer"] = str(groq_result.get("final_answer"))

    if not page_scan["summary"]:
        if source_kind == "pdf":
            page_scan["summary"] = "The homework was scanned from a PDF. The OCR text was cleaned and prepared for analysis."
        elif source_kind == "image":
            page_scan["summary"] = "The homework was scanned from an image and the visible text was extracted."
        else:
            page_scan["summary"] = "The homework was entered as text."

    if not page_scan["detailedExplanation"] and question_text:
        page_scan["detailedExplanation"] = (
            f"The scan detected the question: {question_text}. "
            "Use the extracted text to continue the step-by-step solution."
        )

    return page_scan

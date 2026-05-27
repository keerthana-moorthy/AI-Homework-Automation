from __future__ import annotations

import base64
import re
from functools import lru_cache
from typing import Any

import numpy as np

from .common import clamp, normalize_text
from .document_router import DocumentRouteDecision
from .llm_router import get_llm_router

try:  # Optional dependency for PDF rendering.
    import fitz  # type: ignore
except ImportError:  # pragma: no cover - handled at runtime.
    fitz = None

try:  # Optional dependency for image preprocessing.
    import cv2  # type: ignore
except ImportError:  # pragma: no cover - handled at runtime.
    cv2 = None

try:  # Optional dependency for OCR.
    import easyocr  # type: ignore
except Exception:  # pragma: no cover - handled at runtime.
    easyocr = None


def _encode_data_url(raw_bytes: bytes, mime_type: str) -> str:
    return f"data:{mime_type};base64,{base64.b64encode(raw_bytes).decode('utf-8')}"


def _image_to_array(image_bytes: bytes) -> np.ndarray | None:
    if cv2 is None:
        return None
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        return None
    return image


def _preprocess_image(image_bytes: bytes) -> bytes:
    if cv2 is None:
        return image_bytes
    image = _image_to_array(image_bytes)
    if image is None:
        return image_bytes

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    denoised = cv2.bilateralFilter(gray, 9, 75, 75)
    adaptive = cv2.adaptiveThreshold(
        denoised,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        11,
    )
    success, buffer = cv2.imencode(".png", adaptive)
    if not success:
        return image_bytes
    return buffer.tobytes()


@lru_cache(maxsize=1)
def _easyocr_reader():
    if easyocr is None:
        return None
    try:
        return easyocr.Reader(["en", "ta", "hi"], gpu=False, verbose=False)
    except Exception:  # noqa: BLE001
        return None


def _extract_easyocr_text(image_bytes: bytes) -> tuple[str, float]:
    reader = _easyocr_reader()
    if reader is None:
        return "", 0.0

    try:
        image = _image_to_array(image_bytes)
        if image is None:
            return "", 0.0
        results = reader.readtext(image, detail=1, paragraph=False)
    except Exception:  # noqa: BLE001
        return "", 0.0

    texts: list[str] = []
    confidences: list[float] = []
    for item in results:
        if len(item) >= 3:
            text = normalize_text(item[1])
            if text:
                texts.append(text)
                confidences.append(float(item[2]))
    return normalize_text(" ".join(texts)), float(sum(confidences) / len(confidences)) if confidences else 0.0


def _extract_groq_vision_text(
    *,
    image_bytes: bytes,
    mime_type: str,
    file_name: str | None,
    file_type: str | None,
    language_hint: str | None = None,
) -> tuple[str, float]:
    router = get_llm_router()
    if not router.configured:
        return "", 0.0

    client = router._client  # noqa: SLF001
    if client is None:
        return "", 0.0

    content = [
        {
            "type": "text",
            "text": (
                "Transcribe the educational document accurately. Return only the visible text, equations, and labels. "
                "Do not add explanations. Preserve mathematical symbols and line breaks when useful. "
                f"File name: {file_name or 'unknown'}. File type: {file_type or mime_type}. "
                f"Preferred language: {language_hint or 'en'}."
            ),
        },
        {
            "type": "image_url",
            "image_url": {"url": _encode_data_url(image_bytes, mime_type)},
        },
    ]

    try:
        completion = client.chat.completions.create(
            model=router.model_for("ocr_cleanup"),
            messages=[{"role": "user", "content": content}],
            temperature=0.1,
            max_completion_tokens=1000,
            top_p=1,
            stream=False,
        )
        text = normalize_text(completion.choices[0].message.content if completion.choices else "")
        if not text:
            return "", 0.0
        return text, 0.9
    except Exception:  # noqa: BLE001
        return "", 0.0


def _extract_pdf_document(file_bytes: bytes, max_pages: int = 3) -> dict[str, Any]:
    if fitz is None:
        return {"pageCount": 0, "pageTexts": [], "pageImages": [], "rawText": "", "blocks": []}

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    page_texts: list[dict[str, Any]] = []
    page_images: list[dict[str, Any]] = []
    blocks: list[dict[str, Any]] = []

    for index in range(min(doc.page_count, max_pages)):
        page = doc.load_page(index)
        text = normalize_text(page.get_text("text"))
        if text:
            page_texts.append({"pageNum": index + 1, "text": text})

        try:
            page_blocks = page.get_text("blocks")
        except Exception:  # noqa: BLE001
            page_blocks = []
        for block in page_blocks:
            if len(block) >= 5:
                blocks.append(
                    {
                        "pageNum": index + 1,
                        "bbox": [float(block[0]), float(block[1]), float(block[2]), float(block[3])],
                        "text": normalize_text(block[4]),
                    }
                )

        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6), alpha=False)
        page_images.append({"pageNum": index + 1, "imageDataUrl": _encode_data_url(pixmap.tobytes("png"), "image/png")})

    return {
        "pageCount": doc.page_count,
        "pageTexts": page_texts,
        "pageImages": page_images,
        "blocks": blocks,
        "rawText": normalize_text(" ".join(item["text"] for item in page_texts)),
    }


def extract_document_ocr(
    *,
    route_decision: DocumentRouteDecision,
    file_bytes: bytes | None,
    file_name: str | None,
    file_type: str | None,
    language_hint: str | None = None,
) -> dict[str, Any]:
    if not file_bytes and route_decision.route == "text-analysis":
        return {
            "raw_text": "",
            "structured_blocks": [],
            "formulas": [],
            "tables": [],
            "diagrams": [],
            "confidence_score": 0.0,
            "source_models": [],
            "page_count": 0,
            "page_texts": [],
            "page_images": [],
            "page_blocks": [],
        }

    pdf_context = _extract_pdf_document(file_bytes or b"") if route_decision.file_kind == "pdf" else None

    page_texts = []
    page_images = []
    page_blocks = []
    candidates: list[tuple[str, float, str]] = []

    if pdf_context is not None:
        page_texts = pdf_context["pageTexts"]
        page_images = pdf_context["pageImages"]
        page_blocks = pdf_context["blocks"]
        if pdf_context["rawText"]:
            candidates.append((pdf_context["rawText"], 0.96, "pdf-text"))

    if file_bytes and route_decision.route != "direct-extraction":
        image_bytes = file_bytes
        if route_decision.file_kind == "image":
            image_bytes = _preprocess_image(file_bytes)
        easyocr_text, easyocr_conf = _extract_easyocr_text(image_bytes)
        if easyocr_text:
            candidates.append((easyocr_text, clamp(easyocr_conf or 0.7, 0.0, 1.0), "easyocr"))

        groq_text, groq_conf = _extract_groq_vision_text(
            image_bytes=image_bytes,
            mime_type=file_type or "image/png",
            file_name=file_name,
            file_type=file_type,
            language_hint=language_hint,
        )
        if groq_text:
            candidates.append((groq_text, groq_conf or 0.85, "groq-vision"))

        if not candidates and route_decision.file_kind == "image":
            candidates.append((normalize_text(""), 0.0, "fallback"))

    raw_text = ""
    source_models: list[str] = []
    confidence = 0.0
    if candidates:
        candidates = sorted(candidates, key=lambda item: (len(item[0]), item[1]), reverse=True)
        raw_text, confidence, source = candidates[0]
        source_models.append(source)
        if len(candidates) > 1:
            source_models.extend(candidate[2] for candidate in candidates[1:3])
    else:
        source_models.append("none")

    formulas = re.findall(r"[A-Za-z0-9\)\]]\s*[\+\-\*/=^×÷]\s*[A-Za-z0-9\(\)\]\.]+", raw_text)
    tables = [line for line in raw_text.splitlines() if "|" in line or "\t" in line]
    diagrams = [line for line in raw_text.splitlines() if any(keyword in line.lower() for keyword in ("figure", "diagram", "graph", "chart"))]

    return {
        "raw_text": normalize_text(raw_text),
        "structured_blocks": page_blocks,
        "formulas": formulas,
        "tables": tables,
        "diagrams": diagrams,
        "confidence_score": float(confidence),
        "source_models": source_models,
        "page_count": route_decision.page_count or len(page_texts) or 0,
        "page_texts": page_texts,
        "page_images": page_images[:3],
        "page_blocks": page_blocks,
    }

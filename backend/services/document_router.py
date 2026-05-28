from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from typing import Any

from .common import detect_script_language, normalize_text

try:  # Optional dependency.
    import fitz  # type: ignore
except ImportError:  # pragma: no cover - handled at runtime.
    fitz = None


LOGGER = logging.getLogger(__name__)


@dataclass(slots=True)
class DocumentRouteDecision:
    file_kind: str
    document_kind: str
    route: str
    confidence: float
    page_count: int | None = None
    detected_language: str | None = None
    is_math_heavy: bool = False
    is_diagram_heavy: bool = False
    is_formula_heavy: bool = False
    reasons: list[str] = field(default_factory=list)

    def model_dump(self) -> dict[str, Any]:
        return asdict(self)


def _pdf_text_preview(file_bytes: bytes, max_pages: int = 3) -> tuple[int, str]:
    if fitz is None:
        LOGGER.warning("PyMuPDF is not installed; PDF routing will rely on OCR heuristics.")
        return 0, ""

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception:  # noqa: BLE001
        LOGGER.exception("Could not open the uploaded PDF while routing.")
        return 0, ""

    try:
        page_count = doc.page_count
        texts: list[str] = []
        for index in range(min(page_count, max_pages)):
            try:
                page = doc.load_page(index)
                texts.append(normalize_text(page.get_text("text")))
            except Exception as exc:  # noqa: BLE001
                LOGGER.warning("Could not inspect PDF page %s while routing: %s", index + 1, exc)
        return page_count, normalize_text(" ".join(texts))
    finally:
        try:
            doc.close()
        except Exception:  # noqa: BLE001
            pass


def route_document(
    *,
    file_name: str | None,
    file_type: str | None,
    file_bytes: bytes | None,
    text_hint: str | None = None,
) -> DocumentRouteDecision:
    file_type_normalized = (file_type or "").lower()
    file_name_normalized = (file_name or "").lower()
    hint = normalize_text(text_hint)

    if file_type_normalized == "application/pdf" or file_name_normalized.endswith(".pdf"):
        page_count, preview_text = _pdf_text_preview(file_bytes or b"")
        combined_hint = hint or preview_text
        if preview_text:
            route = "native_pdf"
            confidence = 0.98 if len(preview_text) > 40 else 0.9
            reasons = ["PDF contains selectable text and PyMuPDF can extract it directly."]
        elif page_count:
            route = "scanned_pdf"
            confidence = 0.86
            reasons = ["PDF has pages but the visible text layer is weak, so OCR is required."]
        else:
            route = "pdf_unknown"
            confidence = 0.7
            reasons = ["PDF detected but page parsing was inconclusive."]

        is_formula_heavy = any(symbol in combined_hint for symbol in ("=", "+", "-", "×", "÷")) or "solve" in combined_hint.lower()
        is_diagram_heavy = any(keyword in combined_hint.lower() for keyword in ("diagram", "figure", "graph", "chart", "table"))
        detected_language = detect_script_language(combined_hint)
        return DocumentRouteDecision(
            file_kind="pdf",
            document_kind=route,
            route="direct-extraction" if route == "native_pdf" else "ocr-pipeline",
            confidence=confidence,
            page_count=page_count or None,
            detected_language=detected_language,
            is_math_heavy=is_formula_heavy,
            is_diagram_heavy=is_diagram_heavy,
            is_formula_heavy=is_formula_heavy,
            reasons=reasons,
        )

    if file_type_normalized.startswith("image/") or any(file_name_normalized.endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif")):
        detected_language = detect_script_language(hint)
        is_formula_heavy = any(symbol in hint for symbol in ("=", "+", "-", "×", "÷"))
        is_diagram_heavy = any(keyword in hint.lower() for keyword in ("diagram", "figure", "graph", "chart", "table"))
        is_handwritten = len(hint) < 50 or "hand" in file_name_normalized or "scan" in file_name_normalized
        return DocumentRouteDecision(
            file_kind="image",
            document_kind="handwritten_image" if is_handwritten else "camera_image",
            route="ocr-pipeline",
            confidence=0.84 if hint else 0.7,
            detected_language=detected_language,
            is_math_heavy=is_formula_heavy,
            is_diagram_heavy=is_diagram_heavy,
            is_formula_heavy=is_formula_heavy,
            reasons=[
                "Image input detected; OCR preprocessing is required.",
                "Handwriting heuristics were applied." if is_handwritten else "Printed/camera image detected.",
            ],
        )

    if hint:
        detected_language = detect_script_language(hint)
        is_formula_heavy = any(symbol in hint for symbol in ("=", "+", "-", "×", "÷"))
        return DocumentRouteDecision(
            file_kind="text",
            document_kind="typed_text",
            route="text-analysis",
            confidence=0.98,
            detected_language=detected_language,
            is_math_heavy=is_formula_heavy,
            is_diagram_heavy=False,
            is_formula_heavy=is_formula_heavy,
            reasons=["Input was provided as text without a binary file."],
        )

    return DocumentRouteDecision(
        file_kind="unknown",
        document_kind="unknown",
        route="manual-review",
        confidence=0.4,
        reasons=["Unable to infer the document type from the provided input."],
    )


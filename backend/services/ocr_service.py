from __future__ import annotations

import base64
import logging
import os
import re
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from .common import clamp, normalize_text
from .document_router import DocumentRouteDecision
from .llm_router import get_llm_router

LOGGER = logging.getLogger(__name__)
PADDLEOCR_CACHE = Path(__file__).resolve().parent.parent / ".cache" / "paddleocr"
EASYOCR_CACHE = Path(__file__).resolve().parent.parent / ".cache" / "easyocr"

os.environ.setdefault("PADDLEOCR_HOME", str(PADDLEOCR_CACHE))
os.environ.setdefault("PPOCR_HOME", str(PADDLEOCR_CACHE))
os.environ["EASYOCR_MODULE_PATH"] = str(EASYOCR_CACHE)

try:  # Optional dependency for PDF rendering.
    import fitz  # type: ignore
except ImportError:  # pragma: no cover - handled at runtime.
    fitz = None

try:  # Optional dependency for image preprocessing.
    import cv2  # type: ignore
except ImportError:  # pragma: no cover - handled at runtime.
    cv2 = None

try:  # Optional dependency used by PaddleOCR.
    from paddleocr import PaddleOCR  # type: ignore
except Exception:  # pragma: no cover - handled at runtime.
    PaddleOCR = None

try:  # Optional dependency used to unblock torchvision imports for EasyOCR.
    import torch  # type: ignore
except ImportError:  # pragma: no cover - handled at runtime.
    torch = None

if torch is not None:
    try:
        _torchvision_stub_lib = torch.library.Library("torchvision", "DEF")
        _torchvision_stub_lib.define("nms(Tensor dets, Tensor scores, float iou_threshold) -> Tensor")
    except Exception:  # noqa: BLE001
        pass

try:  # Optional dependency for OCR fallback.
    import easyocr  # type: ignore
except Exception:  # pragma: no cover - handled at runtime.
    easyocr = None


def _encode_data_url(raw_bytes: bytes, mime_type: str) -> str:
    return f"data:{mime_type};base64,{base64.b64encode(raw_bytes).decode('utf-8')}"


def _decode_data_url(data_url: str | None) -> tuple[bytes | None, str]:
    if not data_url:
        return None, "image/png"

    payload = str(data_url).strip()
    mime_type = "image/png"
    if payload.startswith("data:") and "," in payload:
        header, encoded = payload.split(",", 1)
        if header.startswith("data:"):
            mime_type = header[5:].split(";", 1)[0] or mime_type
        try:
            return base64.b64decode(encoded, validate=False), mime_type
        except Exception:  # noqa: BLE001
            LOGGER.warning("Could not decode a page image data URL.")
            return None, mime_type

    try:
        return base64.b64decode(payload, validate=False), mime_type
    except Exception:  # noqa: BLE001
        LOGGER.warning("Could not decode a base64 page image payload.")
        return None, mime_type


def _image_to_array(image_bytes: bytes) -> np.ndarray | None:
    if cv2 is None:
        try:
            return np.array(Image.open(BytesIO(image_bytes)).convert("RGB"))
        except Exception:  # noqa: BLE001
            return None

    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        try:
            return np.array(Image.open(BytesIO(image_bytes)).convert("RGB"))
        except Exception:  # noqa: BLE001
            return None
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def _preprocess_image(image_bytes: bytes) -> bytes:
    if cv2 is None:
        return image_bytes
    image = _image_to_array(image_bytes)
    if image is None:
        return image_bytes

    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
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


def _normalize_paddle_language(language_hint: str | None) -> str:
    hint = normalize_text(language_hint).casefold()
    supported = {
        "en": "en",
        "ta": "ta",
        "hi": "hi",
        "kn": "kn",
        "te": "te",
        "latin": "latin",
        "ch": "ch",
        "cn": "ch",
    }
    return supported.get(hint, "en")


def _paddleocr_entry_text(item: Any) -> tuple[str, float]:
    if not isinstance(item, (list, tuple)) or len(item) < 2:
        return "", 0.0

    payload = item[1]
    if isinstance(payload, (list, tuple)) and payload:
        text = normalize_text(payload[0] if len(payload) > 0 else "")
        confidence = float(payload[1]) if len(payload) > 1 and isinstance(payload[1], (int, float)) else 0.0
        return text, confidence

    if isinstance(item[0], str):
        text = normalize_text(item[0])
        confidence = float(payload) if isinstance(payload, (int, float)) else 0.0
        return text, confidence

    return "", 0.0


def _collect_paddleocr_entries(result: Any) -> list[tuple[str, float]]:
    if not result:
        return []

    entries = result
    if isinstance(entries, tuple):
        entries = list(entries)

    if isinstance(entries, list) and len(entries) == 1 and isinstance(entries[0], list):
        first_group = entries[0]
        if first_group and isinstance(first_group[0], (list, tuple)):
            entries = first_group

    collected: list[tuple[str, float]] = []
    if isinstance(entries, list):
        for item in entries:
            text, confidence = _paddleocr_entry_text(item)
            if text:
                collected.append((text, confidence))
    return collected


@lru_cache(maxsize=4)
def _paddleocr_reader(language_code: str):
    if PaddleOCR is None:
        LOGGER.warning("PaddleOCR is not installed. Falling back to other OCR engines.")
        return None

    try:
        for directory in (PADDLEOCR_CACHE, PADDLEOCR_CACHE / "det", PADDLEOCR_CACHE / "rec", PADDLEOCR_CACHE / "cls"):
            directory.mkdir(parents=True, exist_ok=True)
        return PaddleOCR(
            use_angle_cls=True,
            use_gpu=False,
            lang=language_code,
            show_log=False,
            det_model_dir=str(PADDLEOCR_CACHE / "det"),
            rec_model_dir=str(PADDLEOCR_CACHE / "rec"),
            cls_model_dir=str(PADDLEOCR_CACHE / "cls"),
        )
    except Exception as exc:  # noqa: BLE001
        LOGGER.warning("PaddleOCR initialization failed for lang=%s: %s", language_code, exc)
        return None


def _extract_paddleocr_text(image_bytes: bytes, *, language_hint: str | None = None) -> tuple[str, float]:
    reader = _paddleocr_reader(_normalize_paddle_language(language_hint))
    if reader is None:
        return "", 0.0

    try:
        prepared_bytes = _preprocess_image(image_bytes)
        image = _image_to_array(prepared_bytes)
        if image is None:
            image = _image_to_array(image_bytes)
        if image is None:
            return "", 0.0
        results = reader.ocr(image, cls=True)
    except Exception as exc:  # noqa: BLE001
        LOGGER.warning("PaddleOCR failed to extract text: %s", exc)
        return "", 0.0

    entries = _collect_paddleocr_entries(results)
    if not entries:
        return "", 0.0

    text = normalize_text("\n".join(item[0] for item in entries if item[0]))
    confidence = float(sum(item[1] for item in entries) / len(entries)) if entries else 0.0
    if text:
        print("Extracted text:", text[:500])
    return text, confidence


@lru_cache(maxsize=1)
def _easyocr_reader():
    if easyocr is None:
        LOGGER.warning("EasyOCR is not installed. PaddleOCR or vision fallback will be used instead.")
        return None
    try:
        EASYOCR_CACHE.mkdir(parents=True, exist_ok=True)
        return easyocr.Reader(["en", "ta", "hi"], gpu=False, verbose=False, model_storage_directory=str(EASYOCR_CACHE))
    except Exception as exc:  # noqa: BLE001
        LOGGER.warning("EasyOCR initialization failed: %s", exc)
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
    except Exception as exc:  # noqa: BLE001
        LOGGER.warning("EasyOCR failed to extract text: %s", exc)
        return "", 0.0

    texts: list[str] = []
    confidences: list[float] = []
    for item in results:
        if len(item) >= 3:
            text = normalize_text(item[1])
            if text:
                texts.append(text)
                confidences.append(float(item[2]))

    combined = normalize_text(" ".join(texts))
    if combined:
        print("Extracted text:", combined[:500])
    return combined, float(sum(confidences) / len(confidences)) if confidences else 0.0


def _extract_llm_vision_text(
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
        completion = router.complete(
            task="ocr_cleanup",
            messages=[{"role": "user", "content": content}],
            temperature=0.1,
            max_completion_tokens=1000,
        )
        text = normalize_text(completion.choices[0].message.content if completion.choices else "")
        if not text:
            return "", 0.0
        print("Extracted text:", text[:500])
        return text, 0.9
    except Exception as exc:  # noqa: BLE001
        LOGGER.warning("Vision OCR failed: %s", exc)
        return "", 0.0


def _extract_pdf_document(file_bytes: bytes, max_pages: int = 8) -> dict[str, Any]:
    if fitz is None:
        LOGGER.warning("PyMuPDF is not installed; PDF text extraction is unavailable.")
        return {
            "pageCount": 0,
            "pageTexts": [],
            "pageImages": [],
            "rawText": "",
            "blocks": [],
            "hasSelectableText": False,
            "errors": ["PyMuPDF is not installed."],
        }

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:  # noqa: BLE001
        LOGGER.exception("Could not open the uploaded PDF. The file may be corrupted.")
        return {
            "pageCount": 0,
            "pageTexts": [],
            "pageImages": [],
            "rawText": "",
            "blocks": [],
            "hasSelectableText": False,
            "errors": [f"Could not open PDF: {exc}"],
        }

    page_texts: list[dict[str, Any]] = []
    page_images: list[dict[str, Any]] = []
    blocks: list[dict[str, Any]] = []
    errors: list[str] = []
    text_lengths = 0

    page_limit = min(doc.page_count, max_pages)
    print("PDF uploaded successfully")
    print(f"PDF pages detected: {doc.page_count}")

    for index in range(page_limit):
        try:
            page = doc.load_page(index)
        except Exception as exc:  # noqa: BLE001
            error_message = f"Could not load PDF page {index + 1}: {exc}"
            LOGGER.warning(error_message)
            errors.append(error_message)
            continue

        try:
            text = normalize_text(page.get_text("text"))
        except Exception as exc:  # noqa: BLE001
            error_message = f"Could not extract selectable text from PDF page {index + 1}: {exc}"
            LOGGER.warning(error_message)
            errors.append(error_message)
            text = ""
        if text:
            page_texts.append({"pageNum": index + 1, "text": text})
            text_lengths += len(text)

        try:
            page_blocks = page.get_text("blocks")
        except Exception as exc:  # noqa: BLE001
            error_message = f"Could not read text blocks for PDF page {index + 1}: {exc}"
            LOGGER.warning(error_message)
            errors.append(error_message)
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

        try:
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
            page_images.append(
                {
                    "pageNum": index + 1,
                    "imageDataUrl": _encode_data_url(pixmap.tobytes("png"), "image/png"),
                }
            )
        except Exception as exc:  # noqa: BLE001
            error_message = f"Could not render PDF page {index + 1} to an image: {exc}"
            LOGGER.warning(error_message)
            errors.append(error_message)

    raw_text = normalize_text(" ".join(item["text"] for item in page_texts))
    has_selectable_text = bool(raw_text)
    if raw_text:
        print("Extracted text:", raw_text[:500])
    else:
        print("Extracted text: [empty]")

    result = {
        "pageCount": doc.page_count,
        "pageTexts": page_texts,
        "pageImages": page_images,
        "blocks": blocks,
        "rawText": raw_text,
        "hasSelectableText": has_selectable_text,
        "textLength": text_lengths,
        "processedPages": page_limit,
        "errors": errors,
    }

    try:
        doc.close()
    except Exception:  # noqa: BLE001
        pass

    return result


def _extract_image_ocr_candidates(
    *,
    image_bytes: bytes,
    file_name: str | None,
    file_type: str | None,
    language_hint: str | None,
    prefer_paddle: bool = True,
) -> list[tuple[str, float, str]]:
    candidates: list[tuple[str, float, str]] = []
    prepared_bytes = _preprocess_image(image_bytes)

    if prefer_paddle:
        paddle_text, paddle_conf = _extract_paddleocr_text(prepared_bytes, language_hint=language_hint)
        if paddle_text:
            candidates.append((paddle_text, clamp(paddle_conf or 0.8, 0.0, 1.0), "paddleocr"))

    easyocr_text, easyocr_conf = _extract_easyocr_text(prepared_bytes)
    if easyocr_text:
        candidates.append((easyocr_text, clamp(easyocr_conf or 0.7, 0.0, 1.0), "easyocr"))

    llm_text, llm_conf = _extract_llm_vision_text(
        image_bytes=prepared_bytes,
        mime_type=file_type or "image/png",
        file_name=file_name,
        file_type=file_type,
        language_hint=language_hint,
    )
    if llm_text:
        candidates.append((llm_text, llm_conf or 0.85, "vision-llm"))

    return candidates


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
            "errors": [],
        }

    print("OCR started")
    LOGGER.info(
        "Starting OCR pipeline for file=%s type=%s route=%s kind=%s",
        file_name or "unknown",
        file_type or "unknown",
        route_decision.route,
        route_decision.file_kind,
    )

    pdf_context = _extract_pdf_document(file_bytes or b"") if route_decision.file_kind == "pdf" and file_bytes else None

    page_texts: list[dict[str, Any]] = []
    page_images: list[dict[str, Any]] = []
    page_blocks: list[dict[str, Any]] = []
    candidates: list[tuple[str, float, str]] = []
    errors: list[str] = []

    if pdf_context is not None:
        page_texts = list(pdf_context.get("pageTexts") or [])
        page_images = list(pdf_context.get("pageImages") or [])
        page_blocks = list(pdf_context.get("blocks") or [])
        errors.extend(pdf_context.get("errors") or [])

        raw_pdf_text = normalize_text(pdf_context.get("rawText"))
        has_selectable_text = bool(pdf_context.get("hasSelectableText")) and bool(raw_pdf_text)
        if has_selectable_text:
            candidates.append((raw_pdf_text, 0.98, "pymupdf-text"))
        else:
            LOGGER.info("PDF does not expose a readable text layer; switching to page-image OCR.")
            for page_image in page_images[:8]:
                image_bytes, mime_type = _decode_data_url(page_image.get("imageDataUrl"))
                if image_bytes is None:
                    error_message = f"Could not decode page image for page {page_image.get('pageNum')}."
                    LOGGER.warning(error_message)
                    errors.append(error_message)
                    continue

                page_candidates = _extract_image_ocr_candidates(
                    image_bytes=image_bytes,
                    file_name=file_name,
                    file_type=file_type or mime_type,
                    language_hint=language_hint,
                    prefer_paddle=True,
                )
                if not page_candidates:
                    continue

                candidates.extend(page_candidates)
                best_page_candidate = max(page_candidates, key=lambda item: (len(item[0]), item[1]))
                if best_page_candidate[0]:
                    page_texts.append({"pageNum": page_image.get("pageNum"), "text": best_page_candidate[0]})

            if not candidates:
                LOGGER.warning("PaddleOCR and fallback OCR engines did not extract text from the scanned PDF.")

    elif file_bytes and route_decision.file_kind == "image":
        candidates.extend(
            _extract_image_ocr_candidates(
                image_bytes=file_bytes,
                file_name=file_name,
                file_type=file_type,
                language_hint=language_hint,
                prefer_paddle=True,
            )
        )
    elif file_bytes and route_decision.route != "direct-extraction":
        candidates.extend(
            _extract_image_ocr_candidates(
                image_bytes=file_bytes,
                file_name=file_name,
                file_type=file_type,
                language_hint=language_hint,
                prefer_paddle=True,
            )
        )

    if not candidates and route_decision.route == "direct-extraction" and pdf_context is not None:
        raw_pdf_text = normalize_text(pdf_context.get("rawText"))
        if raw_pdf_text:
            candidates.append((raw_pdf_text, 0.98, "pymupdf-text"))

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

    raw_text = normalize_text(raw_text)
    if raw_text:
        print("Extracted text:", raw_text[:500])
    else:
        print("Extracted text: [empty]")
        LOGGER.warning("No readable text was extracted from the uploaded file.")

    formulas = re.findall(r"[A-Za-z0-9\)\]]\s*[\+\-\*/=^]\s*[A-Za-z0-9\(\)\]\.]+", raw_text)
    tables = [line for line in raw_text.splitlines() if "|" in line or "\t" in line]
    diagrams = [line for line in raw_text.splitlines() if any(keyword in line.lower() for keyword in ("figure", "diagram", "graph", "chart"))]

    return {
        "raw_text": raw_text,
        "structured_blocks": page_blocks,
        "formulas": formulas,
        "tables": tables,
        "diagrams": diagrams,
        "confidence_score": float(confidence),
        "source_models": source_models,
        "page_count": route_decision.page_count or len(page_texts) or 0,
        "page_texts": page_texts,
        "page_images": page_images[:5],
        "page_blocks": page_blocks,
        "errors": errors,
    }

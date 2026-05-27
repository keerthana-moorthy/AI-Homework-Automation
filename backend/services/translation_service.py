from __future__ import annotations

from typing import Any

from .llm_router import get_llm_router
from .common import normalize_text


LANGUAGE_NAMES = {
    "en": "English",
    "ta": "Tamil",
    "hi": "Hindi",
    "kn": "Kannada",
    "te": "Telugu",
    "both": "mixed Tamil and English",
}


def normalize_language_code(language: str | None) -> str:
    normalized = (language or "en").strip().lower()
    return normalized if normalized in LANGUAGE_NAMES else "en"


def language_name(language: str | None) -> str:
    return LANGUAGE_NAMES.get(normalize_language_code(language), "English")


def translate_text(
    text: str | None,
    *,
    target_language: str = "en",
    source_language: str | None = None,
    context: str | None = None,
) -> str:
    normalized_text = normalize_text(text)
    if not normalized_text:
        return ""

    target = normalize_language_code(target_language)
    source = normalize_language_code(source_language)
    if target == source or target == "en" and source in {"en", "unknown"}:
        return normalized_text

    router = get_llm_router()
    if not router.configured:
        return normalized_text

    system_prompt = (
        "You are a translation assistant for an educational tutoring backend. "
        "Translate faithfully without changing the meaning, the math symbols, or the educational terms. "
        "Return only the translated text."
    )
    context_line = f"Context: {normalize_text(context)}\n" if context else ""
    user_prompt = (
        f"Translate the following content into {language_name(target)}.\n"
        f"Source language: {language_name(source)}.\n"
        f"{context_line}"
        f"Content:\n{normalized_text}"
    )

    translated = router.generate_text(
        task="translation",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.1,
        max_completion_tokens=900,
    )
    return normalize_text(translated) if translated else normalized_text


def translate_payload(payload: dict[str, Any], *, target_language: str) -> dict[str, Any]:
    translated = dict(payload)
    for key in ("summary", "detailedExplanation", "reply", "title", "description"):
        value = translated.get(key)
        if isinstance(value, str):
            translated[key] = translate_text(value, target_language=target_language)
    return translated

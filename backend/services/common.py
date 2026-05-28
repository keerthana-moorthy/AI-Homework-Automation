from __future__ import annotations

import hashlib
import json
import math
import re
import unicodedata
from collections import Counter
from functools import lru_cache
from typing import Any, Iterable

import numpy as np

try:  # Optional dependency for LangChain-based chunking.
    from langchain_text_splitters import RecursiveCharacterTextSplitter  # type: ignore
except Exception:  # pragma: no cover - handled at runtime.
    RecursiveCharacterTextSplitter = None

STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "have",
    "how",
    "i",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "their",
    "this",
    "to",
    "was",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "with",
    "you",
}

TAMIL_RANGE = (0x0B80, 0x0BFF)
DEVANAGARI_RANGE = (0x0900, 0x097F)
KANNADA_RANGE = (0x0C80, 0x0CFF)
TELUGU_RANGE = (0x0C00, 0x0C7F)


def normalize_text(text: str | None) -> str:
    text = unicodedata.normalize("NFKC", str(text or ""))
    replacements = {
        "Ã¢â‚¬â€œ": "-",
        "Ã¢â‚¬â€": "-",
        "Ã¢Ë†â€™": "-",
        "Ãƒâ€”": "*",
        "Ã‚Â·": "*",
        "â€“": "-",
        "â€”": "-",
        "âˆ’": "-",
        "×": "*",
        "·": "*",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return " ".join(text.split()).strip()


def safe_json_loads(content: str | None, default: Any | None = None) -> Any:
    if not content:
        return default if default is not None else {}

    try:
        parsed = json.loads(content)
        return parsed
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            return default if default is not None else {}
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return default if default is not None else {}


def tokenize(text: str | None) -> list[str]:
    normalized = normalize_text(text).lower()
    return [token for token in re.findall(r"[a-zA-Z0-9\u0900-\u097F\u0B80-\u0BFF\u0C00-\u0CFF]+", normalized) if token]


def chunk_text(text: str | None, chunk_size: int = 180, overlap: int = 40) -> list[str]:
    normalized = normalize_text(text)
    if not normalized:
        return []

    if RecursiveCharacterTextSplitter is not None:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=max(400, chunk_size * 8),
            chunk_overlap=max(50, overlap * 6),
            separators=["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " ", ""],
        )
        chunks = [normalize_text(chunk) for chunk in splitter.split_text(normalized)]
        return [chunk for chunk in chunks if chunk]

    tokens = tokenize(normalized)
    if not tokens:
        return []

    chunks: list[str] = []
    start = 0
    while start < len(tokens):
        end = min(len(tokens), start + chunk_size)
        chunks.append(" ".join(tokens[start:end]))
        if end >= len(tokens):
            break
        start = max(end - overlap, start + 1)
    return chunks


def dedupe_preserve_order(values: Iterable[Any]) -> list[Any]:
    seen: set[str] = set()
    deduped: list[Any] = []
    for value in values:
        key = json.dumps(value, sort_keys=True, default=str) if isinstance(value, (dict, list)) else str(value)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(value)
    return deduped


def top_keywords(text: str | None, limit: int = 10) -> list[str]:
    tokens = [token for token in tokenize(text) if token not in STOPWORDS and len(token) > 1]
    if not tokens:
        return []
    counts = Counter(tokens)
    return [token for token, _ in counts.most_common(limit)]


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    if vec_a.size == 0 or vec_b.size == 0:
        return 0.0
    denom = float(np.linalg.norm(vec_a) * np.linalg.norm(vec_b))
    if denom == 0:
        return 0.0
    return float(np.dot(vec_a, vec_b) / denom)


def hash_embedding(text: str | None, dimension: int = 384) -> np.ndarray:
    vector = np.zeros(dimension, dtype=np.float32)
    tokens = tokenize(text)
    if not tokens:
        return vector

    for token in tokens:
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).hexdigest()
        index = int(digest, 16) % dimension
        vector[index] += 1.0

    norm = np.linalg.norm(vector)
    if norm > 0:
        vector /= norm
    return vector


def detect_script_language(text: str | None) -> str:
    if not text:
        return "unknown"

    counts = {"en": 0, "ta": 0, "hi": 0, "kn": 0, "te": 0}
    for char in text:
        codepoint = ord(char)
        if TAMIL_RANGE[0] <= codepoint <= TAMIL_RANGE[1]:
            counts["ta"] += 1
        elif DEVANAGARI_RANGE[0] <= codepoint <= DEVANAGARI_RANGE[1]:
            counts["hi"] += 1
        elif KANNADA_RANGE[0] <= codepoint <= KANNADA_RANGE[1]:
            counts["kn"] += 1
        elif TELUGU_RANGE[0] <= codepoint <= TELUGU_RANGE[1]:
            counts["te"] += 1
        elif char.isalpha():
            counts["en"] += 1

    dominant = max(counts, key=counts.get)
    if counts[dominant] == 0:
        return "unknown"
    if sum(1 for value in counts.values() if value > 0) > 1:
        return "mixed"
    return dominant


@lru_cache(maxsize=128)
def stopword_set() -> set[str]:
    return set(STOPWORDS)


def keyword_overlap_score(a: str | None, b: str | None) -> float:
    a_tokens = {token for token in tokenize(a) if token not in stopword_set()}
    b_tokens = {token for token in tokenize(b) if token not in stopword_set()}
    if not a_tokens or not b_tokens:
        return 0.0
    intersection = len(a_tokens & b_tokens)
    union = len(a_tokens | b_tokens)
    return intersection / max(1, union)


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def is_mostly_numbers(text: str | None) -> bool:
    normalized = normalize_text(text)
    if not normalized:
        return False
    numeric = sum(char.isdigit() for char in normalized)
    return numeric / max(1, len(normalized)) > 0.18


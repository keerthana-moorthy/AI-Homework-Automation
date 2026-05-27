from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Iterable

import numpy as np

from .common import hash_embedding, normalize_text

class EmbeddingService:
    def __init__(self, model_name: str | None = None) -> None:
        self.model_name = model_name or os.getenv("VIDYA_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
        self._model: Any | None = None
        self.dimension = 384
        self.backend = "hash"
        self._load_model()

    def _load_model(self) -> None:
        if os.getenv("VIDYA_ENABLE_SENTENCE_EMBEDDINGS", "").strip().lower() not in {"1", "true", "yes"}:
            return

        try:  # Optional dependency, loaded lazily to keep startup fast.
            from sentence_transformers import SentenceTransformer  # type: ignore
        except Exception:  # pragma: no cover - handled at runtime.
            return

        try:
            self._model = SentenceTransformer(self.model_name, local_files_only=True)
            sample = self._model.encode(["vidya"], normalize_embeddings=True)
            self.dimension = int(sample.shape[-1])
            self.backend = "sentence-transformers"
        except Exception:  # noqa: BLE001
            self._model = None
            self.backend = "hash"

    def embed_text(self, text: str | None) -> np.ndarray:
        normalized = normalize_text(text)
        if not normalized:
            return np.zeros(self.dimension, dtype=np.float32)

        if self._model is not None:
            try:
                vector = self._model.encode([normalized], normalize_embeddings=True)[0]
                return np.asarray(vector, dtype=np.float32)
            except Exception:  # noqa: BLE001
                pass
        return hash_embedding(normalized, self.dimension)

    def embed_texts(self, texts: Iterable[str | None]) -> np.ndarray:
        normalized_texts = [normalize_text(text) for text in texts]
        if self._model is not None:
            try:
                vectors = self._model.encode(normalized_texts, normalize_embeddings=True)
                return np.asarray(vectors, dtype=np.float32)
            except Exception:  # noqa: BLE001
                pass
        return np.asarray([hash_embedding(text, self.dimension) for text in normalized_texts], dtype=np.float32)

    def similarity(self, left: str | None, right: str | None) -> float:
        vec_left = self.embed_text(left)
        vec_right = self.embed_text(right)
        denom = float(np.linalg.norm(vec_left) * np.linalg.norm(vec_right))
        if denom == 0:
            return 0.0
        return float(np.dot(vec_left, vec_right) / denom)


@lru_cache(maxsize=1)
def get_embedding_service() -> EmbeddingService:
    return EmbeddingService()

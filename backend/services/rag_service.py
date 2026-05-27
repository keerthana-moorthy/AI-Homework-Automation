from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .common import chunk_text, keyword_overlap_score, normalize_text
from .embedding_service import get_embedding_service
from ..models import DocumentChunk

try:  # Optional accelerated nearest-neighbour backend.
    import faiss  # type: ignore
except Exception:  # pragma: no cover - handled at runtime.
    faiss = None


@dataclass(slots=True)
class RetrievedChunk:
    chunk_id: int
    analysis_id: int | None
    chunk_type: str
    text: str
    score: float
    metadata: dict[str, Any]

    def model_dump(self) -> dict[str, Any]:
        return {
            "chunkId": self.chunk_id,
            "analysisId": self.analysis_id,
            "chunkType": self.chunk_type,
            "text": self.text,
            "score": round(self.score, 4),
            "metadata": self.metadata,
        }


class RAGService:
    def __init__(self) -> None:
        self.embedding_service = get_embedding_service()

    def _normalize_vector(self, vector: np.ndarray) -> np.ndarray:
        norm = float(np.linalg.norm(vector))
        if norm == 0:
            return vector.astype(np.float32, copy=False)
        return (vector / norm).astype(np.float32, copy=False)

    def _chunk_records(self, payload: dict[str, Any]) -> list[tuple[str, str, dict[str, Any]]]:
        records: list[tuple[str, str, dict[str, Any]]] = []

        def add(chunk_type: str, text: str | None, metadata: dict[str, Any] | None = None) -> None:
            normalized = normalize_text(text)
            if normalized:
                records.append((chunk_type, normalized, metadata or {}))

        add("question", payload.get("questionText"))
        add("summary", payload.get("summary"))
        add("detailed-explanation", payload.get("detailedExplanation"))
        add("final-answer", payload.get("finalAnswer"))
        add("ocr", payload.get("extractedText"))

        for index, step in enumerate(payload.get("steps") or [], start=1):
            if isinstance(step, dict):
                add(
                    "step",
                    step.get("desc") or step.get("description") or step.get("title"),
                    {"stepNum": step.get("stepNum") or index, "title": step.get("title")},
                )

        structured_document = payload.get("structuredDocumentJson") or {}
        if isinstance(structured_document, dict):
            add("structure-summary", structured_document.get("summary"))
            for question in structured_document.get("questions") or []:
                if isinstance(question, dict):
                    add("structure-question", question.get("text"), {"lineType": question.get("type")})
            for answer in structured_document.get("answers") or []:
                if isinstance(answer, dict):
                    add("structure-answer", answer.get("text"), {"lineType": answer.get("type")})
            for equation in structured_document.get("equations") or []:
                if isinstance(equation, str):
                    add("structure-equation", equation)

        scan_payload = payload.get("scan") or {}
        if isinstance(scan_payload, dict):
            add("scan-summary", scan_payload.get("summary"))
            add("scan-detail", scan_payload.get("detailedExplanation"))
            add("scan-text", scan_payload.get("questionText") or scan_payload.get("extractedText"))
            for page in scan_payload.get("pageTexts") or []:
                if isinstance(page, dict):
                    add("page-text", page.get("text"), {"pageNum": page.get("pageNum")})

        for chunk in chunk_text(payload.get("extractedText"), chunk_size=120, overlap=25):
            add("ocr-chunk", chunk)

        return records

    def index_analysis(
        self,
        db: Session,
        *,
        user_id: int,
        analysis_id: int,
        payload: dict[str, Any],
    ) -> list[dict[str, Any]]:
        db.execute(delete(DocumentChunk).where(DocumentChunk.analysis_id == analysis_id))

        records = self._chunk_records(payload)
        created: list[DocumentChunk] = []
        for index, (chunk_type, text, metadata) in enumerate(records):
            embedding = self.embedding_service.embed_text(text).astype(np.float32, copy=False)
            created.append(
                DocumentChunk(
                    user_id=user_id,
                    analysis_id=analysis_id,
                    chunk_index=index,
                    chunk_type=chunk_type,
                    text=text,
                    embedding=embedding.tolist(),
                    metadata_json=metadata,
                    score=0.0,
                )
            )
        if created:
            db.add_all(created)
            db.commit()

        return [self._chunk_to_dict(chunk) for chunk in created]

    def _chunk_to_dict(self, chunk: DocumentChunk, score: float = 0.0) -> dict[str, Any]:
        return {
            "chunkId": chunk.id,
            "analysisId": chunk.analysis_id,
            "chunkType": chunk.chunk_type,
            "text": chunk.text,
            "score": round(score, 4),
            "metadata": chunk.metadata_json or {},
        }

    def retrieve(
        self,
        db: Session,
        *,
        query: str,
        user_id: int | None = None,
        analysis_id: int | None = None,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        normalized_query = normalize_text(query)
        if not normalized_query:
            return []

        stmt = select(DocumentChunk)
        if analysis_id is not None:
            stmt = stmt.where(DocumentChunk.analysis_id == analysis_id)
        elif user_id is not None:
            stmt = stmt.where(DocumentChunk.user_id == user_id)

        rows = list(db.scalars(stmt.order_by(DocumentChunk.created_at.desc(), DocumentChunk.id.desc())).all())
        if not rows:
            return []

        query_vector = self._normalize_vector(self.embedding_service.embed_text(normalized_query))
        chunk_vectors = np.asarray([self._normalize_vector(np.asarray(row.embedding, dtype=np.float32)) for row in rows], dtype=np.float32)
        similarity_scores = chunk_vectors @ query_vector

        scored: list[RetrievedChunk] = []
        for row, similarity in zip(rows, similarity_scores, strict=False):
            lexical = keyword_overlap_score(normalized_query, row.text)
            score = (float(similarity) * 0.72) + (lexical * 0.28)
            if analysis_id is not None and row.analysis_id == analysis_id:
                score += 0.08
            scored.append(
                RetrievedChunk(
                    chunk_id=row.id,
                    analysis_id=row.analysis_id,
                    chunk_type=row.chunk_type,
                    text=row.text,
                    score=score,
                    metadata=row.metadata_json or {},
                )
            )

        scored.sort(key=lambda item: item.score, reverse=True)
        return [item.model_dump() for item in scored[:limit]]

    def build_context_pack(
        self,
        db: Session,
        *,
        query: str,
        user_id: int | None = None,
        analysis_id: int | None = None,
        limit: int = 5,
    ) -> dict[str, Any]:
        chunks = self.retrieve(db, query=query, user_id=user_id, analysis_id=analysis_id, limit=limit)
        context_lines: list[str] = []
        citations: list[dict[str, Any]] = []
        for index, chunk in enumerate(chunks, start=1):
            context_lines.append(f"[{index}] {chunk['text']}")
            citations.append(
                {
                    "chunkId": chunk["chunkId"],
                    "analysisId": chunk["analysisId"],
                    "chunkType": chunk["chunkType"],
                    "score": chunk["score"],
                }
            )

        return {
            "contextText": "\n\n".join(context_lines),
            "chunks": chunks,
            "citations": citations,
            "retrievedCount": len(chunks),
        }


@lru_cache(maxsize=1)
def get_rag_service() -> RAGService:
    return RAGService()

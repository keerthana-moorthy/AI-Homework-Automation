from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from .common import normalize_text
from .llm_router import get_llm_router
from .rag_service import get_rag_service
from .translation_service import normalize_language_code, translate_text
from ..models import DoubtMessage, DoubtThread, HomeworkAnalysis, UserProfile


@dataclass(slots=True)
class DoubtAnswer:
    thread_id: int
    analysis_id: int | None
    reply: str
    citations: list[dict[str, Any]]
    suggested_questions: list[str]
    grounded: bool = True

    def model_dump(self) -> dict[str, Any]:
        return {
            "threadId": self.thread_id,
            "analysisId": self.analysis_id,
            "reply": self.reply,
            "citations": self.citations,
            "suggestedQuestions": self.suggested_questions,
            "grounded": self.grounded,
        }


def _analysis_payload_from_row(row: HomeworkAnalysis | None) -> dict[str, Any] | None:
    if row is None:
        return None
    payload = dict(row.raw_payload or {})
    payload["analysisId"] = row.id
    payload["fileName"] = row.file_name
    payload["fileType"] = row.file_type
    payload["summary"] = payload.get("summary") or row.summary
    payload["questionText"] = payload.get("questionText") or row.question_text
    payload["finalAnswer"] = payload.get("finalAnswer") or row.final_answer
    payload["steps"] = payload.get("steps") or row.steps
    payload["detectedSubject"] = payload.get("detectedSubject") or {
        "id": row.detected_subject_id,
        "confidence": row.confidence,
        "reason": "Loaded from stored analysis.",
    }
    return payload


def _suggested_questions(analysis_payload: dict[str, Any] | None) -> list[str]:
    if not analysis_payload:
        return [
            "Can you explain the scan summary?",
            "What is the first step?",
            "Can you simplify the concept?",
        ]

    question = normalize_text(analysis_payload.get("questionText"))
    final_answer = normalize_text(analysis_payload.get("finalAnswer"))
    steps = analysis_payload.get("steps") if isinstance(analysis_payload.get("steps"), list) else []

    suggestions = [
        "Explain the homework in simple words",
        "What concept do I need to learn here?",
    ]
    if steps:
        suggestions.append("Explain the first step clearly")
    if final_answer:
        suggestions.append(f"Why is the answer {final_answer}?")
    if question:
        suggestions.append("Restate the question in easy language")

    deduped: list[str] = []
    for item in suggestions:
        if item not in deduped:
            deduped.append(item)
    return deduped[:5]


def _build_thread_title(analysis_payload: dict[str, Any] | None) -> str:
    if not analysis_payload:
        return "Homework doubt"
    question = normalize_text(analysis_payload.get("questionText"))
    if question:
        return question[:80]
    subject = analysis_payload.get("detectedSubject") if isinstance(analysis_payload.get("detectedSubject"), dict) else {}
    subject_name = normalize_text(subject.get("id")) or "Homework"
    return f"{subject_name} doubt"


def _build_history_messages(thread: DoubtThread | None, request_history: list[dict[str, Any]]) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []

    if thread is not None:
        persisted = list(thread.messages[-8:]) if thread.messages else []
        for item in persisted:
            if item.role in {"user", "assistant"} and item.content:
                messages.append({"role": item.role, "content": item.content})

    for item in request_history[-8:]:
        role = str(item.get("role") or "").strip().lower()
        content = normalize_text(item.get("content"))
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content})

    return messages[-10:]


def _fallback_reply(
    *,
    analysis_payload: dict[str, Any] | None,
    question: str,
    language: str,
    context_text: str,
) -> str:
    answer = normalize_text(analysis_payload.get("finalAnswer") if analysis_payload else None)
    summary = normalize_text(analysis_payload.get("summary") if analysis_payload else None)
    detailed = normalize_text(analysis_payload.get("detailedExplanation") if analysis_payload else None)
    steps = analysis_payload.get("steps") if analysis_payload and isinstance(analysis_payload.get("steps"), list) else []

    if language == "ta":
        intro = "இந்த வீட்டுப்பாடம் குறித்து நான் உதவுகிறேன்."
    elif language == "both":
        intro = "I can help with this homework. நான் இதை எளிதாக விளக்குகிறேன்."
    else:
        intro = "I can help with this homework."

    parts = [intro]
    if question:
        parts.append(f"You asked: {question}.")
    if summary:
        parts.append(summary)
    if detailed:
        parts.append(detailed)
    if context_text:
        parts.append(f"Relevant scan context: {context_text}")
    if steps:
        parts.append("Step-by-step:")
        for step in steps[:3]:
            if isinstance(step, dict):
                title = normalize_text(step.get("title")) or "Step"
                desc = normalize_text(step.get("desc") or step.get("description"))
                parts.append(f"{title}: {desc}" if desc else title)
    if answer:
        parts.append(f"The current answer shown in the scan is {answer}.")
    return " ".join(part for part in parts if part)


class DoubtService:
    def __init__(self) -> None:
        self.rag_service = get_rag_service()
        self.llm_router = get_llm_router()

    def _get_latest_analysis(self, db: Session, user: UserProfile) -> dict[str, Any] | None:
        row = db.scalar(
            select(HomeworkAnalysis)
            .where(HomeworkAnalysis.user_id == user.id)
            .order_by(desc(HomeworkAnalysis.created_at), desc(HomeworkAnalysis.id))
        )
        return _analysis_payload_from_row(row)

    def _get_thread(
        self,
        db: Session,
        *,
        user: UserProfile,
        analysis_id: int | None,
        thread_id: int | None,
        language: str,
        analysis_payload: dict[str, Any] | None,
    ) -> DoubtThread:
        thread: DoubtThread | None = None
        if thread_id is not None:
            thread = db.get(DoubtThread, thread_id)
            if thread is not None and thread.user_id != user.id:
                thread = None

        if thread is None and analysis_id is not None:
            thread = db.scalar(
                select(DoubtThread)
                .where(DoubtThread.user_id == user.id, DoubtThread.analysis_id == analysis_id)
                .order_by(desc(DoubtThread.updated_at), desc(DoubtThread.id))
            )

        if thread is None:
            thread = DoubtThread(
                user_id=user.id,
                analysis_id=analysis_id,
                title=_build_thread_title(analysis_payload),
                language=normalize_language_code(language),
                summary=normalize_text(analysis_payload.get("summary") if analysis_payload else None) or None,
                last_question=None,
            )
            db.add(thread)
            db.flush()

        return thread

    def answer(
        self,
        db: Session,
        *,
        user: UserProfile,
        message: str,
        analysis_id: int | None = None,
        analysis_payload: dict[str, Any] | None = None,
        language: str = "en",
        history: list[dict[str, Any]] | None = None,
        thread_id: int | None = None,
    ) -> dict[str, Any]:
        normalized_message = normalize_text(message)
        if not normalized_message:
            return {
                "threadId": thread_id,
                "analysisId": analysis_id,
                "reply": "Please ask a question about the scanned homework.",
                "citations": [],
                "suggestedQuestions": _suggested_questions(analysis_payload),
                "grounded": True,
            }

        if analysis_payload is None and analysis_id is not None:
            row = db.get(HomeworkAnalysis, analysis_id)
            analysis_payload = _analysis_payload_from_row(row)
        if analysis_payload is None:
            analysis_payload = self._get_latest_analysis(db, user)
        active_analysis_id = analysis_id or (analysis_payload.get("analysisId") if analysis_payload else None)

        thread = self._get_thread(
            db,
            user=user,
            analysis_id=active_analysis_id,
            thread_id=thread_id,
            language=language,
            analysis_payload=analysis_payload,
        )

        thread.last_question = normalized_message
        thread.summary = normalize_text(analysis_payload.get("summary") if analysis_payload else None) or thread.summary
        thread.language = normalize_language_code(language)
        db.add(thread)

        context_pack = self.rag_service.build_context_pack(
            db,
            query=normalized_message,
            user_id=user.id,
            analysis_id=active_analysis_id,
            limit=5,
        )
        context_text = context_pack.get("contextText") or ""
        citations = context_pack.get("citations") or []
        history_messages = _build_history_messages(thread, history or [])

        system_language = (
            "Answer in Tamil." if language == "ta" else "Answer in simple mixed Tamil and English." if language == "both" else "Answer in simple English."
        )
        system_prompt = (
            "You are Vidya AI, a grounded doubt-solving tutor for the same homework the student uploaded. "
            "Only use the provided homework context, scan summary, detailed explanation, and retrieved passages. "
            "If the answer is not present in the context, say what is missing and ask for a clearer upload or more details. "
            "Explain step by step, using short paragraphs and student-friendly language. "
            f"{system_language}"
        )
        context_summary = "\n".join(
            [
                f"Analysis ID: {active_analysis_id or 'latest'}",
                f"Homework question: {normalize_text(analysis_payload.get('questionText') if analysis_payload else '') or 'Unavailable'}",
                f"Summary: {normalize_text(analysis_payload.get('summary') if analysis_payload else '') or 'Unavailable'}",
                f"Detailed explanation: {normalize_text(analysis_payload.get('detailedExplanation') if analysis_payload else '') or 'Unavailable'}",
                f"Final answer: {normalize_text(analysis_payload.get('finalAnswer') if analysis_payload else '') or 'Unavailable'}",
                f"Retrieved context:\n{context_text or 'No extra context retrieved.'}",
            ]
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "system", "content": f"Grounded context:\n{context_summary}"},
        ]
        messages.extend(history_messages[-8:])
        messages.append({"role": "user", "content": normalized_message})

        reply = ""
        if self.llm_router.configured:
            try:
                reply = normalize_text(
                    self.llm_router.generate_text(
                        task="doubt",
                        system_prompt=system_prompt,
                        user_prompt=(
                            f"Grounded homework context:\n{context_summary}\n\n"
                            f"Recent conversation:\n{history_messages}\n\n"
                            f"Student question: {normalized_message}\n"
                            "Answer only from the homework context. If necessary, note what is missing."
                        ),
                        temperature=0.25,
                        max_completion_tokens=1200,
                    )
                    or ""
                )
            except Exception:  # noqa: BLE001
                reply = ""

        if not reply:
            reply = _fallback_reply(
                analysis_payload=analysis_payload,
                question=normalized_message,
                language=language,
                context_text=context_text,
            )

        reply = translate_text(reply, target_language=language)
        user_message = DoubtMessage(
            thread_id=thread.id,
            user_id=user.id,
            role="user",
            content=normalized_message,
            citations=citations,
            metadata_json={"analysisId": active_analysis_id, "source": "doubt-request"},
        )
        assistant_message = DoubtMessage(
            thread_id=thread.id,
            user_id=user.id,
            role="assistant",
            content=reply,
            citations=citations,
            metadata_json={"analysisId": active_analysis_id, "source": "doubt-response"},
        )
        db.add(user_message)
        db.add(assistant_message)
        db.commit()

        return DoubtAnswer(
            thread_id=thread.id,
            analysis_id=active_analysis_id,
            reply=reply,
            citations=citations,
            suggested_questions=_suggested_questions(analysis_payload),
            grounded=True,
        ).model_dump()


@lru_cache(maxsize=1)
def get_doubt_service() -> DoubtService:
    return DoubtService()

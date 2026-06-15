from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from .common import dedupe_preserve_order, normalize_text, top_keywords
from .assistant_prompts import build_assistant_prompt
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


def _suggested_questions(
    analysis_payload: dict[str, Any] | None,
    *,
    message: str | None = None,
    intent: str | None = None,
    general_mode: bool = False,
    context_pack: dict[str, Any] | None = None,
) -> list[str]:
    normalized_message = normalize_text(message)
    normalized_intent = normalize_text(intent).lower()

    if not analysis_payload:
        if general_mode:
            general_suggestions = {
                "quiz": [
                    "Ask me a quick practice question",
                    "Test whether I understand this topic",
                    "Give me a harder challenge",
                ],
                "simplify": [
                    "Explain it in simple words",
                    "Break it into small steps",
                    "Use an easy example",
                ],
                "example": [
                    "Give me a real-life example",
                    "Show me another example",
                    "Explain it with a simple story",
                ],
                "translate": [
                    "Translate this more clearly",
                    "Keep the meaning but use simpler words",
                    "Explain it in both Tamil and English",
                ],
                "reason": [
                    "Explain why this makes sense",
                    "Show me the reasoning step by step",
                    "What is the key idea behind this?",
                ],
                "step-by-step": [
                    "Break it into steps",
                    "Explain the first step clearly",
                    "Show the full process slowly",
                ],
            }
            suggestions = general_suggestions.get(
                normalized_intent,
                [
                    "Explain this in simple words",
                    "Give me an example",
                    "Quiz me on this",
                ],
            )
            if normalized_message:
                suggestions = [*suggestions, "What is the clearest way to understand this?"]
        else:
            suggestions = [
                "Can you explain the scan summary?",
                "What is the first step?",
                "Can you simplify the concept?",
            ]
            if normalized_message:
                suggestions.append("Restate the question in easy language")
        return suggestions[:5]

    question = normalize_text(analysis_payload.get("questionText"))
    final_answer = normalize_text(analysis_payload.get("finalAnswer"))
    steps = analysis_payload.get("steps") if isinstance(analysis_payload.get("steps"), list) else []
    scan = analysis_payload.get("scan") if isinstance(analysis_payload.get("scan"), dict) else {}
    context_text = normalize_text(context_pack.get("contextText")) if isinstance(context_pack, dict) else ""

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
    if context_text or scan.get("summary"):
        suggestions.append("What does the scan context mean?")
    if normalized_message and normalized_intent == "step-by-step":
        suggestions.insert(0, "Walk me through this step by step")

    deduped: list[str] = []
    for item in suggestions:
        if item not in deduped:
            deduped.append(item)
    return deduped[:5]


def _build_thread_title(analysis_payload: dict[str, Any] | None) -> str:
    if not analysis_payload:
        return "General study session"
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


def _intent_from_message(message: str) -> str:
    text = normalize_text(message).lower()
    if not text:
        return "explain"

    intent_rules = [
        ("quiz", ("quiz", "practice question", "test me", "ask me a question", "mcq")),
        ("simplify", ("simplify", "simple words", "easy words", "easier")),
        ("example", ("example", "for example", "real life", "illustrate")),
        ("translate", ("translate", "tamil", "english")),
        ("reason", ("why", "reason", "because", "explain why")),
        ("step-by-step", ("step by step", "step-by-step", "step 1", "step 2", "how do i solve")),
    ]
    for intent, phrases in intent_rules:
        if any(phrase in text for phrase in phrases):
            return intent
    return "explain"


def _build_retrieval_queries(
    *,
    message: str,
    analysis_payload: dict[str, Any] | None,
    thread: DoubtThread | None,
    history_messages: list[dict[str, str]],
    general_mode: bool,
) -> list[str]:
    seeds: list[str] = [message]
    if thread is not None and thread.summary:
        seeds.append(thread.summary)

    if analysis_payload:
        seeds.extend(
            [
                analysis_payload.get("questionText"),
                analysis_payload.get("summary"),
                analysis_payload.get("detailedExplanation"),
                analysis_payload.get("finalAnswer"),
            ]
        )
        scan = analysis_payload.get("scan") if isinstance(analysis_payload.get("scan"), dict) else {}
        if isinstance(scan, dict):
            seeds.extend(
                [
                    scan.get("questionText"),
                    scan.get("summary"),
                    scan.get("detailedExplanation"),
                    scan.get("extractedText"),
                ]
            )

    for item in history_messages[-4:]:
        if item.get("role") == "user":
            seeds.append(item.get("content"))

    focus_terms = top_keywords(" ".join(normalize_text(seed) for seed in seeds if normalize_text(seed)), limit=8)
    queries: list[str] = [message]

    if focus_terms:
        queries.append(" ".join(focus_terms[:4]))
        queries.append(f"{message} {' '.join(focus_terms[:3])}".strip())

    if analysis_payload:
        question_text = normalize_text(analysis_payload.get("questionText"))
        summary = normalize_text(analysis_payload.get("summary"))
        detailed = normalize_text(analysis_payload.get("detailedExplanation"))
        final_answer = normalize_text(analysis_payload.get("finalAnswer"))
        for value in (question_text, summary, detailed, final_answer):
            if value:
                queries.append(value)

    if thread is not None and thread.summary:
        queries.append(f"{message} {thread.summary}")

    if general_mode:
        queries.append(f"{message} school subject tutor")

    return [query for query in dedupe_preserve_order(queries) if normalize_text(query)]


def _build_context_summary(
    *,
    analysis_payload: dict[str, Any] | None,
    context_pack: dict[str, Any],
    thread: DoubtThread | None,
    general_mode: bool,
    intent: str,
) -> str:
    lines: list[str] = []
    lines.append("Mode: general study tutor" if general_mode else "Mode: homework doubt tutor")
    lines.append(f"Intent: {intent}")

    if thread is not None and thread.summary:
        lines.append(f"Conversation memory: {normalize_text(thread.summary)}")

    if analysis_payload:
        scan = analysis_payload.get("scan") if isinstance(analysis_payload.get("scan"), dict) else {}
        lines.extend(
            [
                f"Analysis ID: {analysis_payload.get('analysisId') or 'latest'}",
                f"Homework question: {normalize_text(analysis_payload.get('questionText')) or normalize_text(scan.get('questionText')) or 'Not available'}",
                f"Summary: {normalize_text(analysis_payload.get('summary')) or normalize_text(scan.get('summary')) or 'Not available'}",
                f"Main topic: {normalize_text(analysis_payload.get('mainTopic')) or normalize_text(scan.get('mainTopic')) or 'Not available'}",
                f"Key points: {normalize_text(', '.join(analysis_payload.get('keyPoints') or scan.get('keyPoints') or [])) or 'Not available'}",
                f"Important concepts: {normalize_text(', '.join(analysis_payload.get('importantConcepts') or scan.get('importantConcepts') or [])) or 'Not available'}",
                f"Detailed explanation: {normalize_text(analysis_payload.get('detailedExplanation')) or normalize_text(scan.get('detailedExplanation')) or 'Not available'}",
                f"Final takeaways: {normalize_text(analysis_payload.get('finalTakeaways') or scan.get('finalTakeaways')) or 'Not available'}",
                f"Final answer: {normalize_text(analysis_payload.get('finalAnswer')) or 'Not available'}",
            ]
        )

    context_text = normalize_text(context_pack.get("contextText"))
    if context_text:
        lines.append(f"Retrieved context:\n{context_text}")
    else:
        lines.append("Retrieved context: none")

    return "\n".join(lines)


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


def _fallback_general_reply(
    *,
    question: str,
    language: str,
    history_messages: list[dict[str, str]],
    thread_summary: str | None,
    intent: str,
) -> str:
    if language == "ta":
        intro = "நான் இதற்கு உதவுகிறேன்."
    elif language == "both":
        intro = "I can help with that. நான் இதை எளிமையாக விளக்குகிறேன்."
    else:
        intro = "I can help with that."

    parts = [intro]
    if question:
        parts.append(f"You asked: {question}.")

    if thread_summary:
        parts.append(f"Conversation memory: {thread_summary}.")

    if intent == "quiz":
        parts.append("Here is a quick practice question: What is the main idea you want to test?")
    elif intent == "simplify":
        parts.append("Here is the simplest version: focus on the main idea first, then the details.")
    elif intent == "example":
        parts.append("For example, think of a real-life situation where this idea appears.")
    elif intent == "step-by-step":
        parts.append("Let's break it into steps: 1) identify the goal, 2) gather facts, 3) answer clearly.")
    elif intent == "reason":
        parts.append("The key is to explain why the answer makes sense, not just what it is.")
    else:
        parts.append("Here is a clear answer to help you move forward.")

    if history_messages:
        last_user = next((item.get("content") for item in reversed(history_messages) if item.get("role") == "user"), None)
        if last_user and normalize_text(last_user) != normalize_text(question):
            parts.append(f"Last time you also asked about: {last_user}.")

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

    def _answer_general_chat(
        self,
        db: Session,
        *,
        user: UserProfile,
        message: str,
        language: str,
        history: list[dict[str, Any]] | None,
        thread_id: int | None,
    ) -> dict[str, Any]:
        normalized_message = normalize_text(message)
        if not normalized_message:
            return {
                "threadId": thread_id,
                "analysisId": None,
                "reply": "Please ask me anything and I will help.",
                "citations": [],
                "suggestedQuestions": [
                    "Explain this topic simply",
                    "Give me an example",
                    "Quiz me on this",
                ],
                "grounded": False,
            }

        thread = self._get_thread(
            db,
            user=user,
            analysis_id=None,
            thread_id=thread_id,
            language=language,
            analysis_payload=None,
        )

        intent = _intent_from_message(normalized_message)
        history_messages = _build_history_messages(thread, history or [])

        existing_summary = normalize_text(thread.summary)
        if not existing_summary or existing_summary == "General study session":
            summary_terms = top_keywords(
                " ".join(
                    part
                    for part in [
                        normalized_message,
                        *(item.get("content") for item in history_messages[-4:]),
                        thread.title,
                    ]
                    if part
                ),
                limit=6,
            )
            if summary_terms:
                thread.summary = f"Topics: {', '.join(summary_terms[:5])}"
            else:
                thread.summary = normalized_message[:120]

        if thread.title == "General study session":
            thread.title = normalized_message[:80]

        thread.language = normalize_language_code(language)
        thread.last_question = normalized_message
        db.add(thread)

        system_language = (
            "Answer in Tamil."
            if language == "ta"
            else "Answer in simple mixed Tamil and English."
            if language == "both"
            else "Answer in simple English."
        )
        system_prompt = build_assistant_prompt(
            task="general",
            language_rule=system_language,
            extra_rules=(
                "You are not tied to uploaded homework or scan context in this mode. "
                "Answer the student's question directly, helpfully, and with confidence across study, coding, writing, brainstorming, and everyday questions. "
                "If the question is unclear, ask one brief clarifying question. "
                "If the student wants an explanation, break it down step by step. "
                "If the student wants an example, give a concrete example. "
                "If the student wants a quiz, give a short practice question. "
                "Do not mention homework uploads unless the user brings them up."
            ),
        )
        intent_instruction = {
            "quiz": "When useful, end with one short practice question.",
            "simplify": "Use very simple words and avoid jargon.",
            "example": "Include a concrete example.",
            "reason": "Focus on why the answer makes sense.",
            "step-by-step": "Use numbered steps when helpful.",
            "translate": "Preserve meaning and keep the translation natural.",
        }.get(intent, "Answer clearly and directly.")

        conversation_context = "\n".join(
            [
                f"Thread summary: {normalize_text(thread.summary) or 'None'}",
                "Recent conversation:",
                *[f"{item['role']}: {item['content']}" for item in history_messages[-8:]],
            ]
        )

        reply = ""
        suggested_questions: list[str] = []
        grounded = False
        response_payload: dict[str, Any] | None = None

        if self.llm_router.configured:
            try:
                response_payload = self.llm_router.generate_json(
                    task="chat",
                    system_prompt=(
                        f"{system_prompt} Return a JSON object with reply, suggestedQuestions, grounded, threadSummary, and title. "
                        f"{intent_instruction}"
                    ),
                    user_prompt=normalized_message,
                    context_messages=[
                        {"role": "system", "content": f"Conversation context:\n{conversation_context}"},
                        *history_messages[-8:],
                    ],
                    temperature=0.35,
                    max_completion_tokens=1200,
                )
            except Exception:  # noqa: BLE001
                response_payload = None

            if isinstance(response_payload, dict):
                reply = normalize_text(
                    response_payload.get("reply")
                    or response_payload.get("answer")
                    or response_payload.get("response")
                    or ""
                )
                raw_suggestions = response_payload.get("suggestedQuestions") or response_payload.get("suggested_questions")
                if isinstance(raw_suggestions, list):
                    suggested_questions = [normalize_text(item) for item in raw_suggestions if normalize_text(item)]
                thread_summary = normalize_text(
                    response_payload.get("threadSummary")
                    or response_payload.get("memorySummary")
                    or response_payload.get("conversationSummary")
                )
                if thread_summary:
                    thread.summary = thread_summary[:400]
                title_hint = normalize_text(response_payload.get("title"))
                if title_hint:
                    thread.title = title_hint[:80]
                response_grounded = response_payload.get("grounded")
                grounded = bool(response_grounded) if isinstance(response_grounded, bool) else False

            if not reply:
                try:
                    reply = normalize_text(
                        self.llm_router.generate_text(
                            task="chat",
                            system_prompt=f"{system_prompt} {intent_instruction}",
                            user_prompt=(
                                f"Conversation context:\n{conversation_context}\n\n"
                                f"Student question: {normalized_message}\n"
                                "Answer directly and helpfully."
                            ),
                            context_messages=[
                                {"role": "system", "content": f"Conversation context:\n{conversation_context}"},
                                *history_messages[-8:],
                            ],
                            temperature=0.35,
                            max_completion_tokens=1200,
                        )
                        or ""
                    )
                except Exception:  # noqa: BLE001
                    reply = ""

        if not reply:
            reply = _fallback_general_reply(
                question=normalized_message,
                language=language,
                history_messages=history_messages,
                thread_summary=normalize_text(thread.summary),
                intent=intent,
            )

        reply = translate_text(reply, target_language=language)
        if not suggested_questions:
            suggested_questions = _suggested_questions(
                None,
                message=normalized_message,
                intent=intent,
                general_mode=True,
            )

        user_message = DoubtMessage(
            thread_id=thread.id,
            user_id=user.id,
            role="user",
            content=normalized_message,
            citations=[],
            metadata_json={
                "analysisId": None,
                "source": "general-chat-request",
                "mode": "general",
                "intent": intent,
                "retrievedCount": 0,
            },
        )
        assistant_message = DoubtMessage(
            thread_id=thread.id,
            user_id=user.id,
            role="assistant",
            content=reply,
            citations=[],
            metadata_json={
                "analysisId": None,
                "source": "general-chat-response",
                "mode": "general",
                "intent": intent,
                "retrievedCount": 0,
            },
        )
        db.add(user_message)
        db.add(assistant_message)
        db.commit()

        return DoubtAnswer(
            thread_id=thread.id,
            analysis_id=None,
            reply=reply,
            citations=[],
            suggested_questions=suggested_questions,
            grounded=grounded,
        ).model_dump()

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
        if analysis_id == -1:
            return self._answer_general_chat(
                db,
                user=user,
                message=normalized_message,
                language=language,
                history=history,
                thread_id=thread_id,
            )

        if not normalized_message:
            return {
                "threadId": thread_id,
                "analysisId": analysis_id,
                "reply": "Please ask a question about the scanned homework.",
                "citations": [],
                "suggestedQuestions": _suggested_questions(analysis_payload),
                "grounded": False,
            }

        if analysis_payload is None and analysis_id is not None:
            row = db.get(HomeworkAnalysis, analysis_id)
            analysis_payload = _analysis_payload_from_row(row)
        if analysis_payload is None:
            analysis_payload = self._get_latest_analysis(db, user)
        active_analysis_id = analysis_payload.get("analysisId") if analysis_payload else None

        thread = self._get_thread(
            db,
            user=user,
            analysis_id=active_analysis_id,
            thread_id=thread_id,
            language=language,
            analysis_payload=analysis_payload,
        )

        thread.last_question = normalized_message
        existing_summary = normalize_text(thread.summary)
        if not existing_summary or existing_summary == "General study session":
            summary_terms = top_keywords(
                " ".join(
                    part
                    for part in [
                        normalized_message,
                        normalize_text(analysis_payload.get("summary") if analysis_payload else None),
                        normalize_text(analysis_payload.get("questionText") if analysis_payload else None),
                    ]
                    if part
                ),
                limit=5,
            )
            if summary_terms:
                thread.summary = f"Study topics: {', '.join(summary_terms[:5])}"
            elif analysis_payload:
                thread.summary = normalize_text(analysis_payload.get("summary") or analysis_payload.get("questionText")) or thread.summary
            else:
                thread.summary = normalized_message[:120]

        if thread.title == "General study session" and normalized_message:
            thread.title = normalized_message[:80]
        thread.language = normalize_language_code(language)
        db.add(thread)

        intent = _intent_from_message(normalized_message)
        history_messages = _build_history_messages(thread, history or [])
        retrieval_queries = _build_retrieval_queries(
            message=normalized_message,
            analysis_payload=analysis_payload,
            thread=thread,
            history_messages=history_messages,
            general_mode=False,
        )
        context_pack = self.rag_service.build_context_pack(
            db,
            query=retrieval_queries[0],
            user_id=user.id,
            analysis_id=active_analysis_id,
            limit=5,
            extra_queries=retrieval_queries[1:],
        )
        context_text = normalize_text(context_pack.get("contextText"))
        citations = context_pack.get("citations") or []

        system_language = (
            "Answer in Tamil." if language == "ta" else "Answer in simple mixed Tamil and English." if language == "both" else "Answer in simple English."
        )
        system_prompt = build_assistant_prompt(
            task="tutor",
            language_rule=system_language,
            extra_rules=(
                "Only use the provided homework context, scan summary, detailed explanation, and retrieved passages. "
                "If the answer is not present in the context, say what is missing and ask for a clearer upload or more details. "
                "Explain step by step, using short paragraphs and student-friendly language."
            ),
        )
        context_summary = _build_context_summary(
            analysis_payload=analysis_payload,
            context_pack=context_pack,
            thread=thread,
            general_mode=False,
            intent=intent,
        )

        reply = ""
        suggested_questions: list[str] = []
        grounded = bool(citations) or analysis_payload is not None
        response_payload: dict[str, Any] | None = None
        if self.llm_router.configured:
            try:
                response_payload = self.llm_router.generate_json(
                    task="doubt",
                    system_prompt=system_prompt,
                    user_prompt=normalized_message,
                    context_messages=[
                        {"role": "system", "content": f"Grounded context:\n{context_summary}"},
                        *history_messages[-8:],
                    ],
                    temperature=0.25,
                    max_completion_tokens=1200,
                )
            except Exception:  # noqa: BLE001
                response_payload = None

            if isinstance(response_payload, dict):
                reply = normalize_text(
                    response_payload.get("reply")
                    or response_payload.get("answer")
                    or response_payload.get("response")
                    or ""
                )
                raw_suggestions = response_payload.get("suggestedQuestions") or response_payload.get("suggested_questions")
                if isinstance(raw_suggestions, list):
                    suggested_questions = [normalize_text(item) for item in raw_suggestions if normalize_text(item)]
                response_grounded = response_payload.get("grounded")
                if isinstance(response_grounded, bool):
                    grounded = response_grounded
                thread_summary = normalize_text(
                    response_payload.get("threadSummary")
                    or response_payload.get("memorySummary")
                    or response_payload.get("conversationSummary")
                )
                if thread_summary:
                    thread.summary = thread_summary[:400]
                title_hint = normalize_text(response_payload.get("title"))
                if title_hint:
                    thread.title = title_hint[:80]

            if not reply:
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
                            context_messages=[
                                {"role": "system", "content": f"Grounded context:\n{context_summary}"},
                                *history_messages[-8:],
                            ],
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
        if not suggested_questions:
            suggested_questions = _suggested_questions(
                analysis_payload,
                message=normalized_message,
                context_pack=context_pack,
                intent=intent,
                general_mode=False,
            )

        user_message = DoubtMessage(
            thread_id=thread.id,
            user_id=user.id,
            role="user",
            content=normalized_message,
            citations=citations,
            metadata_json={
                "analysisId": active_analysis_id,
                "source": "doubt-request",
                "mode": "homework",
                "intent": intent,
                "retrievedCount": context_pack.get("retrievedCount", 0),
            },
        )
        assistant_message = DoubtMessage(
            thread_id=thread.id,
            user_id=user.id,
            role="assistant",
            content=reply,
            citations=citations,
            metadata_json={
                "analysisId": active_analysis_id,
                "source": "doubt-response",
                "mode": "homework",
                "intent": intent,
                "retrievedCount": context_pack.get("retrievedCount", 0),
            },
        )
        db.add(user_message)
        db.add(assistant_message)
        db.commit()

        return DoubtAnswer(
            thread_id=thread.id,
            analysis_id=active_analysis_id,
            reply=reply,
            citations=citations,
            suggested_questions=suggested_questions,
            grounded=grounded,
        ).model_dump()


@lru_cache(maxsize=1)
def get_doubt_service() -> DoubtService:
    return DoubtService()

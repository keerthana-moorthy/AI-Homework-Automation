from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import re
from typing import Any
from uuid import uuid4

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from .analytics_service import build_student_analytics
from .common import normalize_text, top_keywords
from .llm_router import get_llm_router
from .math_service import build_math_explanation, solve_math_question
from .translation_service import translate_text
from ..constants import level_for_xp
from ..models import AdaptiveQuizAttempt, AdaptiveQuizSession, HomeworkAnalysis, UserProfile
from ..schemas import QuizQuestionOut, QuizStateOut, UserOut


DEFAULT_QUIZ_QUESTION_COUNT = 10
MAX_QUIZ_QUESTION_COUNT = 20
_OPTION_PREFIX_RE = re.compile(r"^\s*(?:option\s*)?[A-Da-d]\s*(?:\)|\.|:|-)\s*", re.IGNORECASE)


@dataclass(slots=True)
class QuizGenerationResult:
    quiz_id: str
    analysis_id: int | None
    subject_id: str
    topic: str
    difficulty: str
    title: str
    language: str
    question_count: int
    items: list[dict[str, Any]]
    mastery_snapshot: dict[str, Any]

    def model_dump(self) -> dict[str, Any]:
        return {
            "quiz": {
                "quizId": self.quiz_id,
                "analysisId": self.analysis_id,
                "subjectId": self.subject_id,
                "topic": self.topic,
                "difficulty": self.difficulty,
                "title": self.title,
                "language": self.language,
                "questionCount": self.question_count,
                "items": self.items,
                "masterySnapshot": self.mastery_snapshot,
            }
        }


def _extract_document_text(analysis_payload: dict[str, Any] | None) -> str:
    if not analysis_payload:
        return ""

    scan_payload = analysis_payload.get("scan") if isinstance(analysis_payload.get("scan"), dict) else {}
    candidates = [
        analysis_payload.get("extractedText"),
        analysis_payload.get("rawText"),
        scan_payload.get("extractedText") if isinstance(scan_payload, dict) else None,
        scan_payload.get("rawText") if isinstance(scan_payload, dict) else None,
        analysis_payload.get("questionText"),
        analysis_payload.get("summary"),
    ]
    for candidate in candidates:
        text = str(candidate or "").strip()
        if text:
            return text
    return ""


def _quiz_payload_state(session: AdaptiveQuizSession) -> dict[str, Any]:
    payload = dict(session.quiz_payload or {})
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    normalized_items = [item for item in items if isinstance(item, dict)]

    current_index_raw = payload.get("currentIndex", 0)
    try:
        current_index = int(current_index_raw)
    except (TypeError, ValueError):
        current_index = 0
    if normalized_items:
        current_index = max(0, min(current_index, len(normalized_items) - 1))
    else:
        current_index = 0

    status = normalize_text(payload.get("status") or "idle").lower()
    if status not in {"idle", "correct", "wrong"}:
        status = "idle"

    selected_option = normalize_text(payload.get("selectedOption")) or None
    try:
        xp_earned = int(payload.get("xpEarned") or 0)
    except (TypeError, ValueError):
        xp_earned = 0

    payload.update(
        {
            "items": normalized_items,
            "currentIndex": current_index,
            "status": status,
            "selectedOption": selected_option,
            "xpEarned": max(0, xp_earned),
        }
    )
    return payload


def build_adaptive_quiz_state(session: AdaptiveQuizSession) -> QuizStateOut:
    payload = _quiz_payload_state(session)
    questions: list[QuizQuestionOut] = []
    for item in payload.get("items") or []:
        try:
            questions.append(QuizQuestionOut.model_validate(item))
        except Exception:  # noqa: BLE001
            continue

    current_index = payload["currentIndex"] if questions else 0
    if questions:
        current_index = max(0, min(current_index, len(questions) - 1))
    current_question = questions[current_index] if questions else None

    status = payload["status"]
    toast_message = (
        "+10 XP earned! Keep going, you're on fire!"
        if status == "correct"
        else ("Oops! That's incorrect. Try again!" if status == "wrong" else None)
    )
    progress_percent = ((current_index + 1) / max(1, len(questions))) * 100 if questions else 0.0
    topic = normalize_text(payload.get("topic")) or session.topic
    title = normalize_text(payload.get("title")) or session.title
    subject_id = normalize_text(payload.get("subjectId")) or session.subject_id

    return QuizStateOut(
        questions=questions,
        current_index=current_index,
        current_question=current_question,
        selected_option=payload["selectedOption"],
        status=status,
        xp_earned_this_session=payload["xpEarned"],
        toast_message=toast_message,
        progress_percent=progress_percent,
        topic=topic or None,
        title=title or None,
        subject_id=subject_id or None,
    )


def _resolve_quiz_session(
    db: Session,
    *,
    user: UserProfile,
    quiz_session_id: str | None,
) -> AdaptiveQuizSession | None:
    if quiz_session_id:
        session = db.get(AdaptiveQuizSession, quiz_session_id)
        if session is None or session.user_id != user.id:
            raise ValueError("Quiz session not found")
        if session.status != "active":
            raise ValueError("Quiz session is not active")
        return session

    return db.scalar(
        select(AdaptiveQuizSession)
        .where(AdaptiveQuizSession.user_id == user.id, AdaptiveQuizSession.status == "active")
        .order_by(desc(AdaptiveQuizSession.created_at), desc(AdaptiveQuizSession.id))
    )


def _sync_user_quiz_state(
    user: UserProfile,
    *,
    current_index: int,
    selected_option: str | None,
    status: str,
    xp_earned: int,
) -> None:
    user.quiz_current_index = current_index
    user.quiz_selected_option = selected_option
    user.quiz_status = status
    user.quiz_xp_earned_this_session = xp_earned


def _analysis_payload_from_row(row: HomeworkAnalysis | None) -> dict[str, Any] | None:
    if row is None:
        return None
    payload = dict(row.raw_payload or {})
    payload["analysisId"] = row.id
    payload["questionText"] = payload.get("questionText") or row.question_text
    payload["summary"] = payload.get("summary") or row.summary
    payload["finalAnswer"] = payload.get("finalAnswer") or row.final_answer
    payload["steps"] = payload.get("steps") or row.steps
    payload["detectedSubject"] = payload.get("detectedSubject") or {
        "id": row.detected_subject_id,
        "confidence": row.confidence,
        "reason": "Loaded from stored analysis.",
    }
    return payload


def _subject_from_payload(analysis_payload: dict[str, Any] | None, fallback: str = "maths") -> str:
    if analysis_payload and isinstance(analysis_payload.get("detectedSubject"), dict):
        subject = normalize_text(analysis_payload["detectedSubject"].get("id"))
        if subject:
            return subject
    if analysis_payload:
        subject = normalize_text(analysis_payload.get("subject"))
        if subject:
            return subject
    return fallback


def _topic_from_payload(analysis_payload: dict[str, Any] | None, fallback: str = "general") -> str:
    if not analysis_payload:
        return fallback
    classification = analysis_payload.get("classification") if isinstance(analysis_payload.get("classification"), dict) else {}
    concepts = classification.get("concepts") or []
    for concept in concepts:
        if isinstance(concept, str) and normalize_text(concept):
            return normalize_text(concept)
    summary = normalize_text(analysis_payload.get("summary") or analysis_payload.get("questionText"))
    return summary[:80] if summary else fallback


def _difficulty_from_payload(analysis_payload: dict[str, Any] | None, analytics: dict[str, Any]) -> str:
    if analysis_payload:
        classification = analysis_payload.get("classification") if isinstance(analysis_payload.get("classification"), dict) else {}
        difficulty = normalize_text(classification.get("difficulty_level") or analysis_payload.get("difficulty"))
        if difficulty in {"easy", "medium", "hard"}:
            return difficulty

    weak_subjects = analytics.get("weakSubjects") or []
    if weak_subjects:
        weakest = weak_subjects[-1]
        mastery = float(weakest.get("masteryScore") or 50)
        if mastery < 45:
            return "easy"
        if mastery < 75:
            return "medium"
        return "hard"
    return "medium"


def _format_options_from_answer(answer: str, *, item_index: int = 0) -> list[str]:
    normalized = normalize_text(answer)
    if not normalized:
        normalized = "Review the explanation"
    if "=" in normalized:
        value = normalized.split("=", 1)[-1].strip()
    else:
        value = normalized
    distractors = [
        f"Not {value}",
        f"Almost {value}",
        f"Check {value}",
    ]
    options = [
        f"A) {distractors[0]}",
        f"B) {value}",
        f"C) {distractors[1]}",
        f"D) {distractors[2]}",
    ]
    if item_index % 2 == 1:
        options = [f"A) {value}", f"B) {distractors[0]}", f"C) {distractors[1]}", f"D) {distractors[2]}"]
    return options


def _math_quiz_items(analysis_payload: dict[str, Any] | None, question_count: int, difficulty: str) -> list[dict[str, Any]]:
    question_text = normalize_text(analysis_payload.get("questionText") if analysis_payload else None)
    solution = solve_math_question(question_text) if question_text else None
    explanation = build_math_explanation(solution)
    answer = normalize_text(solution.get("finalAnswer") if solution else analysis_payload.get("finalAnswer") if analysis_payload else None)
    base_topic = normalize_text(explanation.get("problemType") or "math")
    items: list[dict[str, Any]] = []

    if answer:
        for index in range(question_count):
            item_type = ["mcq", "fill_blank", "reasoning", "numerical"][index % 4]
            item_id = f"math-{uuid4().hex[:8]}-{index + 1}"
            prompt = [
                f"Which option matches the final answer for {question_text}?" if item_type == "mcq" else None,
                f"Fill in the blank: {question_text} => ______" if item_type == "fill_blank" else None,
                "What is the first algebra step you should take?" if item_type == "reasoning" else None,
                f"Write the final answer for: {question_text}" if item_type == "numerical" else None,
            ][index % 4]
            prompt = prompt or f"Answer this math question based on the scan: {question_text}"
            items.append(
                {
                    "id": item_id,
                    "type": item_type,
                    "question": prompt,
                    "options": _format_options_from_answer(answer, item_index=index),
                    "correctOption": f"B) {answer.split('=', 1)[-1].strip() if '=' in answer else answer}",
                    "explanation": explanation.get("detailedExplanation") or explanation.get("summary") or answer,
                    "topic": base_topic,
                    "difficulty": difficulty,
                }
            )
        return items

    return items


def _canonical_option_text(value: str | None) -> str:
    text = normalize_text(value)
    text = _OPTION_PREFIX_RE.sub("", text)
    return normalize_text(text).casefold()


def _is_answer_correct(chosen: str, correct: str) -> bool:
    return _canonical_option_text(chosen) == _canonical_option_text(correct)


def _llm_generate_quiz_items(
    *,
    analysis_payload: dict[str, Any] | None,
    extracted_text: str | None,
    topic: str,
    difficulty: str,
    question_count: int,
    language: str,
) -> list[dict[str, Any]] | None:
    router = get_llm_router()
    if not router.configured:
        return None

    question_text = normalize_text(analysis_payload.get("questionText") if analysis_payload else None)
    summary = normalize_text(analysis_payload.get("summary") if analysis_payload else None)
    subject = _subject_from_payload(analysis_payload)
    system_prompt = (
        "You are an educational quiz generator for Vidya AI. "
        "Create a JSON object only. The JSON must contain quizId, title, subjectId, topic, difficulty, language, and items. "
        "Each item must include id, type, question, options, correctOption, explanation, topic, and difficulty. "
        "You MUST generate every question, correct answer, and explanation strictly from the provided Document Content. "
        "Do not use outside knowledge or invent facts. If the content is short, ask multiple questions about different facts or wording from the same content, but never add new information. "
        "Use one or more of the types: mcq, fill_blank, short_answer, reasoning, numerical. "
        "Ensure the correctOption is present inside options for MCQ-style items. "
        "Keep language simple for a student."
    )
    user_prompt = (
        f"Document Content (authoritative source):\n{extracted_text or question_text or summary or 'not available'}\n\n"
        "Rules:\n"
        "- Every quiz item must be answerable using only the document content above.\n"
        "- Do not add outside facts, assumptions, or generic textbook knowledge.\n"
        "- Create exactly the requested number of distinct items.\n"
        "- Keep the correct option grounded in the document text.\n\n"
        f"Homework question: {question_text or 'not available'}\n"
        f"Homework summary: {summary or 'not available'}\n"
        f"Subject: {subject}\n"
        f"Topic: {topic}\n"
        f"Difficulty: {difficulty}\n"
        f"Language: {language}\n"
        f"Generate exactly {question_count} distinct quiz items based ONLY on the Document Content above."
    )
    raw = router.generate_json(
        task="quiz",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.25,
        max_completion_tokens=1800,
    )
    if not raw:
        return None

    items: list[dict[str, Any]] = []
    for index, item in enumerate(raw.get("items") or [], start=1):
        if not isinstance(item, dict):
            continue
        options = item.get("options") if isinstance(item.get("options"), list) else []
        options = [normalize_text(option) for option in options if normalize_text(option)]
        correct_option = normalize_text(item.get("correctOption"))
        if not correct_option:
            continue
        if options and correct_option not in options:
            options.append(correct_option)
        if not options:
            options = _format_options_from_answer(correct_option, item_index=index)
        items.append(
            {
                "id": normalize_text(item.get("id")) or f"quiz-{uuid4().hex[:8]}-{index}",
                "type": normalize_text(item.get("type")) or "mcq",
                "question": normalize_text(item.get("question")) or "Review the concept from the scan.",
                "options": options[:4] if len(options) >= 4 else options,
                "correctOption": correct_option,
                "explanation": normalize_text(item.get("explanation")) or normalize_text(item.get("answer")),
                "topic": normalize_text(item.get("topic")) or topic,
                "difficulty": normalize_text(item.get("difficulty")) or difficulty,
            }
        )
    if not items:
        return None
    return items[:question_count]


def _fallback_quiz_items(
    *,
    analysis_payload: dict[str, Any] | None,
    extracted_text: str | None,
    topic: str,
    difficulty: str,
    question_count: int,
    language: str,
    start_index: int = 0,
) -> list[dict[str, Any]]:
    question_text = normalize_text(analysis_payload.get("questionText") if analysis_payload else None) or "the scanned homework"
    summary = normalize_text(analysis_payload.get("summary") if analysis_payload else None)
    explanation = normalize_text(analysis_payload.get("detailedExplanation") if analysis_payload else None)
    final_answer = normalize_text(analysis_payload.get("finalAnswer") if analysis_payload else None)
    topic_label = topic or "general concept"
    source_text = extracted_text or " ".join(value for value in [question_text, summary, explanation, final_answer, topic_label] if value)
    focus_terms = top_keywords(source_text, limit=max(question_count * 2, 8))
    if not focus_terms:
        focus_terms = [topic_label]

    items: list[dict[str, Any]] = []
    for offset in range(question_count):
        index = start_index + offset
        focus = focus_terms[offset % len(focus_terms)]
        item_type = ["mcq", "fill_blank", "short_answer", "reasoning"][index % 4]
        item_id = f"quiz-{uuid4().hex[:8]}-{index + 1}"
        if item_type == "mcq":
            question = f"Which detail in the document is most closely related to '{focus}'?"
            correct_option = f"B) {focus}"
        elif item_type == "fill_blank":
            question = f"Fill in the blank: The document focuses on _____ and related ideas."
            correct_option = f"B) {focus}"
        elif item_type == "short_answer":
            question = f"In one sentence, what does the document say about {focus}?"
            correct_option = f"B) {summary or explanation or focus}"
        else:
            question = f"How would you explain the idea of {focus} using the document?"
            correct_option = f"B) {final_answer or summary or explanation or focus}"

        options = _format_options_from_answer(correct_option, item_index=index)
        if item_type == "short_answer":
            options = [
                f"A) {focus}",
                f"B) {summary or explanation or focus}",
                "C) Try the same idea again",
                "D) Look at unrelated facts",
            ]
        items.append(
            {
                "id": item_id,
                "type": item_type,
                "question": question,
                "options": options,
                "correctOption": correct_option,
                "explanation": explanation or summary or final_answer or topic_label,
                "topic": topic_label,
                "difficulty": difficulty,
            }
        )
    return items


def _normalize_items(items: list[dict[str, Any]], question_count: int) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(items[:question_count], start=1):
        options = [normalize_text(option) for option in item.get("options") or [] if normalize_text(option)]
        if len(options) < 2:
            options = _format_options_from_answer(item.get("correctOption") or "Review", item_index=index)
        correct_option = normalize_text(item.get("correctOption"))
        if correct_option and correct_option not in options:
            options.append(correct_option)
        if len(options) < 4:
            fallback_options = _format_options_from_answer(correct_option or item.get("question") or "Review", item_index=index)
            for fallback_option in fallback_options:
                if len(options) >= 4:
                    break
                if fallback_option not in options:
                    options.append(fallback_option)
        normalized.append(
            {
                "id": normalize_text(item.get("id")) or f"quiz-{uuid4().hex[:8]}-{index}",
                "type": normalize_text(item.get("type")) or "mcq",
                "question": normalize_text(item.get("question")) or "Review the scanned homework.",
                "options": options[:4],
                "correctOption": correct_option or options[0],
                "explanation": normalize_text(item.get("explanation")) or "",
                "topic": normalize_text(item.get("topic")) or "general",
                "difficulty": normalize_text(item.get("difficulty")) or "medium",
            }
        )
    return normalized


def _build_session_payload(
    *,
    quiz_id: str,
    analysis_id: int | None,
    subject_id: str,
    topic: str,
    difficulty: str,
    language: str,
    question_count: int,
    items: list[dict[str, Any]],
    mastery_snapshot: dict[str, Any],
    title: str,
) -> dict[str, Any]:
    return {
        "quizId": quiz_id,
        "analysisId": analysis_id,
        "subjectId": subject_id,
        "topic": topic,
        "difficulty": difficulty,
        "title": title,
        "language": language,
        "questionCount": question_count,
        "items": items,
        "masterySnapshot": mastery_snapshot,
        "currentIndex": 0,
        "status": "idle",
        "selectedOption": None,
        "xpEarned": 0,
    }


class QuizService:
    def generate_quiz(
        self,
        db: Session,
        *,
        user: UserProfile,
        analysis_payload: dict[str, Any] | None = None,
        analysis_id: int | None = None,
        topic: str | None = None,
        difficulty: str | None = None,
        question_count: int = DEFAULT_QUIZ_QUESTION_COUNT,
        language: str = "en",
        adaptive: bool = True,
    ) -> dict[str, Any]:
        if analysis_payload is None and analysis_id is not None:
            row = db.get(HomeworkAnalysis, analysis_id)
            analysis_payload = _analysis_payload_from_row(row)
        if analysis_payload is None:
            row = db.scalar(
                select(HomeworkAnalysis)
                .where(HomeworkAnalysis.user_id == user.id)
                .order_by(desc(HomeworkAnalysis.created_at), desc(HomeworkAnalysis.id))
            )
            analysis_payload = _analysis_payload_from_row(row)

        analytics = build_student_analytics(db, user)
        subject_id = _subject_from_payload(analysis_payload, fallback=user.selected_subject_id or "maths")
        topic_name = topic or _topic_from_payload(analysis_payload, fallback="general")
        difficulty_name = (difficulty or _difficulty_from_payload(analysis_payload, analytics)).lower()
        question_count = max(DEFAULT_QUIZ_QUESTION_COUNT, min(MAX_QUIZ_QUESTION_COUNT, int(question_count or DEFAULT_QUIZ_QUESTION_COUNT)))
        extracted_text = _extract_document_text(analysis_payload)

        items = None
        if adaptive and subject_id == "maths":
            items = _math_quiz_items(analysis_payload, question_count, difficulty_name)
        if not items:
            items = _llm_generate_quiz_items(
                analysis_payload=analysis_payload,
                extracted_text=extracted_text,
                topic=topic_name,
                difficulty=difficulty_name,
                question_count=question_count,
                language=language,
            )
        if not items:
            items = _fallback_quiz_items(
                analysis_payload=analysis_payload,
                extracted_text=extracted_text,
                topic=topic_name,
                difficulty=difficulty_name,
                question_count=question_count,
                language=language,
            )

        items = _normalize_items(items, question_count)
        if len(items) < question_count:
            filler_items = _fallback_quiz_items(
                analysis_payload=analysis_payload,
                extracted_text=extracted_text,
                topic=topic_name,
                difficulty=difficulty_name,
                question_count=question_count - len(items),
                language=language,
                start_index=len(items),
            )
            items = _normalize_items(items + filler_items, question_count)
        if language and language != "en":
            for item in items:
                item["question"] = translate_text(item.get("question"), target_language=language)
                item["explanation"] = translate_text(item.get("explanation"), target_language=language)
        quiz_id = str(uuid4())
        title = f"{topic_name.title()} practice quiz"
        mastery_snapshot = {
            "accuracy": analytics.get("accuracy"),
            "quizAccuracy": analytics.get("quizAccuracy"),
            "weakSubjects": analytics.get("weakSubjects")[:3],
            "recommendedConcepts": analytics.get("recommendedConcepts")[:5],
        }

        session = AdaptiveQuizSession(
            id=quiz_id,
            user_id=user.id,
            analysis_id=analysis_id,
            subject_id=subject_id,
            topic=topic_name,
            difficulty=difficulty_name,
            title=title,
            language=language,
            question_count=question_count,
            status="active",
            quiz_payload=_build_session_payload(
                quiz_id=quiz_id,
                analysis_id=analysis_id,
                subject_id=subject_id,
                topic=topic_name,
                difficulty=difficulty_name,
                language=language,
                question_count=question_count,
                items=items,
                mastery_snapshot=mastery_snapshot,
                title=title,
            )
            | {"generatedAt": datetime.utcnow().isoformat() + "Z"},
            mastery_snapshot=mastery_snapshot,
        )
        db.add(session)
        db.commit()

        return QuizGenerationResult(
            quiz_id=quiz_id,
            analysis_id=analysis_id,
            subject_id=subject_id,
            topic=topic_name,
            difficulty=difficulty_name,
            title=title,
            language=language,
            question_count=question_count,
            items=items,
            mastery_snapshot=mastery_snapshot,
        ).model_dump()

    def answer_quiz(
        self,
        db: Session,
        *,
        user: UserProfile,
        selected_option: str,
        quiz_session_id: str | None = None,
        question_id: str | None = None,
        response_seconds: float | None = None,
    ) -> dict[str, Any]:
        session = _resolve_quiz_session(db, user=user, quiz_session_id=quiz_session_id)
        if session is None:
            raise ValueError("Quiz session not found")

        quiz_payload = _quiz_payload_state(session)
        items = quiz_payload.get("items") if isinstance(quiz_payload.get("items"), list) else []
        if not items:
            raise ValueError("Quiz items are not available")

        if quiz_payload["status"] != "idle":
            raise ValueError("The current question has already been answered")

        current_index = quiz_payload["currentIndex"]
        item = None
        if question_id:
            question_key = normalize_text(question_id)
            for index, entry in enumerate(items):
                if normalize_text(entry.get("id")) == question_key:
                    item = entry
                    current_index = index
                    break
        if item is None:
            if current_index >= len(items):
                current_index = len(items) - 1
            item = items[current_index]

        correct_option = normalize_text(item.get("correctOption"))
        chosen_option = normalize_text(selected_option)
        is_correct = _is_answer_correct(chosen_option, correct_option)
        xp_awarded = 10 if is_correct else 0

        db.add(
            AdaptiveQuizAttempt(
                session_id=session.id,
                user_id=user.id,
                item_id=normalize_text(item.get("id")) or "quiz-item",
                selected_option=chosen_option,
                correct=is_correct,
                xp_awarded=xp_awarded,
                response_seconds=response_seconds,
            )
        )
        db.flush()
        quiz_payload["currentIndex"] = current_index
        quiz_payload["status"] = "correct" if is_correct else "wrong"
        quiz_payload["selectedOption"] = chosen_option
        quiz_payload["xpEarned"] = int(quiz_payload.get("xpEarned") or 0) + xp_awarded
        session.quiz_payload = quiz_payload
        session.updated_at = datetime.utcnow()
        session.status = "active"

        _sync_user_quiz_state(
            user,
            current_index=current_index,
            selected_option=chosen_option,
            status=quiz_payload["status"],
            xp_earned=quiz_payload["xpEarned"],
        )
        user.quiz_answered += 1
        if is_correct:
            user.quiz_correct += 1
            user.xp_points += xp_awarded
            user.level = level_for_xp(user.xp_points)

        db.add(session)
        db.add(user)
        db.commit()

        explanation = normalize_text(item.get("explanation")) or "Review the explanation again for this concept."
        if session.language and session.language != "en":
            explanation = translate_text(explanation, target_language=session.language)

        return {
            "ok": True,
            "quizId": session.id,
            "analysisId": session.analysis_id,
            "result": {
                "correct": is_correct,
                "correctOption": correct_option,
                "selectedOption": chosen_option,
                "xpAwarded": xp_awarded,
                "toastMessage": "+10 XP earned! Great job!" if is_correct else "Not quite. Re-read the explanation and try again.",
                "explanation": explanation,
                "topic": session.topic,
                "difficulty": session.difficulty,
            },
            "quiz": build_adaptive_quiz_state(session).model_dump(by_alias=True, exclude_none=True),
            "user": UserOut.model_validate(user).model_dump(by_alias=True, exclude_none=True),
        }

    def next_quiz(
        self,
        db: Session,
        *,
        user: UserProfile,
        quiz_session_id: str | None = None,
    ) -> dict[str, Any]:
        session = _resolve_quiz_session(db, user=user, quiz_session_id=quiz_session_id)
        if session is None:
            raise ValueError("Quiz session not found")

        quiz_payload = _quiz_payload_state(session)
        items = quiz_payload.get("items") if isinstance(quiz_payload.get("items"), list) else []
        if not items:
            raise ValueError("Quiz items are not available")

        if quiz_payload["status"] == "idle":
            raise ValueError("The current question has not been answered yet")

        current_index = quiz_payload["currentIndex"]
        next_index = min(current_index + 1, len(items) - 1)
        quiz_payload["currentIndex"] = next_index
        quiz_payload["status"] = "idle"
        quiz_payload["selectedOption"] = None
        session.quiz_payload = quiz_payload
        session.updated_at = datetime.utcnow()
        session.status = "active"

        _sync_user_quiz_state(
            user,
            current_index=next_index,
            selected_option=None,
            status="idle",
            xp_earned=quiz_payload["xpEarned"],
        )

        db.add(session)
        db.add(user)
        db.commit()

        return {
            "ok": True,
            "quiz": build_adaptive_quiz_state(session).model_dump(by_alias=True, exclude_none=True),
        }

    def complete_quiz_session(
        self,
        db: Session,
        *,
        user: UserProfile,
        quiz_session_id: str | None = None,
    ) -> dict[str, Any]:
        session = _resolve_quiz_session(db, user=user, quiz_session_id=quiz_session_id)
        if session is None:
            raise ValueError("Quiz session not found")

        session.status = "completed"
        session.updated_at = datetime.utcnow()
        db.add(session)

        _sync_user_quiz_state(
            user,
            current_index=0,
            selected_option=None,
            status="idle",
            xp_earned=0,
        )
        db.add(user)
        db.commit()

        return {
            "ok": True,
            "quizId": session.id,
            "analysisId": session.analysis_id,
        }


def get_quiz_service() -> QuizService:
    return QuizService()

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from .analytics_service import build_student_analytics
from .common import clamp, normalize_text
from .llm_router import get_llm_router
from .math_service import build_math_explanation, solve_math_question
from .translation_service import translate_text
from ..models import AdaptiveQuizAttempt, AdaptiveQuizSession, HomeworkAnalysis, UserProfile


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


def _llm_generate_quiz_items(
    *,
    analysis_payload: dict[str, Any] | None,
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
        "Keep the questions grounded in the homework context. Do not invent facts outside the provided scan. "
        "Use one or more of the types: mcq, fill_blank, short_answer, reasoning, numerical. "
        "Ensure the correctOption is present inside options for MCQ-style items. "
        "Keep language simple for a student."
    )
    user_prompt = (
        f"Homework question: {question_text or 'not available'}\n"
        f"Homework summary: {summary or 'not available'}\n"
        f"Subject: {subject}\n"
        f"Topic: {topic}\n"
        f"Difficulty: {difficulty}\n"
        f"Language: {language}\n"
        f"Generate exactly {question_count} quiz items."
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
    return items[:question_count] if items else None


def _fallback_quiz_items(
    *,
    analysis_payload: dict[str, Any] | None,
    topic: str,
    difficulty: str,
    question_count: int,
    language: str,
) -> list[dict[str, Any]]:
    question_text = normalize_text(analysis_payload.get("questionText") if analysis_payload else None) or "the scanned homework"
    summary = normalize_text(analysis_payload.get("summary") if analysis_payload else None)
    explanation = normalize_text(analysis_payload.get("detailedExplanation") if analysis_payload else None)
    final_answer = normalize_text(analysis_payload.get("finalAnswer") if analysis_payload else None)
    topic_label = topic or "general concept"

    items: list[dict[str, Any]] = []
    for index in range(question_count):
        item_type = ["mcq", "fill_blank", "short_answer", "reasoning"][index % 4]
        item_id = f"quiz-{uuid4().hex[:8]}-{index + 1}"
        if item_type == "mcq":
            question = f"Which statement best matches the concept in {question_text}?"
            correct_option = f"B) {summary or explanation or final_answer or topic_label}"
        elif item_type == "fill_blank":
            question = f"Fill in the blank: The key idea is _____ for {topic_label}."
            correct_option = f"B) {topic_label}"
        elif item_type == "short_answer":
            question = f"Explain the main idea behind {topic_label} in one sentence."
            correct_option = f"B) {summary or explanation or topic_label}"
        else:
            question = f"How would you solve or explain the question in the scan step by step?"
            correct_option = f"B) {final_answer or summary or explanation or topic_label}"

        options = _format_options_from_answer(correct_option, item_index=index)
        if item_type == "short_answer":
            options = [
                f"A) {summary or topic_label}",
                f"B) {explanation or final_answer or topic_label}",
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
        question_count: int = 5,
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
        question_count = max(1, min(8, int(question_count or 5)))

        items = None
        if adaptive and subject_id == "maths":
            items = _math_quiz_items(analysis_payload, question_count, difficulty_name)
        if not items:
            items = _llm_generate_quiz_items(
                analysis_payload=analysis_payload,
                topic=topic_name,
                difficulty=difficulty_name,
                question_count=question_count,
                language=language,
            )
        if not items:
            items = _fallback_quiz_items(
                analysis_payload=analysis_payload,
                topic=topic_name,
                difficulty=difficulty_name,
                question_count=question_count,
                language=language,
            )

        items = _normalize_items(items, question_count)
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
            quiz_payload={"items": items, "analysisId": analysis_id, "generatedAt": datetime.utcnow().isoformat() + "Z"},
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
        quiz_session_id: str,
        question_id: str | None = None,
        response_seconds: float | None = None,
    ) -> dict[str, Any]:
        session = db.get(AdaptiveQuizSession, quiz_session_id)
        if session is None or session.user_id != user.id:
            raise ValueError("Quiz session not found")

        quiz_payload = session.quiz_payload if isinstance(session.quiz_payload, dict) else {}
        items = quiz_payload.get("items") if isinstance(quiz_payload.get("items"), list) else []
        if not items:
            raise ValueError("Quiz items are not available")

        item = None
        if question_id:
            item = next((entry for entry in items if normalize_text(entry.get("id")) == normalize_text(question_id)), None)
        if item is None:
            item = items[0]

        correct_option = normalize_text(item.get("correctOption"))
        chosen_option = normalize_text(selected_option)
        is_correct = chosen_option == correct_option
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
        session.updated_at = datetime.utcnow()
        answered_count = db.scalar(select(func.count()).select_from(AdaptiveQuizAttempt).where(AdaptiveQuizAttempt.session_id == session.id)) or 0
        if answered_count >= len(items):
            session.status = "completed"
        db.add(session)
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
            "quiz": {
                "quizId": session.id,
                "analysisId": session.analysis_id,
                "subjectId": session.subject_id,
                "topic": session.topic,
                "difficulty": session.difficulty,
                "title": session.title,
                "language": session.language,
                "questionCount": session.question_count,
                "items": items,
                "masterySnapshot": session.mastery_snapshot,
            },
        }


def get_quiz_service() -> QuizService:
    return QuizService()

from __future__ import annotations

from datetime import datetime, timedelta
from statistics import mean
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from .common import clamp, normalize_text, top_keywords
from ..constants import SUBJECTS
from ..models import AdaptiveQuizAttempt, DoubtMessage, DoubtThread, HomeworkAnalysis, QuizAttempt, QuizQuestion, UserProfile


def _subject_map() -> dict[str, dict[str, Any]]:
    return {item["id"]: item for item in SUBJECTS}


def _subject_mastery_from_rows(
    *,
    analyses: list[HomeworkAnalysis],
    quiz_attempts: list[QuizAttempt],
    adaptive_attempts: list[AdaptiveQuizAttempt],
    doubts: list[DoubtMessage],
    question_subject_lookup: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    subject_lookup = _subject_map()
    analysis_subject_lookup = {row.id: row.detected_subject_id or row.subject_id for row in analyses}
    mastery_rows: list[dict[str, Any]] = []

    for subject_id, subject_info in subject_lookup.items():
        subject_analyses = [row for row in analyses if row.subject_id == subject_id or row.detected_subject_id == subject_id]
        subject_quiz_attempts = [attempt for attempt in quiz_attempts if (question_subject_lookup or {}).get(attempt.question_id) == subject_id]
        subject_adaptive = [attempt for attempt in adaptive_attempts if getattr(attempt.session, "subject_id", None) == subject_id]
        subject_doubts = [
            doubt
            for doubt in doubts
        if analysis_subject_lookup.get(doubt.thread.analysis_id if getattr(doubt, "thread", None) is not None else None, "") == subject_id
        ]

        completion_rate = len([row for row in subject_analyses if row.status == "ok"]) / max(1, len(subject_analyses))
        quiz_accuracy = (
            sum(1 for attempt in subject_quiz_attempts if attempt.correct) + sum(1 for attempt in subject_adaptive if attempt.correct)
        ) / max(1, len(subject_quiz_attempts) + len(subject_adaptive))
        confidence = mean([row.confidence for row in subject_analyses]) if subject_analyses else 0.5
        doubt_penalty = min(0.25, len(subject_doubts) * 0.02)

        mastery = clamp((completion_rate * 0.45) + (quiz_accuracy * 0.4) + (confidence * 0.15) - doubt_penalty, 0.0, 1.0)
        mastery_rows.append(
            {
                "subjectId": subject_id,
                "subject": subject_info["name"],
                "masteryScore": round(mastery * 100, 1),
                "analysisCount": len(subject_analyses),
                "quizAccuracy": round(quiz_accuracy * 100, 1),
                "doubtCount": len(subject_doubts),
                "focusArea": subject_info["focusArea"],
            }
        )

    return sorted(mastery_rows, key=lambda item: (item["masteryScore"], item["analysisCount"]), reverse=True)


def _recent_analysis_rows(analyses: list[HomeworkAnalysis], limit: int = 5) -> list[dict[str, Any]]:
    recent: list[dict[str, Any]] = []
    for row in sorted(analyses, key=lambda item: item.created_at, reverse=True)[:limit]:
        recent.append(
            {
                "analysisId": row.id,
                "subjectId": row.detected_subject_id,
                "status": row.status,
                "summary": normalize_text(row.summary or row.question_text),
                "createdAt": row.created_at.isoformat(),
            }
        )
    return recent


def _recent_keywords(analyses: list[HomeworkAnalysis]) -> list[str]:
    keywords: list[str] = []
    for row in analyses[-10:]:
        payload = row.raw_payload if isinstance(row.raw_payload, dict) else {}
        classification = payload.get("classification") if isinstance(payload.get("classification"), dict) else {}
        for concept in classification.get("concepts") or []:
            if isinstance(concept, str):
                keywords.append(concept)
        keywords.extend(top_keywords(row.question_text, limit=5))
    deduped: list[str] = []
    for keyword in keywords:
        normalized = normalize_text(keyword)
        if normalized and normalized not in deduped:
            deduped.append(normalized)
    return deduped[:8]


def build_student_analytics(db: Session, user: UserProfile) -> dict[str, Any]:
    analyses = list(
        db.scalars(
            select(HomeworkAnalysis)
            .where(HomeworkAnalysis.user_id == user.id)
            .order_by(desc(HomeworkAnalysis.created_at), desc(HomeworkAnalysis.id))
        ).all()
    )
    quiz_attempts = list(db.scalars(select(QuizAttempt).where(QuizAttempt.user_id == user.id)).all())
    adaptive_attempts = list(
        db.scalars(
            select(AdaptiveQuizAttempt)
            .where(AdaptiveQuizAttempt.user_id == user.id)
            .order_by(desc(AdaptiveQuizAttempt.created_at))
        ).all()
    )
    doubts = list(
        db.scalars(
            select(DoubtMessage)
            .join(DoubtThread, DoubtMessage.thread_id == DoubtThread.id)
            .where(DoubtThread.user_id == user.id)
            .order_by(desc(DoubtMessage.created_at))
        ).all()
    )
    question_map = {question.id: question.subject_id for question in db.scalars(select(QuizQuestion)).all()}

    total_attempts = len(quiz_attempts) + len(adaptive_attempts)
    total_correct = sum(1 for attempt in quiz_attempts if attempt.correct) + sum(1 for attempt in adaptive_attempts if attempt.correct)
    accuracy = total_correct / max(1, total_attempts)

    mastery_rows = _subject_mastery_from_rows(
        analyses=analyses,
        quiz_attempts=quiz_attempts,
        adaptive_attempts=adaptive_attempts,
        doubts=doubts,
        question_subject_lookup=question_map,
    )
    weak_subjects = [row for row in mastery_rows if row["masteryScore"] < 65][:3]
    recent_analyses = _recent_analysis_rows(analyses)
    recommended_concepts = _recent_keywords(analyses)
    avg_response_seconds_values = [attempt.response_seconds for attempt in adaptive_attempts if attempt.response_seconds is not None]
    avg_response_seconds = float(mean(avg_response_seconds_values)) if avg_response_seconds_values else None

    cutoff = datetime.utcnow() - timedelta(days=7)
    weekly_analyses = sum(1 for row in analyses if row.created_at >= cutoff)
    weekly_quiz = sum(1 for row in quiz_attempts if row.created_at >= cutoff) + sum(1 for row in adaptive_attempts if row.created_at >= cutoff)
    learning_velocity = round((weekly_analyses * 1.0) + (weekly_quiz * 0.6) + (len(doubts) * 0.15), 2)

    revision_priorities = [
        {
            "subjectId": row["subjectId"],
            "subject": row["subject"],
            "masteryScore": row["masteryScore"],
            "reason": "Lower mastery and repeated doubts" if row["doubtCount"] else "Improve accuracy with practice",
            "focusArea": row["focusArea"],
        }
        for row in weak_subjects
    ]

    return {
        "userId": user.id,
        "accuracy": round(accuracy, 3),
        "quizAccuracy": round((total_correct / max(1, len(quiz_attempts))) if quiz_attempts else 0.0, 3),
        "masteryBySubject": mastery_rows,
        "weakSubjects": weak_subjects,
        "recentAnalyses": recent_analyses,
        "doubtCount": len(doubts),
        "avgResponseSeconds": round(avg_response_seconds, 2) if avg_response_seconds is not None else None,
        "learningVelocity": learning_velocity,
        "recommendedConcepts": recommended_concepts,
        "revisionPriorities": revision_priorities,
        "activeSubjectId": user.selected_subject_id,
    }


def build_recommendations(
    db: Session,
    user: UserProfile,
    *,
    analysis_payload: dict[str, Any] | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    analytics = build_student_analytics(db, user)
    recommendations: list[dict[str, Any]] = []

    if analysis_payload:
        summary = normalize_text(analysis_payload.get("summary") or analysis_payload.get("questionText"))
        if summary:
            recommendations.append(
                {
                    "id": f"analysis-{analysis_payload.get('analysisId', 'latest')}",
                    "emoji": "💡",
                    "title": "Review the latest homework",
                    "description": summary,
                }
            )

    for subject in analytics["weakSubjects"][:limit]:
        recommendations.append(
            {
                "id": f"weak-{subject['subjectId']}",
                "emoji": "🎯",
                "title": f"Strengthen {subject['subject']}",
                "description": f"Focus on {subject['focusArea'].lower()} to lift mastery from {subject['masteryScore']}%.",
            }
        )

    if not recommendations:
        recommendations.append(
            {
                "id": "review-1",
                "emoji": "📘",
                "title": "Keep practicing",
                "description": "Work through one scan, one doubt, and one quiz to keep learning velocity high.",
            }
        )

    deduped: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for item in recommendations:
        if item["id"] in seen_ids:
            continue
        seen_ids.add(item["id"])
        deduped.append(item)
    return deduped[:limit]

from __future__ import annotations

from typing import Any

from ..constants import SUBJECTS


def build_daily_plan(user: Any, selected_subject_id: str | None, last_analysis: dict[str, Any] | None) -> list[dict[str, Any]]:
    focus_subject = next((subject for subject in SUBJECTS if subject["id"] == (selected_subject_id or "maths")), SUBJECTS[0])
    weakest_subject = min(SUBJECTS, key=lambda item: item["progress"])

    plan = [
        {
            "id": "warmup",
            "title": f"10-minute {focus_subject['name']} warm-up",
            "description": f"Start with {focus_subject['focusArea'].lower()} drills to get momentum.",
            "progress": 0,
            "priority": "high",
        },
        {
            "id": "practice",
            "title": f"Practice {weakest_subject['name']}",
            "description": f"Focus on {weakest_subject['focusArea'].lower()} for steady improvement.",
            "progress": weakest_subject["progress"],
            "priority": "medium",
        },
        {
            "id": "review",
            "title": "Review yesterday's explanation",
            "description": "Re-read the latest step-by-step solution before attempting the next quiz.",
            "progress": 100 if last_analysis else 0,
            "priority": "medium",
        },
    ]

    if getattr(user, "quiz_answered", 0) and getattr(user, "quiz_correct", 0):
        plan.append(
            {
                "id": "challenge",
                "title": "Take a challenge quiz",
                "description": "You've already built momentum, so push for an accuracy streak.",
                "progress": min(100, int((user.quiz_correct / max(1, user.quiz_answered)) * 100)),
                "priority": "low",
            }
        )

    return plan


def build_insights(user: Any) -> dict[str, Any]:
    strongest_subject = max(SUBJECTS, key=lambda item: item["progress"])
    focus_subject = min(SUBJECTS, key=lambda item: item["progress"])
    return {
        "strongestSubject": strongest_subject["name"],
        "focusSubject": focus_subject["name"],
        "totalSubjects": len(SUBJECTS),
        "averageProgress": round(sum(subject["progress"] for subject in SUBJECTS) / len(SUBJECTS), 1),
        "xpToNextLevel": max(0, 1200 - getattr(user, "xp_points", 0)),
    }


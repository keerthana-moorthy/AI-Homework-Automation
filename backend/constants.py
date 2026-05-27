from __future__ import annotations

from datetime import datetime


APP_INFO = {
    "name": "Vidya AI",
    "description": "Homework analysis, planning, and progress API",
    "version": "1.0.0",
    "defaultLanguage": "en",
    "supportedLanguages": ["en", "ta", "both"],
}

DEFAULT_USER = {
    "name": "Arjun",
    "class_name": "Class 8",
    "avatar": "🧑",
    "streak": 12,
    "xp_points": 840,
    "level": "Gold",
    "language": "en",
    "logged_in": False,
    "active_screen": 1,
    "selected_subject_id": "maths",
    "homework_completed": 7,
    "doubts_solved": 24,
    "quiz_correct": 0,
    "quiz_answered": 0,
    "subscription_plan": "Free",
}

SUBJECTS = [
    {
        "id": "maths",
        "name": "Maths",
        "emoji": "📐",
        "progress": 72,
        "colorVariant": "orange",
        "colorHex": "#FF6B35",
        "focusArea": "Algebra and word problems",
    },
    {
        "id": "science",
        "name": "Science",
        "emoji": "🔬",
        "progress": 55,
        "colorVariant": "purple",
        "colorHex": "#7B5EA7",
        "focusArea": "Force, motion and concepts",
    },
    {
        "id": "english",
        "name": "English",
        "emoji": "📖",
        "progress": 88,
        "colorVariant": "green",
        "colorHex": "#4CAF50",
        "focusArea": "Reading comprehension and grammar",
    },
    {
        "id": "tamil",
        "name": "Tamil",
        "emoji": "அ",
        "progress": 64,
        "colorVariant": "blue",
        "colorHex": "#2196F3",
        "focusArea": "Vocabulary and writing",
    },
    {
        "id": "history",
        "name": "History",
        "emoji": "📅",
        "progress": 40,
        "colorVariant": "blue",
        "colorHex": "#F57F17",
        "focusArea": "Timelines and important events",
    },
]

ACTION_CARDS = [
    {
        "id": "scan",
        "emoji": "📸",
        "label": "Scan Homework",
        "subtext": "Upload & solve",
        "cardType": "orange",
        "targetScreen": 2,
    },
    {
        "id": "doubt",
        "emoji": "💬",
        "label": "Ask a Doubt",
        "subtext": "Instant AI help",
        "cardType": "purple",
        "targetScreen": 3,
    },
    {
        "id": "quiz",
        "emoji": "⚡",
        "label": "Daily Quiz",
        "subtext": "Earn XP",
        "cardType": "green",
        "targetScreen": 4,
    },
    {
        "id": "plan",
        "emoji": "📅",
        "label": "Study Plan",
        "subtext": "Today's goals",
        "cardType": "blue",
        "targetScreen": 0,
    },
]

ONBOARDING_FEATURES = [
    {
        "id": "scan",
        "emoji": "📸",
        "label": "Scan any homework",
        "subtext": "Photo to instant solution",
        "colorType": "o",
    },
    {
        "id": "doubt",
        "emoji": "💬",
        "label": "Ask doubts anytime",
        "subtext": "Text, voice or image",
        "colorType": "p",
    },
    {
        "id": "xp",
        "emoji": "🏆",
        "label": "Earn XP and badges",
        "subtext": "Study becomes fun",
        "colorType": "g",
    },
    {
        "id": "lang",
        "emoji": "🌐",
        "label": "Tamil and English",
        "subtext": "Learn in your language",
        "colorType": "b",
    },
]

QUIZ_QUESTIONS = [
    {
        "id": "q1",
        "question": "What is the value of x if 2x - 4 = 10?",
        "options": ["A) x = 5", "B) x = 7", "C) x = 3", "D) x = 6"],
        "correctOption": "B) x = 7",
        "wrongOption": "C) x = 3",
    },
    {
        "id": "q2",
        "question": "Solve for y: 5y + 12 = 32",
        "options": ["A) y = 3", "B) y = 5", "C) y = 4", "D) y = 6"],
        "correctOption": "C) y = 4",
    },
    {
        "id": "q3",
        "question": "If 3z - 9 = z + 1, then z is:",
        "options": ["A) z = 5", "B) z = 4", "C) z = 3", "D) z = 2"],
        "correctOption": "A) z = 5",
    },
]

PARENT_STATS = [
    {"id": "streak", "value": "12", "label": "Day Streak", "colorHex": "#FF6B35"},
    {"id": "xp", "value": "840", "label": "Total XP", "colorHex": "#7B5EA7"},
    {"id": "completed", "value": "7", "label": "HW Completed", "colorHex": "#4CAF50"},
    {"id": "doubts", "value": "24", "label": "Doubts Solved", "colorHex": "#2196F3"},
]

PARENT_RECOMMENDATIONS = [
    {
        "id": "rec1",
        "emoji": "💡",
        "title": "Focus on Science this week",
        "description": "Arjun struggled with force and motion (3 errors). Increase practice.",
    }
]

PERFORMANCE_BARS = [
    {"subject": "Maths", "progress": 72, "color": "orange"},
    {"subject": "Science", "progress": 55, "color": "purple"},
    {"subject": "English", "progress": 88, "color": "green"},
    {"subject": "Tamil", "progress": 64, "color": "blue"},
]

EXPLANATION_TEMPLATE = {
    "question": "Solve for x: 3x + 7 = 22",
    "subject": {
        "id": "maths",
        "name": "Maths",
        "confidence": 0.96,
        "reason": "The question contains a linear equation.",
    },
    "finalAnswer": "x = 5",
    "steps": [
        {
            "stepNum": 1,
            "title": "Identify the variable",
            "desc": "We want to isolate the unknown value on one side of the equation.",
        },
        {
            "stepNum": 2,
            "title": "Remove the constant term",
            "desc": "Undo the addition or subtraction on the variable side first.",
        },
        {
            "stepNum": 3,
            "title": "Divide by the coefficient",
            "desc": "Divide both sides by the number multiplying the variable.",
        },
    ],
}


def now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def level_for_xp(xp_points: int) -> str:
    if xp_points >= 1600:
        return "Platinum"
    if xp_points >= 1200:
        return "Diamond"
    if xp_points >= 800:
        return "Gold"
    if xp_points >= 400:
        return "Silver"
    return "Bronze"


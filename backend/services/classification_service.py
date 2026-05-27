from __future__ import annotations

from typing import Any

from .common import (
    detect_script_language,
    is_mostly_numbers,
    keyword_overlap_score,
    normalize_text,
    top_keywords,
)
from .embedding_service import get_embedding_service


SUBJECT_PROFILES = {
    "maths": {
        "label": "Mathematics, algebra, geometry, fractions, equations, numbers, proofs.",
        "keywords": ["equation", "solve", "algebra", "fraction", "geometry", "graph", "x =", "y =", "sum", "product"],
        "prerequisites": ["number sense", "basic arithmetic", "variables"],
    },
    "science": {
        "label": "Science, physics, chemistry, biology, experiments, forces, matter, energy.",
        "keywords": ["force", "motion", "energy", "cell", "atom", "biology", "chemistry", "physics", "experiment"],
        "prerequisites": ["observation", "measurement", "scientific vocabulary"],
    },
    "english": {
        "label": "English language, grammar, comprehension, writing, essays, vocabulary.",
        "keywords": ["grammar", "essay", "comprehension", "synonym", "antonym", "tense", "paragraph", "narrative"],
        "prerequisites": ["sentence structure", "reading comprehension"],
    },
    "tamil": {
        "label": "Tamil language, literature, grammar, translation, reading and writing.",
        "keywords": ["tamil", "தமிழ்", "vocabulary", "sentence", "poem", "grammar"],
        "prerequisites": ["script recognition", "basic grammar"],
    },
    "history": {
        "label": "History, timelines, civilizations, events, dates, empire, revolution.",
        "keywords": ["history", "timeline", "empire", "war", "revolution", "king", "ancient", "civilization"],
        "prerequisites": ["chronology", "cause and effect"],
    },
    "hindi": {
        "label": "Hindi language, grammar, translation, reading, vocabulary.",
        "keywords": ["hindi", "हिंदी", "vocabulary", "sentence", "grammar"],
        "prerequisites": ["script recognition", "basic grammar"],
    },
    "kannada": {
        "label": "Kannada language, grammar, translation, reading and writing.",
        "keywords": ["kannada", "ಕನ್ನಡ", "grammar", "vocabulary"],
        "prerequisites": ["script recognition", "basic grammar"],
    },
    "telugu": {
        "label": "Telugu language, grammar, translation, reading and writing.",
        "keywords": ["telugu", "తెలుగు", "grammar", "vocabulary"],
        "prerequisites": ["script recognition", "basic grammar"],
    },
}

INTENT_KEYWORDS = {
    "solve_question": ["solve", "find", "calculate", "evaluate", "simplify"],
    "explain_concept": ["explain", "why", "how", "meaning", "concept"],
    "practice_quiz": ["quiz", "test", "practice", "mcq"],
    "summarize_notes": ["summarize", "summary", "notes"],
}


def _score_subject(text: str, subject_id: str) -> float:
    profile = SUBJECT_PROFILES[subject_id]
    lexical = keyword_overlap_score(text, " ".join(profile["keywords"]))
    embedding_service = get_embedding_service()
    vector = embedding_service.similarity(text, profile["label"])
    numeric_boost = 0.22 if subject_id == "maths" and is_mostly_numbers(text) else 0.0
    return (0.56 * lexical) + (0.34 * vector) + numeric_boost


def classify_subject(text: str, selected_subject: str | None = None) -> dict[str, Any]:
    normalized = normalize_text(text)
    if selected_subject in SUBJECT_PROFILES:
        return {
            "id": selected_subject,
            "confidence": 0.98,
            "reason": "Selected subject was provided by the user.",
        }

    scores = {subject_id: _score_subject(normalized, subject_id) for subject_id in SUBJECT_PROFILES}
    best_subject = max(scores, key=scores.get)
    best_score = scores[best_subject]
    reason = f"Matched subject profile for {best_subject}."
    return {
        "id": best_subject,
        "confidence": round(min(0.99, max(0.45, best_score)), 2),
        "reason": reason,
        "scores": {key: round(value, 3) for key, value in scores.items()},
    }


def _difficulty_score(text: str, question_count: int = 1) -> str:
    token_count = len(text.split())
    equation_count = text.count("=") + text.count("∫") + text.count("√")
    complexity = token_count + (equation_count * 12) + (question_count * 8)
    if complexity < 35:
        return "easy"
    if complexity < 90:
        return "medium"
    return "hard"


def _extract_intent(text: str) -> str:
    lowered = text.lower()
    for intent, keywords in INTENT_KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return intent
    if any(symbol in text for symbol in ("=", "+", "-", "×", "÷")):
        return "solve_question"
    return "explain_concept"


def _extract_concepts(text: str, subject_id: str) -> list[str]:
    keywords = top_keywords(text, limit=12)
    subject_profile = SUBJECT_PROFILES.get(subject_id, {})
    subject_keywords = subject_profile.get("keywords", [])
    concepts = [keyword for keyword in keywords if keyword in subject_keywords or len(keyword) > 3]
    if subject_id == "maths":
        math_concepts = [keyword for keyword in keywords if keyword in {"equation", "variable", "fraction", "percentage", "algebra", "graph"}]
        concepts = math_concepts + [concept for concept in concepts if concept not in math_concepts]
    return concepts[:8]


def _extract_prerequisites(subject_id: str, difficulty: str) -> list[str]:
    prereqs = list(SUBJECT_PROFILES.get(subject_id, {}).get("prerequisites", []))
    if difficulty == "hard":
        prereqs.append("multi-step reasoning")
    if subject_id == "maths":
        prereqs.append("algebraic manipulation")
    return prereqs[:5]


def classify_educational_content(
    *,
    text: str,
    structured_document_json: dict[str, Any] | None = None,
    selected_subject: str | None = None,
) -> dict[str, Any]:
    normalized = normalize_text(text)
    subject = classify_subject(normalized, selected_subject)
    question_count = len((structured_document_json or {}).get("questions") or []) or 1
    detected_language = detect_script_language(normalized)
    difficulty_level = _difficulty_score(normalized, question_count=question_count)
    concepts = _extract_concepts(normalized, subject["id"])
    prerequisites = _extract_prerequisites(subject["id"], difficulty_level)
    intent = _extract_intent(normalized)

    return {
        "subject": subject,
        "topic": concepts[0] if concepts else subject["id"],
        "concepts": concepts,
        "prerequisites": prerequisites,
        "difficulty_level": difficulty_level,
        "detected_language": detected_language,
        "intent": intent,
        "question_count": question_count,
    }


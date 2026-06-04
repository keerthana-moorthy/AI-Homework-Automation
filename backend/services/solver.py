from __future__ import annotations

import math
import re
from typing import Any

from ..constants import QUIZ_QUESTIONS, EXPLANATION_TEMPLATE, SUBJECTS

SUBJECT_KEYWORDS = {
    "maths": [
        "math",
        "maths",
        "algebra",
        "equation",
        "solve for",
        "find x",
        "find y",
        "find z",
        "fraction",
        "percentage",
        "variable",
        "simplify",
    ],
    "science": [
        "science",
        "force",
        "motion",
        "energy",
        "cell",
        "atom",
        "gravity",
        "physics",
        "chemistry",
        "biology",
    ],
    "english": [
        "english",
        "grammar",
        "essay",
        "synonym",
        "antonym",
        "comprehension",
        "paragraph",
        "tense",
    ],
    "tamil": ["tamil", "தமிழ்", "vocabulary", "sentence"],
    "history": ["history", "ancient", "king", "empire", "war", "timeline", "revolution"],
}


def normalize_text(text: str) -> str:
    return " ".join(
        str(text or "")
        .replace("–", "-")
        .replace("—", "-")
        .replace("−", "-")
        .replace("×", "*")
        .replace("·", "*")
        .split()
    ).strip()


def extract_equation_candidate(text: str) -> str:
    patterns = [
        r"([+-]?\d*\s*[a-zA-Z]\s*[+-]\s*\d+(?:\.\d+)?\s*=\s*[+-]?\d*\s*[a-zA-Z]\s*[+-]\s*\d+(?:\.\d+)?)",
        r"([+-]?\d*\s*[a-zA-Z]\s*[+-]\s*\d+(?:\.\d+)?\s*=\s*[+-]?\d+(?:\.\d+)?)",
        r"([+-]?\d*\s*[a-zA-Z]\s*=\s*[+-]?\d+(?:\.\d+)?)",
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1)

    return text


def parse_coefficient(raw: str | None) -> float:
    if raw in (None, "", "+"):
        return 1.0
    if raw == "-":
        return -1.0
    return float(raw)


def parse_signed_number(sign: str, value: str) -> float:
    numeric_value = float(value)
    return -numeric_value if sign == "-" else numeric_value


def format_number(value: float) -> str:
    if not math.isfinite(value):
        return "undefined"
    if float(value).is_integer():
        return str(int(value))
    return f"{value:.2f}".rstrip("0").rstrip(".")


def format_linear_term(coefficient: float, variable: str) -> str:
    if coefficient == 1:
        return variable
    if coefficient == -1:
        return f"-{variable}"
    return f"{format_number(coefficient)}{variable}"


def format_signed_constant(value: float) -> str:
    if value == 0:
        return "0"
    return f"+ {format_number(value)}" if value > 0 else f"- {format_number(abs(value))}"


def build_steps(variable: str, equation_text: str, answer_text: str, intermediate: str, final: str | None = None) -> list[dict[str, Any]]:
    return [
        {
            "stepNum": 1,
            "title": "Identify the variable",
            "desc": f"Start with {equation_text} and isolate {variable}.",
        },
        {
            "stepNum": 2,
            "title": "Simplify the equation",
            "desc": intermediate,
        },
        {
            "stepNum": 3,
            "title": "Find the final value",
            "desc": final or f"The answer is {answer_text}.",
        },
    ]


def build_quiz(variable: str, answer: float, equation_text: str) -> dict[str, Any]:
    base = int(answer) if float(answer).is_integer() else round(answer, 2)
    distractors = [base - 2, base - 1, base + 1, base + 2]
    distractors = list(dict.fromkeys(distractors))
    while len(distractors) < 3:
        distractors.append(distractors[-1] + 1)
    options = [
        f"A) {variable} = {format_number(distractors[0])}",
        f"B) {variable} = {format_number(base)}",
        f"C) {variable} = {format_number(distractors[1])}",
        f"D) {variable} = {format_number(distractors[2])}",
    ]
    return {
        "id": f"generated-{variable}-{format_number(answer)}",
        "question": f"What is the value of {variable} if {equation_text}?",
        "options": options,
        "correctOption": options[1],
        "wrongOption": options[2],
    }


def get_subject_info(subject_id: str) -> dict[str, Any]:
    sid = (subject_id or "").lower().strip()
    if sid == "mathematics" or sid == "math":
        sid = "maths"
    elif sid == "general knowledge":
        sid = "general_knowledge"
        
    for sub in SUBJECTS:
        if sub["id"] == sid:
            return {
                "id": sub["id"],
                "name": sub["name"],
                "emoji": sub["emoji"]
            }
            
    if sid == "maths":
        return {"id": "maths", "name": "Mathematics", "emoji": "📐"}
    if sid == "science":
        return {"id": "science", "name": "Science", "emoji": "🧪"}
    if sid == "history":
        return {"id": "history", "name": "History", "emoji": "🏛️"}
    if sid == "geography":
        return {"id": "geography", "name": "Geography", "emoji": "🌍"}
    if sid == "general_knowledge":
        return {"id": "general_knowledge", "name": "General Knowledge", "emoji": "📚"}
    if sid == "other":
        return {"id": "other", "name": "Other", "emoji": "📚"}
        
    return {
        "id": sid or "general_knowledge",
        "name": (sid or "general_knowledge").replace("_", " ").capitalize(),
        "emoji": "📚"
    }


def detect_subject(subject: str | None, question_text: str, file_name: str | None = None) -> dict[str, Any]:
    combined = (question_text or "") + " " + (file_name or "")
    combined = combined.lower()

    tamil_chars = len(re.findall(r"[\u0B80-\u0BFF]", question_text or ""))
    if tamil_chars > 5:
        return {
            "id": "tamil",
            "confidence": 0.99,
            "reason": "Tamil script characters detected in content.",
        }

    keywords_map = {
        "maths": [
            "algebra", "equation", "solve for", "find x", "find y", "find z", "fraction",
            "percentage", "variable", "simplify", "arithmetic", "geometry", "theorem",
            "trigonometry", "calculus", "matrix", "integral", "derivative", "value of x",
            "value of y", "value of z", "solve the equation"
        ],
        "science": [
            "scientist", "science", "force", "motion", "energy", "cell", "atom", "gravity",
            "physics", "chemistry", "biology", "photosynthesis", "molecule", "ecosystem",
            "planet", "organism", "acid", "base", "element", "evolution", "respiration",
            "body parts", "functions of"
        ],
        "english": [
            "english", "grammar", "essay", "synonym", "antonym", "comprehension",
            "paragraph", "tense", "noun", "verb", "adjective", "preposition", "spelling",
            "literature"
        ],
        "tamil": [
            "tamil", "தமிழ்", "vocabulary", "sentence"
        ],
        "history": [
            "history", "ancient", "king", "empire", "war", "timeline", "revolution",
            "independence", "movement", "civilization", "dynasty", "emperor",
            "gandhi", "freedom struggle", "historic"
        ],
        "geography": [
            "geography", "map", "location", "country", "continent", "ocean", "river",
            "mountain", "earthquake", "volcano", "latitude", "longitude", "climate",
            "weather", "soil", "glacier"
        ],
        "general_knowledge": [
            "general knowledge", "trivia", "current affairs", "facts", "quiz", "gk"
        ],
    }

    boosts = {key: 0.0 for key in keywords_map}

    if re.search(r"\d+\s*[+\-*/=]\s*\d+", combined) or re.search(r"\b(solve|find|variable)\b", combined):
        boosts["maths"] += 2.0
    if re.search(r"[a-zA-Z]\s*=\s*\d+", combined) or re.search(r"\b[xyz]\b", combined):
        boosts["maths"] += 1.5

    if re.search(r"\b(photosynthesis|mitochondria|chloroplast|gravity|velocity|acceleration|atoms|molecules)\b", combined):
        boosts["science"] += 3.0

    if re.search(r"\b(independence|movement|mahatma|colonial|empire|civilization|world war|reign|treaty)\b", combined):
        boosts["history"] += 3.0

    if re.search(r"\b(topography|atmosphere|mountains|rivers|continents|glaciers|volcanoes)\b", combined):
        boosts["geography"] += 3.0

    scores = {}
    for subject_id, keywords in keywords_map.items():
        count = 0
        for kw in keywords:
            if len(kw) <= 3:
                count += combined.count(kw)
            else:
                count += len(re.findall(r"\b" + re.escape(kw) + r"\b", combined))
        scores[subject_id] = count + boosts[subject_id]

    best_subject = max(scores, key=scores.get)
    best_score = scores[best_subject]

    if best_score >= 1.5:
        return {
            "id": best_subject,
            "confidence": round(min(0.99, max(0.65, 0.5 + (best_score * 0.1))), 2),
            "reason": f"Content matched subject keywords and rules for {best_subject}.",
        }

    explicit = (subject or "").lower().strip()
    if explicit == "math" or explicit == "mathematics":
        explicit = "maths"
    elif explicit == "general knowledge":
        explicit = "general_knowledge"

    valid_subjects = {"maths", "science", "english", "tamil", "history", "geography", "general_knowledge", "other"}
    if explicit in valid_subjects and explicit != "maths":
        return {
            "id": explicit,
            "confidence": 0.95,
            "reason": "The user selected this subject explicitly.",
        }

    return {
        "id": "general_knowledge",
        "confidence": 0.5,
        "reason": "No strong subject match was found, so General Knowledge is used as a fallback.",
    }


def solve_simple_linear(expression: str) -> dict[str, Any] | None:
    expression = extract_equation_candidate(normalize_text(expression))

    # Case 1: x = 5 or 3x = 15
    simple = re.fullmatch(r"([+-]?\d*)\s*([a-zA-Z])\s*=\s*([+-]?\d+(?:\.\d+)?)", expression)
    if simple:
        coefficient = parse_coefficient(simple.group(1))
        variable = simple.group(2)
        right_side = float(simple.group(3))
        answer = right_side / coefficient
        if not math.isfinite(answer):
            return None
        equation_text = f"{format_linear_term(coefficient, variable)} = {format_number(right_side)}"
        answer_text = f"{variable} = {format_number(answer)}"
        return {
            "status": "solved",
            "variable": variable,
            "equationText": equation_text,
            "answer": answer,
            "answerText": answer_text,
            "steps": build_steps(
                variable,
                equation_text,
                answer_text,
                f"The variable is already isolated apart from the coefficient {format_number(coefficient)}.",
                f"Divide both sides by {format_number(coefficient)} to isolate {variable}.",
            ),
            "quiz": build_quiz(variable, answer, equation_text),
        }

    # Case 2: 3x + 7 = 22
    one_side = re.fullmatch(
        r"([+-]?\d*)\s*([a-zA-Z])\s*([+-])\s*(\d+(?:\.\d+)?)\s*=\s*([+-]?\d+(?:\.\d+)?)",
        expression,
    )
    if one_side:
        coefficient = parse_coefficient(one_side.group(1))
        variable = one_side.group(2)
        operator = one_side.group(3)
        constant = float(one_side.group(4))
        right_side = float(one_side.group(5))
        signed_constant = parse_signed_number(operator, one_side.group(4))
        intermediate_value = right_side - signed_constant
        answer = intermediate_value / coefficient
        if not math.isfinite(answer):
            return None
        equation_text = f"{format_linear_term(coefficient, variable)} {format_signed_constant(signed_constant)} = {format_number(right_side)}"
        answer_text = f"{variable} = {format_number(answer)}"
        return {
            "status": "solved",
            "variable": variable,
            "equationText": equation_text,
            "answer": answer,
            "answerText": answer_text,
            "steps": build_steps(
                variable,
                equation_text,
                answer_text,
                f"Move the constant term to the other side to get {format_linear_term(coefficient, variable)} = {format_number(intermediate_value)}.",
                f"Divide both sides by {format_number(coefficient)} to isolate {variable}.",
            ),
            "quiz": build_quiz(variable, answer, equation_text),
        }

    # Case 3: 3x + 7 = 2x + 12
    both_sides = re.fullmatch(
        r"([+-]?\d*)\s*([a-zA-Z])\s*([+-])\s*(\d+(?:\.\d+)?)\s*=\s*([+-]?\d*)\s*([a-zA-Z])\s*([+-])\s*(\d+(?:\.\d+)?)",
        expression,
    )
    if both_sides:
        left_coefficient = parse_coefficient(both_sides.group(1))
        variable = both_sides.group(2)
        left_operator = both_sides.group(3)
        left_constant = float(both_sides.group(4))
        right_coefficient = parse_coefficient(both_sides.group(5))
        right_variable = both_sides.group(6)
        right_operator = both_sides.group(7)
        right_constant = float(both_sides.group(8))

        if variable.lower() != right_variable.lower():
            return None

        left_signed_constant = parse_signed_number(left_operator, both_sides.group(4))
        right_signed_constant = parse_signed_number(right_operator, both_sides.group(8))
        coefficient = left_coefficient - right_coefficient
        intermediate_value = right_signed_constant - left_signed_constant

        if coefficient == 0:
            return {
                "status": "no_solution" if right_signed_constant != left_signed_constant else "infinite",
                "reason": "The equation does not isolate to a single value.",
            }

        answer = intermediate_value / coefficient
        equation_text = (
            f"{format_linear_term(left_coefficient, variable)} {format_signed_constant(left_signed_constant)} = "
            f"{format_linear_term(right_coefficient, variable)} {format_signed_constant(right_signed_constant)}"
        )
        answer_text = f"{variable} = {format_number(answer)}"
        return {
            "status": "solved",
            "variable": variable,
            "equationText": equation_text,
            "answer": answer,
            "answerText": answer_text,
            "steps": build_steps(
                variable,
                equation_text,
                answer_text,
                f"Move the variable terms to one side so that {format_linear_term(coefficient, variable)} remains on the left.",
                f"Divide both sides by {format_number(coefficient)} to isolate {variable}.",
            ),
            "quiz": build_quiz(variable, answer, equation_text),
        }

    return None


def build_fallback_analysis(question_text: str, detected_subject: dict[str, Any], source: str) -> dict[str, Any]:
    return {
        "status": "needs_review",
        "source": source,
        "questionText": question_text,
        "detectedSubject": detected_subject,
        "problemType": "manual-review",
        "finalAnswer": None,
        "steps": [
            {
                "stepNum": 1,
                "title": "Review the scan",
                "desc": "Upload a clearer handwritten image or paste the OCR text exactly as it appears.",
            },
            {
                "stepNum": 2,
                "title": "Check the OCR text",
                "desc": "If the handwriting is blurry, take the photo again in better light or crop to the question.",
            },
        ],
        "recommendations": [
            {
                "id": "review-1",
                "emoji": "!",
                "title": "Upload a clearer scan",
                "description": "A sharper photo or PDF usually gives the best explanation.",
            }
        ],
    }


def analyze_homework(payload: dict[str, Any]) -> dict[str, Any]:
    question_text = normalize_text(
        payload.get("questionText")
        or payload.get("question_text")
        or payload.get("text")
        or payload.get("transcript")
        or payload.get("ocrText")
        or payload.get("notes")
        or "",
    )
    source = str(payload.get("inputMethod") or payload.get("input_method") or "type")
    detected_subject = detect_subject(payload.get("subject"), question_text)

    if not question_text:
        return {
            "status": "error",
            "message": "questionText is required for analysis.",
        }

    solution = solve_simple_linear(question_text)
    if not solution or solution.get("status") != "solved":
        return build_fallback_analysis(question_text, detected_subject, source)

    answer = solution["answer"]
    variable = solution["variable"]
    equation_text = solution["equationText"]
    answer_text = solution["answerText"]

    return {
        "status": "ok",
        "source": source,
        "questionText": question_text,
        "detectedSubject": detected_subject,
        "problemType": "linear-equation",
        "extractedEquation": equation_text,
        "variable": variable,
        "finalAnswer": answer_text,
        "numericAnswer": answer,
        "steps": solution["steps"],
        "summary": f"Solved {equation_text} and isolated {variable}.",
        "quiz": solution["quiz"],
        "recommendations": [
            {
                "id": "practice-1",
                "emoji": "⚡",
                "title": f"Practice more {detected_subject['id'] if detected_subject['id'] != 'maths' else 'algebra'}",
                "description": "Use a few more similar problems to make the method stick.",
            }
        ],
    }


def explanation_from_analysis(analysis: dict[str, Any] | None) -> dict[str, Any]:
    if not analysis:
        return EXPLANATION_TEMPLATE.copy()

    scan = analysis.get("scan") if isinstance(analysis.get("scan"), dict) else {}
    subject_payload = analysis.get("detectedSubject") or EXPLANATION_TEMPLATE["subject"]
    subject_id = subject_payload.get("id") if isinstance(subject_payload, dict) else "general_knowledge"
    
    sub_info = get_subject_info(subject_id)
    subject_data = {
        "id": sub_info["id"],
        "name": sub_info["name"],
        "emoji": sub_info["emoji"],
        "confidence": subject_payload.get("confidence", 0.5) if isinstance(subject_payload, dict) else 0.5,
        "reason": subject_payload.get("reason", "") if isinstance(subject_payload, dict) else "",
    }

    if analysis.get("status") != "ok":
        return {
            "question": normalize_text(
                analysis.get("questionText")
                or analysis.get("extractedText")
                or scan.get("extractedText")
                or analysis.get("summary")
                or EXPLANATION_TEMPLATE["question"],
            ),
            "subject": subject_data,
            "finalAnswer": normalize_text(analysis.get("finalAnswer")) or EXPLANATION_TEMPLATE["finalAnswer"],
            "steps": analysis.get("steps") or scan.get("steps") or EXPLANATION_TEMPLATE["steps"],
        }

    return {
        "question": normalize_text(
            analysis.get("questionText")
            or analysis.get("extractedText")
            or scan.get("extractedText")
            or EXPLANATION_TEMPLATE["question"]
        ),
        "subject": subject_data,
        "finalAnswer": normalize_text(analysis.get("finalAnswer")) or EXPLANATION_TEMPLATE["finalAnswer"],
        "steps": analysis.get("steps") or scan.get("steps") or EXPLANATION_TEMPLATE["steps"],
    }


def build_quiz_question_from_analysis(analysis: dict[str, Any] | None) -> dict[str, Any]:
    if analysis and analysis.get("status") == "ok" and analysis.get("quiz"):
        return analysis["quiz"]
    return QUIZ_QUESTIONS[0]

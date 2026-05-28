from __future__ import annotations

from typing import Any

from .llm_router import get_llm_router
from .common import normalize_text


def _format_steps(steps: Any) -> list[str]:
    if not isinstance(steps, list):
        return []

    lines: list[str] = []
    for index, step in enumerate(steps, start=1):
        if not isinstance(step, dict):
            continue
        step_num = int(step.get("stepNum") or index)
        title = normalize_text(step.get("title")) or f"Step {step_num}"
        desc = normalize_text(step.get("desc") or step.get("description"))
        if desc:
            lines.append(f"{step_num}. {title}: {desc}")
        else:
            lines.append(f"{step_num}. {title}")
    return lines


def _collect_context_lines(analysis: dict[str, Any] | None) -> list[str]:
    if not analysis:
        return ["No scanned homework context is available yet."]

    scan = analysis.get("scan") if isinstance(analysis.get("scan"), dict) else {}
    subject = analysis.get("detectedSubject") if isinstance(analysis.get("detectedSubject"), dict) else {}
    lines = [
        f"Analysis ID: {analysis.get('analysisId') or analysis.get('id') or 'latest'}",
        f"Question: {normalize_text(analysis.get('questionText') or analysis.get('question')) or 'Not available'}",
        f"Subject: {normalize_text(subject.get('id') or analysis.get('sourceSubject') or 'maths')}",
        f"Scan method: {normalize_text(analysis.get('scanMethod') or scan.get('scanMethod') or 'text')}",
        f"Source type: {normalize_text(analysis.get('sourceType') or scan.get('sourceKind') or 'text')}",
        f"File name: {normalize_text(analysis.get('fileName') or scan.get('fileName')) or 'Not available'}",
        f"Summary: {normalize_text(analysis.get('summary') or scan.get('summary')) or 'Not available'}",
        f"Detailed explanation: {normalize_text(analysis.get('detailedExplanation') or scan.get('detailedExplanation')) or 'Not available'}",
        f"Final answer: {normalize_text(analysis.get('finalAnswer')) or 'Not available'}",
        f"Extracted text: {normalize_text(analysis.get('extractedText') or scan.get('extractedText')) or 'Not available'}",
    ]

    page_count = analysis.get("pageCount") or scan.get("pageCount")
    if page_count:
        lines.append(f"Page count: {page_count}")

    steps = _format_steps(analysis.get("steps") or scan.get("steps"))
    if steps:
        lines.append("Steps:")
        lines.extend(steps)

    recommendations = analysis.get("recommendations") or scan.get("recommendations")
    if isinstance(recommendations, list) and recommendations:
        lines.append("Recommendations:")
        for item in recommendations[:3]:
            if isinstance(item, dict):
                title = normalize_text(item.get("title")) or "Review the question"
                description = normalize_text(item.get("description")) or ""
                lines.append(f"- {title}: {description}" if description else f"- {title}")

    return lines


def _build_history_messages(history: list[dict[str, Any]]) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    for item in history[-8:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        content = normalize_text(item.get("content"))
        if role not in {"user", "assistant"} or not content:
            continue
        messages.append({"role": role, "content": content})
    return messages


def _suggested_questions(analysis: dict[str, Any] | None) -> list[str]:
    if not analysis:
        return [
            "What should I upload for better scanning?",
            "Can you explain the scan summary?",
            "How do I ask a doubt about this homework?",
        ]

    question = normalize_text(analysis.get("questionText") or analysis.get("question"))
    final_answer = normalize_text(analysis.get("finalAnswer"))
    steps = analysis.get("steps") if isinstance(analysis.get("steps"), list) else []
    scan = analysis.get("scan") if isinstance(analysis.get("scan"), dict) else {}

    questions = [
        "Explain this homework in simple words",
        "What did the scan read from my file?",
        "Give me one similar practice question",
    ]

    if steps:
        questions.insert(1, "Explain step 1 clearly")
        if len(steps) > 1:
            questions.insert(2, "Explain step 2 clearly")

    if final_answer:
        questions.append(f"Why is the final answer {final_answer}?")
    if question:
        questions.append("Restate the question in simple words")
    if scan.get("summary"):
        questions.append("What does the scan summary mean?")

    deduped: list[str] = []
    for item in questions:
        if item not in deduped:
            deduped.append(item)
    return deduped[:5]


def _fallback_reply(
    *,
    analysis: dict[str, Any] | None,
    message: str,
    language: str,
) -> str:
    question = normalize_text(message)
    answer = normalize_text(analysis.get("finalAnswer") if analysis else None)
    summary = normalize_text(analysis.get("summary") if analysis else None)
    detailed = normalize_text(analysis.get("detailedExplanation") if analysis else None)
    steps = analysis.get("steps") if analysis and isinstance(analysis.get("steps"), list) else []

    if language == "both":
        intro = "I can help with this scanned homework in simple English and Tamil."
    else:
        intro = "I can help with this scanned homework."

    reply_parts = [intro]

    if question:
        reply_parts.append(f"You asked: {question}.")

    if summary:
        reply_parts.append(summary)
    if detailed:
        reply_parts.append(detailed)

    if steps:
        reply_parts.append("Here is the step-by-step guidance:")
        for step in _format_steps(steps)[:3]:
            reply_parts.append(step)
    else:
        reply_parts.append(
            "I only have limited scan context, so please re-upload a clearer image or PDF if you want a more detailed answer."
        )

    if answer:
        reply_parts.append(f"The current final answer shown for the scan is {answer}.")

    return " ".join(part for part in reply_parts if part)


def answer_explanation_chat(
    *,
    analysis: dict[str, Any] | None,
    message: str,
    history: list[dict[str, Any]] | None,
    language: str,
) -> dict[str, Any]:
    normalized_message = normalize_text(message)
    if not normalized_message:
        return {
            "reply": "Please type a question about the scanned homework first.",
            "suggestedQuestions": _suggested_questions(analysis),
        }

    if language == "ta":
        language_rule = "Answer primarily in Tamil, but keep math symbols and equations unchanged."
    elif language == "both":
        language_rule = "Answer in simple mixed Tamil and English when helpful."
    else:
        language_rule = "Answer in simple English."

    context_block = "\n".join(_collect_context_lines(analysis))
    messages = [
        {
            "role": "system",
            "content": (
                "You are Vidya AI, a friendly homework tutor inside the explanation page. "
                "Your main job is to explain the scanned homework, the OCR text, the summary section, the detailed explanation, and each solution step. "
                "Stay grounded in the provided context. Do not invent questions, numbers, or steps that are not in the scan. "
                "If the student asks about an unclear scan, explain what the scan captured and what they should upload again. "
                "Also explain the scan section itself when asked: what OCR means, what the summary means, and how to read the extracted text. "
                f"{language_rule} "
                "Use short paragraphs and clear step-by-step guidance."
            ),
        },
        {
            "role": "system",
            "content": f"Homework context:\n{context_block}",
        },
    ]

    reply = ""
    router = get_llm_router()
    if router.configured:
        try:
            reply = normalize_text(
                router.generate_text(
                    task="doubt",
                    system_prompt=messages[0]["content"],
                    user_prompt=normalized_message,
                    context_messages=[
                        {"role": "system", "content": f"Homework context:\n{context_block}"},
                        *_build_history_messages(history or []),
                    ],
                    temperature=0.3,
                    max_completion_tokens=900,
                )
                or ""
            )
        except Exception:  # noqa: BLE001
            reply = ""

    if not reply:
        reply = _fallback_reply(analysis=analysis, message=normalized_message, language=language)

    return {
        "reply": reply,
        "suggestedQuestions": _suggested_questions(analysis),
    }

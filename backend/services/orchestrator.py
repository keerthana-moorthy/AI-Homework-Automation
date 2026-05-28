from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from .analytics_service import build_recommendations, build_student_analytics
from .classification_service import classify_educational_content
from .document_parser import build_document_package
from .document_router import DocumentRouteDecision, route_document
from .doubt_service import get_doubt_service
from .llm_router import get_llm_router
from .math_service import build_math_explanation, detect_math_problem, solve_math_question
from .ocr_service import extract_document_ocr
from .quiz_service import get_quiz_service
from .rag_service import get_rag_service
from .solver import analyze_homework as fallback_analyze_homework
from .solver import explanation_from_analysis
from .translation_service import translate_text
from ..constants import EXPLANATION_TEMPLATE
from ..models import HomeworkAnalysis, UserProfile


@dataclass(slots=True)
class PipelineArtifacts:
    route_decision: dict[str, Any]
    ocr: dict[str, Any]
    document_package: dict[str, Any]
    analysis_payload: dict[str, Any]


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
    payload["scan"] = payload.get("scan") or {}
    payload["detectedSubject"] = payload.get("detectedSubject") or {
        "id": row.detected_subject_id,
        "confidence": row.confidence,
        "reason": "Loaded from stored analysis.",
    }
    return payload


def _normalize_steps(raw_steps: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_steps, list):
        return []
    steps: list[dict[str, Any]] = []
    for index, step in enumerate(raw_steps, start=1):
        if not isinstance(step, dict):
            continue
        steps.append(
            {
                "stepNum": int(step.get("stepNum") or index),
                "title": str(step.get("title") or f"Step {index}"),
                "desc": str(step.get("desc") or step.get("description") or ""),
            }
        )
    return steps


def _generate_llm_explanation(
    *,
    analysis_payload: dict[str, Any],
    context_pack: dict[str, Any],
    language: str,
) -> dict[str, Any] | None:
    router = get_llm_router()
    if not router.configured:
        return None

    prompt_context = {
        "questionText": analysis_payload.get("questionText"),
        "summary": analysis_payload.get("summary"),
        "detailedExplanation": analysis_payload.get("detailedExplanation"),
        "finalAnswer": analysis_payload.get("finalAnswer"),
        "subject": analysis_payload.get("detectedSubject"),
        "classification": analysis_payload.get("classification"),
        "structuredDocumentJson": analysis_payload.get("structuredDocumentJson"),
        "scan": analysis_payload.get("scan"),
        "retrievedContext": context_pack,
    }
    system_prompt = (
        "You are Vidya AI, a tutoring backend. Return a JSON object only. "
        "The JSON must contain summary, detailedExplanation, steps, finalAnswer, problemType, "
        "needsManualReview, and recommendations. "
        "Explain the scanned homework step by step, grounded in the provided context. "
        "If the homework is math-heavy, explain the reasoning rather than only giving the answer. "
        "Keep the explanation suitable for a school student."
    )
    user_prompt = (
        f"Target language: {language}\n"
        f"Homework context JSON:\n{prompt_context}\n"
        "Generate a grounded explanation."
    )
    raw = router.generate_json(
        task="explanation",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.2,
        max_completion_tokens=1800,
    )
    if not raw:
        return None

    steps = _normalize_steps(raw.get("steps"))
    if not steps:
        steps = _normalize_steps(analysis_payload.get("steps"))
    return {
        "summary": str(raw.get("summary") or analysis_payload.get("summary") or ""),
        "detailedExplanation": str(raw.get("detailedExplanation") or analysis_payload.get("detailedExplanation") or ""),
        "steps": steps,
        "finalAnswer": str(raw.get("finalAnswer") or analysis_payload.get("finalAnswer") or ""),
        "problemType": str(raw.get("problemType") or analysis_payload.get("problemType") or "concept"),
        "needsManualReview": bool(raw.get("needsManualReview") or analysis_payload.get("needsManualReview") or False),
        "recommendations": raw.get("recommendations") if isinstance(raw.get("recommendations"), list) else analysis_payload.get("recommendations") or [],
    }


class VidyaAICore:
    def __init__(self) -> None:
        self.rag_service = get_rag_service()
        self.quiz_service = get_quiz_service()
        self.doubt_service = get_doubt_service()

    def analyze_homework(
        self,
        *,
        db: Session,
        user: UserProfile,
        file_name: str | None,
        file_type: str | None,
        file_bytes: bytes | None,
        input_method: str,
        subject: str | None,
        language: str,
        question_text: str | None = None,
        transcript: str | None = None,
        notes: str | None = None,
        ocr_text: str | None = None,
    ) -> PipelineArtifacts:
        route_decision = route_document(
            file_name=file_name,
            file_type=file_type,
            file_bytes=file_bytes,
            text_hint=question_text or transcript or notes or ocr_text,
        )
        ocr_result = extract_document_ocr(
            route_decision=route_decision,
            file_bytes=file_bytes,
            file_name=file_name,
            file_type=file_type,
            language_hint=language,
        )
        document_package = build_document_package(
            file_name=file_name,
            file_type=file_type,
            route_decision=route_decision.model_dump(),
            ocr_result=ocr_result,
            selected_subject=subject or user.selected_subject_id,
        )

        raw_text = document_package.get("rawText") or ocr_result.get("raw_text") or question_text or transcript or notes or ocr_text or ""
        question_candidates = document_package.get("questionCandidates") or []
        primary_question = question_candidates[0] if question_candidates else raw_text
        classification = document_package.get("classification") or classify_educational_content(
            text=raw_text,
            structured_document_json=document_package.get("structuredDocumentJson"),
            selected_subject=subject or user.selected_subject_id,
        )
        math_solution = solve_math_question(primary_question or raw_text)
        math_explanation = build_math_explanation(math_solution) if math_solution else None
        fallback_solution = fallback_analyze_homework(
            {
                "questionText": primary_question or raw_text,
                "inputMethod": input_method,
                "subject": subject or classification.get("subject", {}).get("id"),
                "language": language,
                "transcript": transcript,
                "ocrText": ocr_text,
                "notes": notes,
                "text": primary_question or raw_text,
            }
        )

        context_pack = self.rag_service.build_context_pack(
            db,
            query=primary_question or raw_text,
            user_id=user.id,
            limit=5,
        )
        primary_scan_method = (ocr_result.get("source_models") or ["text"])[0] if ocr_result else "text"

        analysis_payload: dict[str, Any] = {
            "status": fallback_solution.get("status", "needs_review"),
            "source": input_method,
            "questionText": primary_question or raw_text,
            "inputMethod": input_method,
            "language": language,
            "detectedSubject": classification.get("subject") or fallback_solution.get("detectedSubject"),
            "detectedLanguage": classification.get("detected_language") or language,
            "classification": classification,
            "routeDecision": route_decision.model_dump(),
            "structuredDocumentJson": document_package.get("structuredDocumentJson"),
            "rawText": ocr_result.get("raw_text") or raw_text,
            "structuredBlocks": ocr_result.get("structured_blocks") or [],
            "formulas": ocr_result.get("formulas") or [],
            "tables": ocr_result.get("tables") or [],
            "diagrams": ocr_result.get("diagrams") or [],
            "confidenceScore": ocr_result.get("confidence_score", 0.5),
            "questionCandidates": document_package.get("questionCandidates"),
            "layoutChunks": document_package.get("layoutChunks"),
            "scan": {
                "scanMethod": primary_scan_method,
                "sourceKind": route_decision.file_kind,
                "fileName": file_name,
                "fileType": file_type,
                "pageCount": ocr_result.get("page_count") or route_decision.page_count or 0,
                "pageTexts": ocr_result.get("page_texts") or [],
                "pageImages": ocr_result.get("page_images") or [],
                "pageBlocks": ocr_result.get("page_blocks") or [],
                "extractedText": ocr_result.get("raw_text") or raw_text,
                "questionText": primary_question or raw_text,
                "summary": ocr_result.get("raw_text")[:220] if ocr_result.get("raw_text") else "",
                "detailedExplanation": "",
                "confidence": ocr_result.get("confidence_score", 0.5),
                "detectedSubject": classification.get("subject") or fallback_solution.get("detectedSubject"),
                "recommendations": fallback_solution.get("recommendations") or [],
                "steps": fallback_solution.get("steps") or [],
            },
            "extractedText": ocr_result.get("raw_text") or raw_text,
            "pageCount": ocr_result.get("page_count") or route_decision.page_count or 0,
            "scanMethod": primary_scan_method,
            "sourceType": route_decision.document_kind,
            "summary": "",
            "detailedExplanation": "",
            "problemType": fallback_solution.get("problemType", "manual-review"),
            "steps": fallback_solution.get("steps", []),
            "finalAnswer": fallback_solution.get("finalAnswer"),
            "variable": fallback_solution.get("variable"),
            "extractedEquation": fallback_solution.get("extractedEquation"),
            "numericAnswer": fallback_solution.get("numericAnswer"),
            "quiz": fallback_solution.get("quiz", {}),
            "recommendations": fallback_solution.get("recommendations", []),
            "contextPack": context_pack,
        }

        if math_solution:
            analysis_payload["status"] = "ok"
            analysis_payload["problemType"] = math_solution.get("problemType") or "math"
            analysis_payload["finalAnswer"] = math_explanation.get("finalAnswer") or math_solution.get("finalAnswer")
            analysis_payload["steps"] = math_explanation.get("steps") or math_solution.get("steps") or []
            analysis_payload["variable"] = math_explanation.get("variable") or math_solution.get("variable")
            analysis_payload["extractedEquation"] = math_explanation.get("extractedEquation") or math_solution.get("extractedEquation")
            analysis_payload["numericAnswer"] = math_explanation.get("numericAnswer") or math_solution.get("numericAnswer")
            analysis_payload["summary"] = math_explanation.get("summary") or analysis_payload["summary"]
            analysis_payload["detailedExplanation"] = math_explanation.get("detailedExplanation") or analysis_payload["detailedExplanation"]
            analysis_payload["quiz"] = fallback_solution.get("quiz", {}) or {}
        else:
            llm_bundle = _generate_llm_explanation(
                analysis_payload=analysis_payload,
                context_pack=context_pack,
                language=language,
            )
            if llm_bundle:
                analysis_payload["status"] = "ok" if not llm_bundle.get("needsManualReview") else "needs_review"
                analysis_payload["problemType"] = llm_bundle.get("problemType") or analysis_payload["problemType"]
                analysis_payload["summary"] = llm_bundle.get("summary") or analysis_payload["summary"]
                analysis_payload["detailedExplanation"] = llm_bundle.get("detailedExplanation") or analysis_payload["detailedExplanation"]
                analysis_payload["steps"] = llm_bundle.get("steps") or analysis_payload["steps"]
                analysis_payload["finalAnswer"] = llm_bundle.get("finalAnswer") or analysis_payload["finalAnswer"]
                analysis_payload["recommendations"] = llm_bundle.get("recommendations") or analysis_payload["recommendations"]
            else:
                raw_preview = ocr_result.get("raw_text") or ""
                analysis_payload["summary"] = analysis_payload["summary"] or (raw_preview[:220] if raw_preview else "The scan was processed.")
                analysis_payload["detailedExplanation"] = analysis_payload["detailedExplanation"] or (
                    "The backend extracted the document and prepared a grounded explanation. "
                    "If you want a deeper step-by-step answer, open the explanation page and ask a doubt."
                )

        if not analysis_payload.get("summary"):
            analysis_payload["summary"] = analysis_payload["scan"].get("summary") or "The homework was processed successfully."
        if not analysis_payload.get("detailedExplanation"):
            analysis_payload["detailedExplanation"] = analysis_payload["scan"].get("detailedExplanation") or analysis_payload["summary"]

        analysis_payload["subject"] = classification.get("subject") or {"id": subject or user.selected_subject_id or "maths", "confidence": 0.5, "reason": "Fallback subject."}
        analysis_payload["scan"]["summary"] = analysis_payload["summary"]
        analysis_payload["scan"]["detailedExplanation"] = analysis_payload["detailedExplanation"]
        analysis_payload["scan"]["extractedText"] = analysis_payload.get("extractedText")
        analysis_payload["scan"]["pageCount"] = analysis_payload.get("pageCount")
        analysis_payload["scan"]["scanMethod"] = analysis_payload.get("scanMethod")
        analysis_payload["scan"]["sourceKind"] = route_decision.file_kind
        analysis_payload["scan"]["sourceType"] = route_decision.document_kind
        analysis_payload["scan"]["fileName"] = file_name
        analysis_payload["scan"]["fileType"] = file_type
        analysis_payload["scan"]["questionText"] = analysis_payload.get("questionText")
        analysis_payload["summary"] = translate_text(analysis_payload["summary"], target_language=language)
        analysis_payload["detailedExplanation"] = translate_text(analysis_payload["detailedExplanation"], target_language=language)
        if isinstance(analysis_payload.get("steps"), list):
            for step in analysis_payload["steps"]:
                if isinstance(step, dict):
                    step["title"] = translate_text(step.get("title"), target_language=language)
                    step["desc"] = translate_text(step.get("desc") or step.get("description"), target_language=language)
        analysis_payload["scan"]["summary"] = analysis_payload["summary"]
        analysis_payload["scan"]["detailedExplanation"] = analysis_payload["detailedExplanation"]

        return PipelineArtifacts(
            route_decision=route_decision.model_dump(),
            ocr=ocr_result,
            document_package=document_package,
            analysis_payload=analysis_payload,
        )

    def generate_explanation(
        self,
        db: Session,
        *,
        user: UserProfile,
        analysis_id: int | None = None,
        question_text: str | None = None,
        language: str = "en",
    ) -> dict[str, Any]:
        row: HomeworkAnalysis | None = None
        if analysis_id is not None:
            row = db.get(HomeworkAnalysis, analysis_id)
        if row is None:
            row = db.scalar(
                select(HomeworkAnalysis)
                .where(HomeworkAnalysis.user_id == user.id)
                .order_by(desc(HomeworkAnalysis.created_at), desc(HomeworkAnalysis.id))
            )

        analysis_payload = _analysis_payload_from_row(row)
        if analysis_payload is None:
            if not question_text:
                return {
                    "question": EXPLANATION_TEMPLATE["question"],
                    "subject": EXPLANATION_TEMPLATE["subject"],
                    "finalAnswer": EXPLANATION_TEMPLATE["finalAnswer"],
                    "steps": EXPLANATION_TEMPLATE["steps"],
                    "analysisId": None,
                }
            analysis_payload = {
                "analysisId": None,
                "questionText": question_text,
                "summary": question_text,
                "detailedExplanation": "",
                "finalAnswer": "",
                "steps": [],
                "detectedSubject": {"id": user.selected_subject_id or "maths", "confidence": 0.5, "reason": "Question text only."},
                "scan": {},
            }

        context_pack = self.rag_service.build_context_pack(
            db,
            query=question_text or analysis_payload.get("questionText") or analysis_payload.get("summary") or "",
            user_id=user.id,
            analysis_id=analysis_id,
            limit=5,
        )
        math_solution = solve_math_question(question_text or analysis_payload.get("questionText") or "")
        math_explanation = build_math_explanation(math_solution) if math_solution else None
        llm_bundle = _generate_llm_explanation(
            analysis_payload=analysis_payload,
            context_pack=context_pack,
            language=language,
        )

        steps = _normalize_steps(
            (math_explanation or llm_bundle or {}).get("steps") or analysis_payload.get("steps") or []
        )
        if not steps:
            steps = _normalize_steps(EXPLANATION_TEMPLATE["steps"])

        explanation = {
            "question": question_text
            or analysis_payload.get("questionText")
            or analysis_payload.get("extractedText")
            or analysis_payload.get("summary")
            or EXPLANATION_TEMPLATE["question"],
            "subject": analysis_payload.get("detectedSubject") or EXPLANATION_TEMPLATE["subject"],
            "finalAnswer": (math_explanation or llm_bundle or {}).get("finalAnswer")
            or analysis_payload.get("finalAnswer")
            or EXPLANATION_TEMPLATE["finalAnswer"],
            "steps": steps,
            "analysisId": analysis_payload.get("analysisId"),
            "classification": analysis_payload.get("classification"),
            "structuredDocumentJson": analysis_payload.get("structuredDocumentJson"),
            "routeDecision": analysis_payload.get("routeDecision"),
            "contextPack": analysis_payload.get("contextPack"),
            "summary": (llm_bundle or {}).get("summary") or analysis_payload.get("summary") or "",
            "detailedExplanation": (llm_bundle or {}).get("detailedExplanation")
            or analysis_payload.get("detailedExplanation")
            or "",
            "scanMethod": analysis_payload.get("scanMethod") or analysis_payload.get("scan", {}).get("scanMethod"),
            "sourceType": analysis_payload.get("sourceType") or analysis_payload.get("scan", {}).get("sourceType"),
            "extractedText": analysis_payload.get("extractedText") or analysis_payload.get("scan", {}).get("extractedText"),
            "pageCount": analysis_payload.get("pageCount") or analysis_payload.get("scan", {}).get("pageCount"),
            "fileName": analysis_payload.get("fileName"),
            "fileType": analysis_payload.get("fileType"),
            "fileUrl": analysis_payload.get("fileUrl"),
            "scan": analysis_payload.get("scan"),
            "detectedLanguage": analysis_payload.get("detectedLanguage"),
        }
        explanation["summary"] = translate_text(explanation["summary"], target_language=language)
        explanation["detailedExplanation"] = translate_text(explanation["detailedExplanation"], target_language=language)
        for step in explanation["steps"]:
            if isinstance(step, dict):
                step["title"] = translate_text(step.get("title"), target_language=language)
                step["desc"] = translate_text(step.get("desc"), target_language=language)
        return explanation

    def generate_quiz(
        self,
        db: Session,
        *,
        user: UserProfile,
        analysis_payload: dict[str, Any] | None = None,
        analysis_id: int | None = None,
        topic: str | None = None,
        difficulty: str | None = None,
        question_count: int = 10,
        language: str = "en",
        adaptive: bool = True,
        allow_llm: bool = True,
    ) -> dict[str, Any]:
        if analysis_payload is None and analysis_id is not None:
            row = db.get(HomeworkAnalysis, analysis_id)
            analysis_payload = _analysis_payload_from_row(row)
        return self.quiz_service.generate_quiz(
            db,
            user=user,
            analysis_payload=analysis_payload,
            analysis_id=analysis_id,
            topic=topic,
            difficulty=difficulty,
            question_count=question_count,
            language=language,
            adaptive=adaptive,
            allow_llm=allow_llm,
        )

    def answer_doubt(
        self,
        db: Session,
        *,
        user: UserProfile,
        message: str,
        analysis_id: int | None = None,
        language: str = "en",
        history: list[dict[str, Any]] | None = None,
        thread_id: int | None = None,
    ) -> dict[str, Any]:
        analysis_payload = None
        if analysis_id is not None:
            row = db.get(HomeworkAnalysis, analysis_id)
            analysis_payload = _analysis_payload_from_row(row)
        return self.doubt_service.answer(
            db,
            user=user,
            message=message,
            analysis_id=analysis_id,
            analysis_payload=analysis_payload,
            language=language,
            history=history,
            thread_id=thread_id,
        )

    def build_student_analytics(self, db: Session, user: UserProfile) -> dict[str, Any]:
        return build_student_analytics(db, user)

    def build_recommendations(
        self,
        db: Session,
        user: UserProfile,
        *,
        analysis_payload: dict[str, Any] | None = None,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        return build_recommendations(db, user, analysis_payload=analysis_payload, limit=limit)


@lru_cache(maxsize=1)
def get_vidya_ai_core() -> VidyaAICore:
    return VidyaAICore()

from __future__ import annotations

import asyncio
import base64
import re
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from .constants import (
    ACTION_CARDS,
    APP_INFO,
    EXPLANATION_TEMPLATE,
    ONBOARDING_FEATURES,
    PARENT_RECOMMENDATIONS,
    PARENT_STATS,
    PERFORMANCE_BARS,
    QUIZ_QUESTIONS,
    SUBJECTS,
    level_for_xp,
    now_iso,
)
from .services.llm_router import get_llm_router
from .database import Base, SessionLocal, engine, get_db
from .models import AdaptiveQuizSession, HomeworkAnalysis, QuizAttempt, QuizQuestion, Subject, Subscription, UserProfile
from .schemas import (
    AnalyticsSummaryOut,
    AppInfo,
    BootstrapOut,
    DashboardOut,
    DoubtRequest,
    DoubtResponse,
    ExplanationChatRequest,
    ExplanationChatResponse,
    ExplanationGenerateRequest,
    ExplanationOut,
    HomeworkAnalyzeRequest,
    HomeworkAnalyzeResponse,
    OnboardingOut,
    ParentOut,
    QuizAnswerRequest,
    QuizGenerateRequest,
    QuizGenerateResponse,
    QuizStateOut,
    QuizQuestionOut,
    RecommendationOut,
    RecommendationRequest,
    ScreenUpdateRequest,
    SessionOut,
    SessionUpdateRequest,
    SubjectOut,
    SubscriptionOut,
    SubscriptionUpdateRequest,
    StudentAnalyticsOut,
    UserOut,
)
from .services.analytics_service import build_recommendations, build_student_analytics
from .services.orchestrator import get_vidya_ai_core
from .services.rag_service import get_rag_service
from .services.planner import build_daily_plan, build_insights
from .services.quiz_service import build_adaptive_quiz_state, get_quiz_service
from .services.chat import answer_explanation_chat
from .services.solver import explanation_from_analysis
from .websocket_manager import ConnectionManager

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Vidya AI Backend", version=APP_INFO["version"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

manager = ConnectionManager()


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_database(db)


def build_app_info() -> dict[str, Any]:
    return AppInfo(
        name=APP_INFO["name"],
        description=APP_INFO["description"],
        version=APP_INFO["version"],
        default_language=APP_INFO["defaultLanguage"],
        supported_languages=APP_INFO["supportedLanguages"],
    ).model_dump(by_alias=True)


def seed_database(db: Session) -> UserProfile:
    user = db.scalar(select(UserProfile).order_by(UserProfile.id.asc()))
    if user is None:
        user = UserProfile(
            name="Arjun",
            class_name="Class 8",
            avatar="🧑",
            streak=12,
            xp_points=840,
            level=level_for_xp(840),
            language="en",
            logged_in=False,
            active_screen=1,
            selected_subject_id="maths",
            homework_completed=7,
            doubts_solved=24,
            quiz_correct=0,
            quiz_answered=0,
            quiz_current_index=0,
            quiz_selected_option=None,
            quiz_status="idle",
            quiz_xp_earned_this_session=0,
            subscription_plan="Free",
        )
        db.add(user)
        db.flush()
        db.add(Subscription(user_id=user.id, plan_name=user.subscription_plan, status="active"))
    else:
        user.level = level_for_xp(user.xp_points)
        if db.scalar(select(Subscription).where(Subscription.user_id == user.id)) is None:
            db.add(Subscription(user_id=user.id, plan_name=user.subscription_plan, status="active"))

    if db.scalar(select(func.count()).select_from(Subject)) == 0:
        for item in SUBJECTS:
            db.add(
                Subject(
                    id=item["id"],
                    name=item["name"],
                    emoji=item["emoji"],
                    progress=item["progress"],
                    color_variant=item["colorVariant"],
                    color_hex=item["colorHex"],
                    focus_area=item["focusArea"],
                )
            )

    if db.scalar(select(func.count()).select_from(QuizQuestion)) == 0:
        for item in QUIZ_QUESTIONS:
            db.add(
                QuizQuestion(
                    id=item["id"],
                    question=item["question"],
                    options=item["options"],
                    correct_option=item["correctOption"],
                    wrong_option=item.get("wrongOption"),
                    subject_id="maths",
                )
            )

    db.commit()
    return user


def get_primary_user(db: Session) -> UserProfile:
    user = db.scalar(select(UserProfile).order_by(UserProfile.id.asc()))
    if user is None:
        user = seed_database(db)
    return user


def serialize_user(user: UserProfile) -> dict[str, Any]:
    return UserOut.model_validate(user).model_dump(by_alias=True, exclude_none=True)


def serialize_subject(subject: Subject) -> dict[str, Any]:
    return SubjectOut(
        id=subject.id,
        name=subject.name,
        emoji=subject.emoji,
        progress=subject.progress,
        color_variant=subject.color_variant,
        color_hex=subject.color_hex,
        focus_area=subject.focus_area,
    ).model_dump(by_alias=True, exclude_none=True)


def serialize_question(question: QuizQuestion) -> dict[str, Any]:
    return QuizQuestionOut(
        id=question.id,
        question=question.question,
        options=question.options,
        correct_option=question.correct_option,
        wrong_option=question.wrong_option,
        subject_id=question.subject_id,
    ).model_dump(by_alias=True, exclude_none=True)


def get_subjects(db: Session) -> list[Subject]:
    return list(db.scalars(select(Subject).order_by(Subject.progress.desc(), Subject.name.asc())).all())


def get_selected_subject(db: Session, user: UserProfile) -> Subject | None:
    subject = db.get(Subject, user.selected_subject_id or "maths")
    if subject is None:
        subject = db.scalars(select(Subject).order_by(Subject.id.asc())).first()
    return subject


def latest_analysis_row(db: Session, user: UserProfile) -> HomeworkAnalysis | None:
    return db.scalar(
        select(HomeworkAnalysis)
        .where(HomeworkAnalysis.user_id == user.id)
        .order_by(desc(HomeworkAnalysis.created_at), desc(HomeworkAnalysis.id))
    )


def analysis_payload_from_row(row: HomeworkAnalysis | None) -> dict[str, Any] | None:
    if row is None:
        return None
    payload = dict(row.raw_payload or {})
    payload["analysisId"] = row.id
    if row.file_name:
        payload["fileName"] = row.file_name
    if row.file_type:
        payload["fileType"] = row.file_type
    if row.file_path:
        payload["fileUrl"] = f"/uploads/{Path(row.file_path).name}"
    return payload


def analysis_payload_for_user(db: Session, user: UserProfile, analysis_id: int | None = None) -> dict[str, Any] | None:
    if analysis_id is not None:
        row = db.get(HomeworkAnalysis, analysis_id)
        if row is not None and row.user_id == user.id:
            payload = analysis_payload_from_row(row)
            if payload is not None:
                return payload

    row = latest_analysis_row(db, user)
    return analysis_payload_from_row(row)


def latest_analysis_payload(db: Session, user: UserProfile) -> dict[str, Any] | None:
    return analysis_payload_for_user(db, user)


def build_onboarding_payload() -> dict[str, Any]:
    return OnboardingOut(
        app=AppInfo(
            name=APP_INFO["name"],
            description=APP_INFO["description"],
            version=APP_INFO["version"],
            default_language=APP_INFO["defaultLanguage"],
            supported_languages=APP_INFO["supportedLanguages"],
        ),
        features=ONBOARDING_FEATURES,
        cta={"primary": "Let's Start!", "secondary": "I already have an account"},
    ).model_dump(by_alias=True, exclude_none=True)


_OPTION_PREFIX_RE = re.compile(r"^\s*(?:option\s*)?[A-Da-d]\s*(?:\)|\.|:|-)\s*", re.IGNORECASE)


def _canonical_quiz_option_text(value: str | None) -> str:
    text = " ".join(str(value or "").split()).strip()
    text = _OPTION_PREFIX_RE.sub("", text)
    return text.casefold()


def active_adaptive_quiz_session(db: Session, user: UserProfile) -> AdaptiveQuizSession | None:
    return db.scalar(
        select(AdaptiveQuizSession)
        .where(AdaptiveQuizSession.user_id == user.id, AdaptiveQuizSession.status == "active")
        .order_by(desc(AdaptiveQuizSession.created_at), desc(AdaptiveQuizSession.id))
    )


def build_quiz_state(db: Session, user: UserProfile) -> dict[str, Any]:
    ensure_quiz_session(db, user)
    adaptive_session = active_adaptive_quiz_session(db, user)
    if adaptive_session is not None:
        adaptive_state = build_adaptive_quiz_state(adaptive_session)
        if adaptive_state.questions:
            return adaptive_state.model_dump(by_alias=True, exclude_none=True)

        adaptive_session.status = "inactive"
        db.add(adaptive_session)
        db.commit()

    questions = [serialize_question(question) for question in db.scalars(select(QuizQuestion).order_by(QuizQuestion.id.asc())).all()]
    current_index = user.quiz_current_index % len(questions) if questions else 0
    current_question = questions[current_index] if questions else None
    return QuizStateOut(
        questions=questions,
        current_index=current_index,
        current_question=current_question,
        selected_option=user.quiz_selected_option,
        status=user.quiz_status,
        xp_earned_this_session=user.quiz_xp_earned_this_session,
        toast_message=(
            "+10 XP earned! Keep going, you're on fire!"
            if user.quiz_status == "correct"
            else ("Oops! That's incorrect. Try again!" if user.quiz_status == "wrong" else None)
        ),
        progress_percent=((current_index + 1) / max(1, len(questions))) * 100,
    ).model_dump(by_alias=True, exclude_none=True)


def ensure_adaptive_quiz_session(db: Session, user: UserProfile) -> None:
    latest_row = latest_analysis_row(db, user)
    latest_analysis_id = latest_row.id if latest_row is not None else None
    existing_session = active_adaptive_quiz_session(db, user)
    if existing_session is not None:
        if latest_analysis_id is None or existing_session.analysis_id == latest_analysis_id:
            existing_state = build_adaptive_quiz_state(existing_session)
            if len(existing_state.questions) >= 10:
                return
        existing_session.status = "inactive"
        db.add(existing_session)
        db.commit()

    if latest_row is None:
        return

    analysis_payload = analysis_payload_from_row(latest_row)
    get_vidya_ai_core().generate_quiz(
        db,
        user=user,
        analysis_payload=analysis_payload,
        analysis_id=latest_row.id,
        question_count=10,
        language=user.language or "en",
        adaptive=True,
        allow_llm=True,
    )


def ensure_quiz_session(db: Session, user: UserProfile) -> None:
    ensure_adaptive_quiz_session(db, user)


def build_dashboard_payload(db: Session, user: UserProfile) -> dict[str, Any]:
    subjects = get_subjects(db)
    selected_subject = get_selected_subject(db, user)
    analysis_payload = latest_analysis_payload(db, user)
    study_plan = build_daily_plan(user, user.selected_subject_id, analysis_payload)
    recommendations = (
        analysis_payload.get("recommendations")
        if analysis_payload and analysis_payload.get("recommendations")
        else PARENT_RECOMMENDATIONS
    )

    dashboard = DashboardOut(
        app=AppInfo(
            name=APP_INFO["name"],
            description=APP_INFO["description"],
            version=APP_INFO["version"],
            default_language=APP_INFO["defaultLanguage"],
            supported_languages=APP_INFO["supportedLanguages"],
        ),
        user=user,
        subjects=subjects,
        action_cards=ACTION_CARDS,
        weekly_progress=[
            {"id": subject.id, "name": subject.name, "emoji": subject.emoji, "progress": subject.progress, "colorVariant": subject.color_variant}
            for subject in subjects[:3]
        ],
        recommendations=recommendations,
        selected_subject=selected_subject,
        study_plan=study_plan,
        last_analysis=analysis_payload,
    )
    return dashboard.model_dump(by_alias=True, exclude_none=True)


def build_parent_payload(db: Session, user: UserProfile) -> dict[str, Any]:
    insights = build_insights(user)
    stats = [
        {"id": "streak", "value": str(user.streak), "label": "Day Streak", "colorHex": "#FF6B35"},
        {"id": "xp", "value": str(user.xp_points), "label": "Total XP", "colorHex": "#7B5EA7"},
        {"id": "completed", "value": str(user.homework_completed), "label": "HW Completed", "colorHex": "#4CAF50"},
        {"id": "doubts", "value": str(user.doubts_solved), "label": "Doubts Solved", "colorHex": "#2196F3"},
    ]
    recommendations = latest_analysis_payload(db, user).get("recommendations") if latest_analysis_payload(db, user) else PARENT_RECOMMENDATIONS
    parent = ParentOut(
        app=AppInfo(
            name=APP_INFO["name"],
            description=APP_INFO["description"],
            version=APP_INFO["version"],
            default_language=APP_INFO["defaultLanguage"],
            supported_languages=APP_INFO["supportedLanguages"],
        ),
        user=user,
        stats=stats,
        performance_bars=PERFORMANCE_BARS,
        recommendations=recommendations or PARENT_RECOMMENDATIONS,
        insights=insights,
    )
    return parent.model_dump(by_alias=True, exclude_none=True)


def build_explanation_payload(db: Session, user: UserProfile, analysis_id: int | None = None) -> dict[str, Any]:
    analysis_payload = analysis_payload_for_user(db, user, analysis_id)
    scan_payload = analysis_payload.get("scan") if analysis_payload else None
    explanation = explanation_from_analysis(analysis_payload)
    if analysis_payload and analysis_payload.get("status") == "ok":
        return ExplanationOut(
            question=explanation["question"],
            subject=explanation["subject"],
            final_answer=explanation["finalAnswer"],
            steps=explanation["steps"],
            analysis_id=analysis_payload.get("analysisId"),
            classification=analysis_payload.get("classification"),
            structured_document_json=analysis_payload.get("structuredDocumentJson"),
            route_decision=analysis_payload.get("routeDecision"),
            context_pack=analysis_payload.get("contextPack"),
            summary=analysis_payload.get("summary") or (scan_payload or {}).get("summary"),
            detailed_explanation=analysis_payload.get("detailedExplanation") or (scan_payload or {}).get("detailedExplanation"),
            scan_method=analysis_payload.get("scanMethod") or (scan_payload or {}).get("scanMethod"),
            source_type=analysis_payload.get("sourceType") or (scan_payload or {}).get("sourceKind"),
            extracted_text=analysis_payload.get("extractedText") or (scan_payload or {}).get("extractedText"),
            page_count=analysis_payload.get("pageCount") or (scan_payload or {}).get("pageCount"),
            file_name=analysis_payload.get("fileName"),
            file_type=analysis_payload.get("fileType"),
            file_url=analysis_payload.get("fileUrl"),
            scan=scan_payload,
            detected_language=analysis_payload.get("detectedLanguage"),
        ).model_dump(by_alias=True, exclude_none=True)

    # For upload/ocr pending states, show a useful intermediary explanation.
    if analysis_payload:
        scan_extracted_text = (scan_payload or {}).get("extractedText")
        return {
            "question": (
                analysis_payload.get("questionText")
                or scan_extracted_text
                or analysis_payload.get("summary")
                or EXPLANATION_TEMPLATE["question"]
            ),
            "subject": analysis_payload.get("detectedSubject") or EXPLANATION_TEMPLATE["subject"],
            "finalAnswer": analysis_payload.get("finalAnswer") or "The handwritten scan is still being processed.",
            "steps": analysis_payload.get("steps") or (scan_payload or {}).get("steps") or EXPLANATION_TEMPLATE["steps"],
            "analysisId": analysis_payload.get("analysisId"),
            "classification": analysis_payload.get("classification"),
            "structuredDocumentJson": analysis_payload.get("structuredDocumentJson"),
            "routeDecision": analysis_payload.get("routeDecision"),
            "contextPack": analysis_payload.get("contextPack"),
            "summary": analysis_payload.get("summary") or (scan_payload or {}).get("summary"),
            "detailedExplanation": analysis_payload.get("detailedExplanation") or (scan_payload or {}).get("detailedExplanation"),
            "scanMethod": analysis_payload.get("scanMethod") or (scan_payload or {}).get("scanMethod"),
            "sourceType": analysis_payload.get("sourceType") or (scan_payload or {}).get("sourceKind"),
            "extractedText": analysis_payload.get("extractedText") or (scan_payload or {}).get("extractedText"),
            "pageCount": analysis_payload.get("pageCount") or (scan_payload or {}).get("pageCount"),
            "fileName": analysis_payload.get("fileName"),
            "fileType": analysis_payload.get("fileType"),
            "fileUrl": analysis_payload.get("fileUrl"),
            "scan": scan_payload,
            "detectedLanguage": analysis_payload.get("detectedLanguage"),
        }

    return {
        "question": EXPLANATION_TEMPLATE["question"],
        "subject": EXPLANATION_TEMPLATE["subject"],
        "finalAnswer": EXPLANATION_TEMPLATE["finalAnswer"],
        "steps": EXPLANATION_TEMPLATE["steps"],
        "analysisId": None,
        "classification": None,
        "structuredDocumentJson": None,
        "routeDecision": None,
        "contextPack": None,
    }


def build_bootstrap_payload(db: Session, user: UserProfile) -> dict[str, Any]:
    return {
        "app": build_app_info(),
        "session": build_session_payload(user),
        "onboarding": build_onboarding_payload(),
        "dashboard": build_dashboard_payload(db, user),
        "explanation": build_explanation_payload(db, user),
        "quiz": build_quiz_state(db, user),
        "parent": build_parent_payload(db, user),
    }


def build_session_payload(user: UserProfile) -> dict[str, Any]:
    return SessionOut(
        logged_in=user.logged_in,
        active_screen=user.active_screen,
        language=user.language,
        selected_subject_id=user.selected_subject_id,
    ).model_dump(by_alias=True, exclude_none=True)


def build_session_and_user_payload(user: UserProfile) -> dict[str, Any]:
    return {
        "session": build_session_payload(user),
        "user": serialize_user(user),
        "subscription": get_subscription_payload(user),
    }


def get_subscription_payload(user: UserProfile) -> dict[str, Any]:
    return SubscriptionOut(
        plan_name=user.subscription_plan,
        status="active",
    ).model_dump(by_alias=True, exclude_none=True)


def get_question_row(db: Session, index: int) -> QuizQuestion | None:
    questions = list(db.scalars(select(QuizQuestion).order_by(QuizQuestion.id.asc())).all())
    if not questions:
        return None
    return questions[index % len(questions)]


def build_analytics_payload(db: Session, user: UserProfile) -> dict[str, Any]:
    total_analyses = db.scalar(select(func.count()).select_from(HomeworkAnalysis).where(HomeworkAnalysis.user_id == user.id)) or 0
    total_quiz_attempts = db.scalar(select(func.count()).select_from(QuizAttempt).where(QuizAttempt.user_id == user.id)) or 0
    return AnalyticsSummaryOut(
        total_analyses=total_analyses,
        total_quiz_attempts=total_quiz_attempts,
        total_quiz_correct=user.quiz_correct,
        xp_points=user.xp_points,
        streak=user.streak,
        homework_completed=user.homework_completed,
        doubts_solved=user.doubts_solved,
        active_subject_id=user.selected_subject_id,
    ).model_dump(by_alias=True, exclude_none=True)


def decode_base64_payload(file_data_base64: str | None) -> bytes | None:
    if not file_data_base64:
        return None

    payload = file_data_base64
    if payload.startswith("data:") and "," in payload:
        payload = payload.split(",", 1)[1]

    try:
        return base64.b64decode(payload, validate=False)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid base64 payload: {exc}") from exc


def save_uploaded_file(
    file_name: str | None,
    file_type: str | None,
    file_data_base64: str | None,
    raw_bytes: bytes | None = None,
) -> tuple[str | None, str | None, bytes | None]:
    if not file_data_base64:
        return None, None, None

    raw_payload = raw_bytes or decode_base64_payload(file_data_base64)
    if raw_payload is None:
        return None, None, None

    safe_name = Path(file_name or f"upload-{uuid4().hex}.bin").name
    if "." not in safe_name and file_type:
        extension_map = {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/jpg": "jpg",
            "application/pdf": "pdf",
            "text/plain": "txt",
        }
        suffix = extension_map.get(file_type.lower(), "bin")
        safe_name = f"{safe_name}.{suffix}"

    saved_name = f"{uuid4().hex}_{safe_name}"
    file_path = UPLOAD_DIR / saved_name
    file_path.write_bytes(raw_payload)
    return saved_name, f"/uploads/{saved_name}", raw_payload


def touch_user_level(user: UserProfile) -> None:
    user.level = level_for_xp(user.xp_points)


async def broadcast_event(event_type: str, payload: dict[str, Any]) -> None:
    await manager.broadcast(
        {
            "type": event_type,
            "payload": payload,
            "timestamp": now_iso(),
        }
    )


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": APP_INFO["name"],
        "status": "healthy",
        "timestamp": now_iso(),
    }


@app.get("/api/info")
def api_info() -> dict[str, Any]:
    return {"ok": True, "app": build_app_info()}


@app.get("/api/llm/status")
def llm_status() -> dict[str, Any]:
    router = get_llm_router()
    return {
        "ok": True,
        "provider": router.provider_name,
        "configured": router.configured,
        "providers": {
            "groq": router.groq_configured,
            "huggingface": router.huggingface_configured,
        },
        "preferredProvider": router.preferred_provider,
    }


@app.get("/api/session")
def get_session(db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    return {"ok": True, **build_session_and_user_payload(user)}


@app.post("/api/session/login")
async def session_login(db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    user.logged_in = True
    user.active_screen = 0
    touch_user_level(user)
    db.add(user)
    db.commit()
    await broadcast_event("session_updated", build_session_and_user_payload(user))
    return {"ok": True, **build_session_and_user_payload(user), "dashboard": build_dashboard_payload(db, user)}


@app.post("/api/session/logout")
async def session_logout(db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    user.logged_in = False
    user.active_screen = 1
    touch_user_level(user)
    db.add(user)
    db.commit()
    await broadcast_event("session_updated", build_session_and_user_payload(user))
    return {"ok": True, **build_session_and_user_payload(user)}


@app.post("/api/session/screen")
async def update_screen(payload: ScreenUpdateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    user.active_screen = payload.active_screen
    db.add(user)
    db.commit()
    await broadcast_event("screen_changed", build_session_and_user_payload(user))
    return {"ok": True, **build_session_and_user_payload(user)}


@app.post("/api/session/language")
async def update_language(payload: SessionUpdateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    if not payload.language:
        raise HTTPException(status_code=400, detail="language is required")
    user = get_primary_user(db)
    user.language = payload.language
    db.add(user)
    db.commit()
    await broadcast_event("language_changed", build_session_and_user_payload(user))
    return {"ok": True, **build_session_and_user_payload(user)}


@app.post("/api/session/subject")
async def update_subject(payload: SessionUpdateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    if not payload.selected_subject_id:
        raise HTTPException(status_code=400, detail="selectedSubjectId is required")
    subject = db.get(Subject, payload.selected_subject_id)
    if subject is None:
        raise HTTPException(status_code=404, detail="Unknown subject")
    user = get_primary_user(db)
    user.selected_subject_id = payload.selected_subject_id
    db.add(user)
    db.commit()
    payload_data = {
        "ok": True,
        **build_session_and_user_payload(user),
        "selectedSubject": serialize_subject(subject),
    }
    await broadcast_event("subject_selected", payload_data)
    return payload_data


@app.get("/api/bootstrap")
def bootstrap(db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    return {"ok": True, **build_bootstrap_payload(db, user)}


@app.get("/api/onboarding")
def onboarding() -> dict[str, Any]:
    return {"ok": True, **build_onboarding_payload()}


@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    return {"ok": True, **build_dashboard_payload(db, user)}


@app.get("/api/subjects")
def subjects(db: Session = Depends(get_db)) -> dict[str, Any]:
    return {
        "ok": True,
        "subjects": [serialize_subject(subject) for subject in get_subjects(db)],
    }


@app.get("/api/subjects/{subject_id}")
def subject_detail(subject_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")

    user = get_primary_user(db)
    analysis_count = db.scalar(
        select(func.count())
        .select_from(HomeworkAnalysis)
        .where(HomeworkAnalysis.user_id == user.id, HomeworkAnalysis.detected_subject_id == subject.id)
    ) or 0

    return {
        "ok": True,
        "subject": serialize_subject(subject),
        "relatedAnalysisCount": analysis_count,
        "plan": build_daily_plan(user, subject.id, latest_analysis_payload(db, user)),
    }


@app.get("/api/explanation")
def explanation(
    analysis_id: int | None = Query(default=None, alias="analysisId"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    user = get_primary_user(db)
    return {"ok": True, **build_explanation_payload(db, user, analysis_id)}


@app.post("/api/explanation/chat", response_model=ExplanationChatResponse)
async def explanation_chat(payload: ExplanationChatRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)

    analysis_payload = None
    if payload.analysis_id is not None:
        row = db.get(HomeworkAnalysis, payload.analysis_id)
        if row is not None and row.user_id == user.id:
            analysis_payload = analysis_payload_from_row(row)

    if analysis_payload is None:
        analysis_payload = analysis_payload_for_user(db, user, payload.analysis_id)

    chat_result = await asyncio.to_thread(
        answer_explanation_chat,
        analysis=analysis_payload,
        message=payload.message,
        history=[item.model_dump(by_alias=True) for item in payload.history],
        language=payload.language or user.language or "en",
    )

    response = ExplanationChatResponse(
        analysis_id=analysis_payload.get("analysisId") if analysis_payload else None,
        reply=chat_result["reply"],
        suggested_questions=chat_result.get("suggestedQuestions") or [],
        scan_method=(analysis_payload or {}).get("scanMethod") or ((analysis_payload or {}).get("scan") or {}).get("scanMethod"),
        source_type=(analysis_payload or {}).get("sourceType") or ((analysis_payload or {}).get("scan") or {}).get("sourceKind"),
        question_text=(analysis_payload or {}).get("questionText") or (analysis_payload or {}).get("question"),
    )

    await broadcast_event(
        "explanation_chat",
        {
            "analysisId": response.analysis_id,
            "reply": response.reply,
        },
    )
    return response.model_dump(by_alias=True, exclude_none=True)


@app.post("/api/explanation/generate", response_model=ExplanationOut)
def generate_explanation(payload: ExplanationGenerateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    explanation = get_vidya_ai_core().generate_explanation(
        db,
        user=user,
        analysis_id=payload.analysis_id,
        question_text=payload.question_text,
        language=payload.language or user.language or "en",
    )
    return {"ok": True, **explanation}


@app.post("/api/chat/doubt", response_model=DoubtResponse)
def chat_doubt(payload: DoubtRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    response = get_vidya_ai_core().answer_doubt(
        db,
        user=user,
        message=payload.message,
        analysis_id=payload.analysis_id,
        language=payload.language or user.language or "en",
        history=[item.model_dump(by_alias=True) for item in payload.history],
        thread_id=payload.thread_id,
    )
    return response


@app.post("/api/quiz/generate", response_model=QuizGenerateResponse)
def generate_quiz(payload: QuizGenerateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    response = get_vidya_ai_core().generate_quiz(
        db,
        user=user,
        analysis_id=payload.analysis_id,
        topic=payload.topic,
        difficulty=payload.difficulty,
        question_count=payload.question_count,
        language=payload.language or user.language or "en",
        adaptive=payload.adaptive,
    )
    return {"ok": True, **response}


@app.get("/api/student/analytics", response_model=StudentAnalyticsOut)
def student_analytics(db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    return get_vidya_ai_core().build_student_analytics(db, user)


@app.post("/api/recommendations")
def recommendations_post(payload: RecommendationRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    analysis_payload = analysis_payload_for_user(db, user, payload.analysis_id) if payload.analysis_id is not None else latest_analysis_payload(db, user)
    recommendations = get_vidya_ai_core().build_recommendations(
        db,
        user,
        analysis_payload=analysis_payload,
        limit=max(1, min(10, payload.limit)),
    )
    return {"ok": True, "recommendations": recommendations}


@app.post("/api/homework/analyze", response_model=HomeworkAnalyzeResponse)
@app.post("/api/analyze", response_model=HomeworkAnalyzeResponse)
async def analyze(payload: HomeworkAnalyzeRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)

    file_name = payload.file_name
    file_type = payload.file_type
    file_url = None
    saved_file_name = None
    file_bytes = None
    if payload.file_data_base64:
        saved_file_name, file_url, file_bytes = save_uploaded_file(payload.file_name, payload.file_type, payload.file_data_base64)
        file_name = file_name or saved_file_name

    pipeline = get_vidya_ai_core().analyze_homework(
        db=db,
        user=user,
        file_name=file_name,
        file_type=file_type,
        file_bytes=file_bytes,
        input_method=payload.input_method,
        subject=payload.subject or user.selected_subject_id,
        language=payload.language,
        question_text=payload.question_text,
        transcript=payload.transcript,
        notes=payload.notes,
        ocr_text=payload.ocr_text,
    )
    analysis_result = pipeline.analysis_payload
    scan_context = dict(analysis_result.get("scan") or {})
    detected_subject = analysis_result.get("detectedSubject") or {"id": payload.subject or user.selected_subject_id or "maths", "confidence": 0.5, "reason": "Fallback subject."}
    user.selected_subject_id = detected_subject["id"]
    user.doubts_solved += 1
    if analysis_result.get("status") == "ok":
        user.homework_completed += 1

    scan_context_storage = dict(scan_context)
    scan_context_storage.pop("pageImages", None)

    if scan_context_storage.get("questionText"):
        analysis_result["questionText"] = scan_context_storage["questionText"]
    analysis_result["source"] = analysis_result.get("scanMethod") or payload.input_method
    analysis_result["scanMethod"] = analysis_result.get("scanMethod") or scan_context_storage.get("scanMethod")
    analysis_result["sourceType"] = analysis_result.get("sourceType") or scan_context_storage.get("sourceKind")
    analysis_result["extractedText"] = analysis_result.get("extractedText") or scan_context_storage.get("extractedText")
    analysis_result["pageCount"] = analysis_result.get("pageCount") or scan_context_storage.get("pageCount")
    analysis_result["detailedExplanation"] = (
        analysis_result.get("detailedExplanation")
        or scan_context_storage.get("detailedExplanation")
        or analysis_result.get("summary")
    )
    analysis_result["summary"] = analysis_result.get("summary") or scan_context_storage.get("summary")
    if not analysis_result.get("recommendations") and scan_context_storage.get("recommendations"):
        analysis_result["recommendations"] = scan_context_storage.get("recommendations")
    if not analysis_result.get("steps") and scan_context_storage.get("steps"):
        analysis_result["steps"] = scan_context_storage.get("steps")

    analysis = HomeworkAnalysis(
        user_id=user.id,
        input_method=payload.input_method,
        language=payload.language,
        subject_id=payload.subject or detected_subject["id"],
        detected_subject_id=detected_subject["id"],
        confidence=float(detected_subject.get("confidence", 0.5)),
        question_text=analysis_result.get("questionText") or payload.question_text or payload.transcript or payload.ocr_text or payload.notes or "",
        extracted_equation=analysis_result.get("extractedEquation"),
        final_answer=analysis_result.get("finalAnswer"),
        variable=analysis_result.get("variable"),
        status=analysis_result.get("status", "needs_review"),
        steps=analysis_result.get("steps", []),
        quiz=analysis_result.get("quiz", {}),
        recommendations=analysis_result.get("recommendations", []),
        raw_payload={**analysis_result, "scan": scan_context_storage},
        file_name=file_name,
        file_type=file_type,
        file_path=saved_file_name,
        transcript=payload.transcript or payload.ocr_text or payload.notes,
        summary=analysis_result.get("summary"),
    )
    db.add(analysis)
    db.flush()

    get_rag_service().index_analysis(
        db,
        user_id=user.id,
        analysis_id=analysis.id,
        payload=analysis_result,
    )

    if file_url:
        analysis_result["fileUrl"] = file_url
    if file_name:
        analysis_result["fileName"] = file_name
    if file_type:
        analysis_result["fileType"] = file_type
    analysis_result["analysisId"] = analysis.id
    analysis_result["scan"] = scan_context_storage

    user.selected_subject_id = detected_subject["id"]
    touch_user_level(user)
    db.add(user)
    db.commit()

    payload_for_ws = {"analysis": analysis_result, "user": serialize_user(user)}
    await broadcast_event("homework_analyzed", payload_for_ws)

    if analysis_result.get("status") == "ok":
        return analysis_result

    return analysis_result


@app.get("/api/quiz")
def quiz(db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    ensure_quiz_session(db, user)
    quiz_state = build_quiz_state(db, user)
    return {"ok": True, **quiz_state}


@app.get("/api/quiz/question")
def quiz_question(id: str | None = None, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    adaptive_session = active_adaptive_quiz_session(db, user)
    if adaptive_session is not None:
        adaptive_state = build_adaptive_quiz_state(adaptive_session)
        if adaptive_state.questions:
            question = adaptive_state.current_question if id is None else next((entry for entry in adaptive_state.questions if entry.id == id), None)
            if question is not None:
                return {"ok": True, "question": question.model_dump(by_alias=True, exclude_none=True)}

    if id:
        question = db.get(QuizQuestion, id)
    else:
        question = get_question_row(db, user.quiz_current_index)
    if question is None:
        raise HTTPException(status_code=404, detail="Quiz question not found")
    return {"ok": True, "question": serialize_question(question)}


@app.post("/api/quiz/answer")
async def quiz_answer(payload: QuizAnswerRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)

    adaptive_session = active_adaptive_quiz_session(db, user)
    if payload.quiz_session_id or adaptive_session is not None:
        try:
            response = get_quiz_service().answer_quiz(
                db,
                user=user,
                selected_option=payload.selected_option,
                quiz_session_id=payload.quiz_session_id,
                question_id=payload.question_id,
                response_seconds=payload.response_seconds,
            )
        except ValueError as exc:
            detail = str(exc)
            status_code = 409 if any(token in detail.lower() for token in ("already been answered", "not been answered", "not active")) else 404
            raise HTTPException(status_code=status_code, detail=detail) from exc
        await broadcast_event("adaptive_quiz_answered", response)
        return response

    question = get_question_row(db, user.quiz_current_index)
    if question is None:
        raise HTTPException(status_code=404, detail="No quiz question is available")

    if user.quiz_status != "idle":
        raise HTTPException(status_code=409, detail="The current question has already been answered")

    correct = _canonical_quiz_option_text(payload.selected_option) == _canonical_quiz_option_text(question.correct_option)
    xp_awarded = 10 if correct else 0

    user.quiz_selected_option = payload.selected_option
    user.quiz_status = "correct" if correct else "wrong"
    user.quiz_answered += 1
    if correct:
        user.quiz_correct += 1
        user.quiz_xp_earned_this_session += xp_awarded
        user.xp_points += xp_awarded
        user.level = level_for_xp(user.xp_points)

    db.add(
        QuizAttempt(
            user_id=user.id,
            question_id=question.id,
            selected_option=payload.selected_option,
            correct=correct,
            xp_awarded=xp_awarded,
        )
    )
    db.add(user)
    db.commit()

    response = {
        "ok": True,
        "quiz": build_quiz_state(db, user),
        "user": serialize_user(user),
        "result": {
            "correct": correct,
            "correctOption": question.correct_option,
            "selectedOption": payload.selected_option,
            "xpAwarded": xp_awarded,
            "toastMessage": "+10 XP earned! Keep going, you're on fire!" if correct else "Oops! That's incorrect. Try again!",
        },
    }
    await broadcast_event("quiz_answered", response)
    return response


@app.post("/api/quiz/next")
async def quiz_next(db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    adaptive_session = active_adaptive_quiz_session(db, user)
    if adaptive_session is not None:
        try:
            response = get_quiz_service().next_quiz(
                db,
                user=user,
                quiz_session_id=None,
            )
        except ValueError as exc:
            detail = str(exc)
            status_code = 409 if any(token in detail.lower() for token in ("not been answered", "not active")) else 404
            raise HTTPException(status_code=status_code, detail=detail) from exc
        await broadcast_event("adaptive_quiz_advanced", response)
        return response

    questions = list(db.scalars(select(QuizQuestion).order_by(QuizQuestion.id.asc())).all())
    if not questions:
        raise HTTPException(status_code=404, detail="No quiz questions are available")

    if user.quiz_current_index < len(questions) - 1:
        user.quiz_current_index += 1
    else:
        user.quiz_current_index = 0
        user.quiz_xp_earned_this_session = 0

    user.quiz_selected_option = None
    user.quiz_status = "idle"
    db.add(user)
    db.commit()

    response = {"ok": True, "quiz": build_quiz_state(db, user)}
    await broadcast_event("quiz_advanced", response)
    return response


@app.post("/api/quiz/reset")
async def quiz_reset(db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    adaptive_session = active_adaptive_quiz_session(db, user)
    if adaptive_session is not None:
        try:
            get_quiz_service().complete_quiz_session(db, user=user, quiz_session_id=None)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    else:
        user.quiz_current_index = 0
        user.quiz_selected_option = None
        user.quiz_status = "idle"
        user.quiz_xp_earned_this_session = 0
        db.add(user)
        db.commit()

    ensure_adaptive_quiz_session(db, user)
    response = {"ok": True, "quiz": build_quiz_state(db, user)}
    await broadcast_event("adaptive_quiz_reset" if active_adaptive_quiz_session(db, user) is not None else "quiz_reset", response)
    return response


@app.get("/api/parent")
def parent(db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    return {"ok": True, **build_parent_payload(db, user)}


@app.get("/api/parent/report")
def parent_report(db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    return {
        "ok": True,
        "report": {
            "parent": build_parent_payload(db, user),
            "analytics": build_analytics_payload(db, user),
        },
    }


@app.get("/api/recommendations")
def recommendations(db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    analysis_payload = latest_analysis_payload(db, user)
    return {
        "ok": True,
        "recommendations": get_vidya_ai_core().build_recommendations(
            db,
            user,
            analysis_payload=analysis_payload,
            limit=5,
        ),
    }


@app.get("/api/analytics/summary", response_model=AnalyticsSummaryOut)
def analytics_summary(db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    return build_analytics_payload(db, user)


@app.get("/api/planner/today")
def planner_today(db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    selected_subject = get_selected_subject(db, user)
    return {
        "ok": True,
        "plan": build_daily_plan(user, selected_subject.id if selected_subject else user.selected_subject_id, latest_analysis_payload(db, user)),
        "insights": build_insights(user),
    }


@app.get("/api/subscription")
def get_subscription(db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    subscription = db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if subscription is None:
        subscription = Subscription(user_id=user.id, plan_name=user.subscription_plan, status="active")
        db.add(subscription)
        db.commit()
    return {
        "ok": True,
        "subscription": SubscriptionOut(
            plan_name=subscription.plan_name,
            status=subscription.status,
            renewal_date=subscription.renewal_date,
        ).model_dump(by_alias=True, exclude_none=True),
    }


@app.post("/api/subscription/upgrade")
async def upgrade_subscription(payload: SubscriptionUpdateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    subscription = db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if subscription is None:
        subscription = Subscription(user_id=user.id, plan_name=payload.plan_name, status="active")
    else:
        subscription.plan_name = payload.plan_name
        subscription.status = "active"
    user.subscription_plan = payload.plan_name
    db.add(subscription)
    db.add(user)
    db.commit()
    response = {
        "ok": True,
        "subscription": SubscriptionOut(
            plan_name=subscription.plan_name,
            status=subscription.status,
            renewal_date=subscription.renewal_date,
        ).model_dump(by_alias=True, exclude_none=True),
        "user": serialize_user(user),
    }
    await broadcast_event("subscription_updated", response)
    return response


@app.post("/api/subscription/cancel")
async def cancel_subscription(db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    subscription = db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    if subscription is None:
        subscription = Subscription(user_id=user.id, plan_name="Free", status="active")
    else:
        subscription.plan_name = "Free"
        subscription.status = "active"
        subscription.renewal_date = None
    user.subscription_plan = "Free"
    db.add(subscription)
    db.add(user)
    db.commit()
    response = {
        "ok": True,
        "subscription": SubscriptionOut(
            plan_name=subscription.plan_name,
            status=subscription.status,
            renewal_date=subscription.renewal_date,
        ).model_dump(by_alias=True, exclude_none=True),
        "user": serialize_user(user),
    }
    await broadcast_event("subscription_updated", response)
    return response


@app.post("/api/session/update")
async def session_update(payload: SessionUpdateRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = get_primary_user(db)
    if payload.active_screen is not None:
        user.active_screen = payload.active_screen
    if payload.language is not None:
        user.language = payload.language
    if payload.selected_subject_id is not None:
        subject = db.get(Subject, payload.selected_subject_id)
        if subject is None:
            raise HTTPException(status_code=404, detail="Unknown subject")
        user.selected_subject_id = payload.selected_subject_id
    db.add(user)
    db.commit()
    response = {"ok": True, **build_session_and_user_payload(user)}
    await broadcast_event("session_updated", response)
    return response


@app.websocket("/ws/updates")
async def websocket_updates(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        await websocket.send_json({"type": "connected", "timestamp": now_iso(), "message": "Live homework updates ready"})
        while True:
            data = await websocket.receive_text()
            if data.strip().lower() == "ping":
                await websocket.send_json({"type": "pong", "timestamp": now_iso()})
            else:
                await websocket.send_json({"type": "echo", "timestamp": now_iso(), "message": data})
    except WebSocketDisconnect:
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="127.0.0.1", port=4000, reload=True)

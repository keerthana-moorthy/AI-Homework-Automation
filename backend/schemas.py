from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


def to_camel(string: str) -> str:
    first, *rest = string.split("_")
    return first + "".join(part.capitalize() for part in rest)


class CamelModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        from_attributes=True,
        alias_generator=to_camel,
    )


class AppInfo(CamelModel):
    name: str
    description: str
    version: str
    default_language: str
    supported_languages: list[str]


class UserOut(CamelModel):
    id: int
    name: str
    class_name: str
    avatar: str
    streak: int
    xp_points: int
    level: str
    language: str
    logged_in: bool
    active_screen: int
    selected_subject_id: str | None = None
    homework_completed: int
    doubts_solved: int
    quiz_correct: int
    quiz_answered: int
    quiz_current_index: int
    quiz_selected_option: str | None = None
    quiz_status: str
    quiz_xp_earned_this_session: int
    subscription_plan: str
    created_at: datetime
    updated_at: datetime


class SubjectOut(CamelModel):
    id: str
    name: str
    emoji: str
    progress: int
    color_variant: str
    color_hex: str
    focus_area: str


class ActionCardOut(CamelModel):
    id: str
    emoji: str
    label: str
    subtext: str
    card_type: str
    target_screen: int


class OnboardingFeatureOut(CamelModel):
    id: str
    emoji: str
    label: str
    subtext: str
    color_type: str


class StepOut(CamelModel):
    step_num: int
    title: str
    desc: str


class QuizQuestionOut(CamelModel):
    id: str
    question: str
    options: list[str]
    correct_option: str
    wrong_option: str | None = None
    subject_id: str | None = None


class RecommendationOut(CamelModel):
    id: str
    emoji: str
    title: str
    description: str


class ParentStatOut(CamelModel):
    id: str
    value: str
    label: str
    color_hex: str


class HomeworkAnalyzeRequest(CamelModel):
    question_text: str | None = None
    input_method: str = "type"
    subject: str | None = None
    language: str = "en"
    transcript: str | None = None
    file_name: str | None = None
    file_type: str | None = None
    file_data_base64: str | None = None
    notes: str | None = None
    ocr_text: str | None = None


class ExplanationGenerateRequest(CamelModel):
    analysis_id: int | None = None
    question_text: str | None = None
    language: str = "en"
    force_refresh: bool = False


class ChatMessageIn(CamelModel):
    role: Literal["user", "assistant"]
    content: str


class ExplanationChatRequest(CamelModel):
    analysis_id: int | None = None
    message: str
    language: str = "en"
    history: list[ChatMessageIn] = Field(default_factory=list)


class ExplanationChatResponse(CamelModel):
    analysis_id: int | None = None
    reply: str
    suggested_questions: list[str] = Field(default_factory=list)
    scan_method: str | None = None
    source_type: str | None = None
    question_text: str | None = None


class DoubtRequest(CamelModel):
    analysis_id: int | None = None
    message: str
    language: str = "en"
    history: list[ChatMessageIn] = Field(default_factory=list)
    thread_id: int | None = None


class DoubtResponse(CamelModel):
    analysis_id: int | None = None
    thread_id: int | None = None
    reply: str
    citations: list[dict[str, Any]] = Field(default_factory=list)
    suggested_questions: list[str] = Field(default_factory=list)
    grounded: bool = True


class HomeworkAnalyzeResponse(CamelModel):
    status: Literal["ok", "needs_review", "error"]
    source: str | None = None
    question_text: str | None = None
    analysis_id: int | None = None
    detected_subject: dict[str, Any] | None = None
    classification: dict[str, Any] | None = None
    structured_document_json: dict[str, Any] | None = None
    route_decision: dict[str, Any] | None = None
    context_pack: dict[str, Any] | None = None
    detected_language: str | None = None
    raw_text: str | None = None
    structured_blocks: list[dict[str, Any]] = Field(default_factory=list)
    formulas: list[str] = Field(default_factory=list)
    tables: list[str] = Field(default_factory=list)
    diagrams: list[str] = Field(default_factory=list)
    confidence_score: float | None = None
    problem_type: str | None = None
    final_answer: str | None = None
    extracted_equation: str | None = None
    variable: str | None = None
    numeric_answer: float | None = None
    steps: list[dict[str, Any]] = Field(default_factory=list)
    summary: str | None = None
    detailed_explanation: str | None = None
    scan_method: str | None = None
    source_type: str | None = None
    extracted_text: str | None = None
    page_count: int | None = None
    quiz: dict[str, Any] | None = None
    recommendations: list[dict[str, Any]] = Field(default_factory=list)
    message: str | None = None
    file_name: str | None = None
    file_type: str | None = None
    file_url: str | None = None
    scan: dict[str, Any] | None = None


class QuizAnswerRequest(CamelModel):
    selected_option: str
    quiz_session_id: str | None = None
    question_id: str | None = None
    response_seconds: float | None = None


class QuizGenerateRequest(CamelModel):
    analysis_id: int | None = None
    topic: str | None = None
    difficulty: str | None = None
    question_count: int = 10
    language: str = "en"
    adaptive: bool = True


class QuizItemOut(CamelModel):
    id: str
    type: str
    question: str
    options: list[str] = Field(default_factory=list)
    correct_option: str
    explanation: str | None = None
    topic: str | None = None
    difficulty: str | None = None


class AdaptiveQuizOut(CamelModel):
    quiz_id: str
    analysis_id: int | None = None
    subject_id: str
    topic: str
    difficulty: str
    title: str
    language: str
    question_count: int
    items: list[QuizItemOut] = Field(default_factory=list)
    mastery_snapshot: dict[str, Any] = Field(default_factory=dict)


class QuizGenerateResponse(CamelModel):
    quiz: AdaptiveQuizOut


class SessionUpdateRequest(CamelModel):
    language: str | None = None
    selected_subject_id: str | None = None
    active_screen: int | None = None


class SubscriptionUpdateRequest(CamelModel):
    plan_name: str


class ScreenUpdateRequest(CamelModel):
    active_screen: int


class SessionOut(CamelModel):
    logged_in: bool
    active_screen: int
    language: str
    selected_subject_id: str | None = None


class DashboardOut(CamelModel):
    app: AppInfo
    user: UserOut
    subjects: list[SubjectOut]
    action_cards: list[ActionCardOut]
    weekly_progress: list[dict[str, Any]]
    recommendations: list[RecommendationOut]
    selected_subject: SubjectOut | None = None
    study_plan: list[dict[str, Any]] = Field(default_factory=list)
    last_analysis: dict[str, Any] | None = None


class OnboardingOut(CamelModel):
    app: AppInfo
    features: list[OnboardingFeatureOut]
    cta: dict[str, str]


class ExplanationOut(CamelModel):
    question: str
    subject: dict[str, Any]
    final_answer: str
    steps: list[StepOut]
    analysis_id: int | None = None
    classification: dict[str, Any] | None = None
    structured_document_json: dict[str, Any] | None = None
    route_decision: dict[str, Any] | None = None
    context_pack: dict[str, Any] | None = None
    summary: str | None = None
    detailed_explanation: str | None = None
    scan_method: str | None = None
    source_type: str | None = None
    extracted_text: str | None = None
    page_count: int | None = None
    file_name: str | None = None
    file_type: str | None = None
    file_url: str | None = None
    scan: dict[str, Any] | None = None


class QuizStateOut(CamelModel):
    questions: list[QuizQuestionOut]
    current_index: int
    current_question: QuizQuestionOut | None = None
    selected_option: str | None = None
    status: str
    xp_earned_this_session: int
    toast_message: str | None = None
    progress_percent: float
    topic: str | None = None
    title: str | None = None
    subject_id: str | None = None


class ParentOut(CamelModel):
    app: AppInfo
    user: UserOut
    stats: list[ParentStatOut]
    performance_bars: list[dict[str, Any]]
    recommendations: list[RecommendationOut]
    insights: dict[str, Any]


class BootstrapOut(CamelModel):
    app: AppInfo
    session: SessionOut
    onboarding: OnboardingOut
    dashboard: DashboardOut
    explanation: ExplanationOut
    quiz: QuizStateOut
    parent: ParentOut


class SubscriptionOut(CamelModel):
    plan_name: str
    status: str
    renewal_date: datetime | None = None


class AnalyticsSummaryOut(CamelModel):
    total_analyses: int
    total_quiz_attempts: int
    total_quiz_correct: int
    xp_points: int
    streak: int
    homework_completed: int
    doubts_solved: int
    active_subject_id: str | None = None


class StudentAnalyticsOut(CamelModel):
    user_id: int
    accuracy: float
    quiz_accuracy: float
    mastery_by_subject: list[dict[str, Any]]
    weak_subjects: list[dict[str, Any]]
    recent_analyses: list[dict[str, Any]]
    doubt_count: int
    avg_response_seconds: float | None = None
    learning_velocity: float
    recommended_concepts: list[str] = Field(default_factory=list)
    revision_priorities: list[dict[str, Any]] = Field(default_factory=list)
    active_subject_id: str | None = None


class RecommendationRequest(CamelModel):
    analysis_id: int | None = None
    subject_id: str | None = None
    goal: str | None = None
    limit: int = 5

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base
from .constants import now_iso


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="Arjun")
    class_name: Mapped[str] = mapped_column(String(120), nullable=False, default="Class 8")
    avatar: Mapped[str] = mapped_column(String(20), nullable=False, default="🧑")
    streak: Mapped[int] = mapped_column(Integer, nullable=False, default=12)
    xp_points: Mapped[int] = mapped_column(Integer, nullable=False, default=840)
    level: Mapped[str] = mapped_column(String(30), nullable=False, default="Gold")
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    logged_in: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    active_screen: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    selected_subject_id: Mapped[str | None] = mapped_column(String(40), nullable=True, default="maths")
    homework_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    doubts_solved: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    quiz_correct: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quiz_answered: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quiz_current_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quiz_selected_option: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    quiz_status: Mapped[str] = mapped_column(String(20), nullable=False, default="idle")
    quiz_xp_earned_this_session: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    subscription_plan: Mapped[str] = mapped_column(String(40), nullable=False, default="Free")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    analyses: Mapped[list["HomeworkAnalysis"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    quiz_attempts: Mapped[list["QuizAttempt"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    emoji: Mapped[str] = mapped_column(String(20), nullable=False)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    color_variant: Mapped[str] = mapped_column(String(40), nullable=False, default="orange")
    color_hex: Mapped[str] = mapped_column(String(20), nullable=False, default="#FF6B35")
    focus_area: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    correct_option: Mapped[str] = mapped_column(String(255), nullable=False)
    wrong_option: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subject_id: Mapped[str] = mapped_column(String(40), nullable=False, default="maths")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

class HomeworkAnalysis(Base):
    __tablename__ = "homework_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user_profiles.id"), nullable=False, index=True)
    input_method: Mapped[str] = mapped_column(String(40), nullable=False, default="type")
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    subject_id: Mapped[str] = mapped_column(String(40), nullable=False, default="maths")
    detected_subject_id: Mapped[str] = mapped_column(String(40), nullable=False, default="maths")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    question_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    extracted_equation: Mapped[str | None] = mapped_column(Text, nullable=True)
    final_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    variable: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="needs_review")
    steps: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    quiz: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    recommendations: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    raw_payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    user: Mapped[UserProfile] = relationship(back_populates="analyses")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user_profiles.id"), nullable=False, index=True)
    question_id: Mapped[str] = mapped_column(String(40), nullable=False)
    selected_option: Mapped[str] = mapped_column(String(255), nullable=False)
    correct: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    xp_awarded: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    user: Mapped[UserProfile] = relationship(back_populates="quiz_attempts")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user_profiles.id"), unique=True, nullable=False, index=True)
    plan_name: Mapped[str] = mapped_column(String(40), nullable=False, default="Free")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="active")
    renewal_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user_profiles.id"), nullable=False, index=True)
    analysis_id: Mapped[int | None] = mapped_column(ForeignKey("homework_analyses.id"), nullable=True, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    chunk_type: Mapped[str] = mapped_column(String(40), nullable=False, default="ocr")
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    embedding: Mapped[list[float]] = mapped_column(JSON, nullable=False, default=list)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, nullable=False, default=dict)
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    user: Mapped[UserProfile] = relationship(backref="document_chunks")
    analysis: Mapped[HomeworkAnalysis | None] = relationship(backref="document_chunks")


class DoubtThread(Base):
    __tablename__ = "doubt_threads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user_profiles.id"), nullable=False, index=True)
    analysis_id: Mapped[int | None] = mapped_column(ForeignKey("homework_analyses.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="Homework doubt")
    language: Mapped[str] = mapped_column(String(20), nullable=False, default="en")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_question: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped[UserProfile] = relationship(backref="doubt_threads")
    analysis: Mapped[HomeworkAnalysis | None] = relationship(backref="doubt_threads")
    messages: Mapped[list["DoubtMessage"]] = relationship(back_populates="thread", cascade="all, delete-orphan")


class DoubtMessage(Base):
    __tablename__ = "doubt_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey("doubt_threads.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user_profiles.id"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    citations: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, nullable=False, default=dict)
    response_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    thread: Mapped[DoubtThread] = relationship(back_populates="messages")
    user: Mapped[UserProfile] = relationship(backref="doubt_messages")


class AdaptiveQuizSession(Base):
    __tablename__ = "adaptive_quiz_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[int] = mapped_column(ForeignKey("user_profiles.id"), nullable=False, index=True)
    analysis_id: Mapped[int | None] = mapped_column(ForeignKey("homework_analyses.id"), nullable=True, index=True)
    subject_id: Mapped[str] = mapped_column(String(40), nullable=False, default="maths")
    topic: Mapped[str] = mapped_column(String(255), nullable=False, default="general")
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="Adaptive quiz")
    language: Mapped[str] = mapped_column(String(20), nullable=False, default="en")
    question_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    quiz_payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    mastery_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped[UserProfile] = relationship(backref="adaptive_quiz_sessions")
    analysis: Mapped[HomeworkAnalysis | None] = relationship(backref="adaptive_quiz_sessions")
    attempts: Mapped[list["AdaptiveQuizAttempt"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class AdaptiveQuizAttempt(Base):
    __tablename__ = "adaptive_quiz_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("adaptive_quiz_sessions.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user_profiles.id"), nullable=False, index=True)
    item_id: Mapped[str] = mapped_column(String(80), nullable=False)
    selected_option: Mapped[str] = mapped_column(String(255), nullable=False)
    correct: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    xp_awarded: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    response_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    session: Mapped[AdaptiveQuizSession] = relationship(back_populates="attempts")
    user: Mapped[UserProfile] = relationship(backref="adaptive_quiz_attempts")


def touch_timestamp() -> str:
    return now_iso()

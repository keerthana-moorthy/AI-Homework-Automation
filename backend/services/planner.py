from __future__ import annotations

from typing import Any
from datetime import datetime
from sqlalchemy import desc, select
from sqlalchemy.orm import Session
from ..models import StudyPlan
from ..constants import SUBJECTS


# Possible return values:
#   "completed"   – all tasks done
#   "in_progress" – today's day, some tasks done
#   "not_started" – today's day, no tasks done
#   "partial"     – past day, some (not all) tasks done
#   "missed"      – past day, zero tasks done
#   "upcoming"    – future day
def compute_day_status(day: dict[str, Any], today_str: str) -> str:
    day_date = day.get("date", "")
    tasks: list[dict] = day.get("tasks", [])
    total = len(tasks)
    if total == 0:
        return "upcoming" if day_date > today_str else "not_started"

    completed_count = sum(1 for t in tasks if t.get("completed", False))

    if completed_count == total:
        return "completed"

    if day_date > today_str:
        return "upcoming"

    if day_date == today_str:
        return "in_progress" if completed_count > 0 else "not_started"

    # Past day
    return "partial" if completed_count > 0 else "missed"


def build_daily_plan(db: Session, user: Any, selected_subject_id: str | None, last_analysis: dict[str, Any] | None) -> list[dict[str, Any]]:
    # Query the latest StudyPlan for the user
    latest_plan = db.scalar(
        select(StudyPlan)
        .where(StudyPlan.user_id == user.id)
        .order_by(desc(StudyPlan.created_at), desc(StudyPlan.id))
    )
    
    if not latest_plan or not latest_plan.plan_data:
        return []
        
    # Determine active day:
    # 1. Look for today's date in plan_data
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    
    active_day = None
    for day in latest_plan.plan_data:
        if day.get("date") == today_str:
            active_day = day
            break
            
    # 2. If not found, look for the first day with uncompleted tasks
    if not active_day:
        for day in latest_plan.plan_data:
            if any(not task.get("completed", False) for task in day.get("tasks", [])):
                active_day = day
                break
                
    # 3. If still not found (all completed), default to the last day
    if not active_day and latest_plan.plan_data:
        active_day = latest_plan.plan_data[-1]
        
    if not active_day:
        return []
        
    # Map tasks of active_day to daily plan items format
    plan_items = []
    day_num = active_day.get("dayNum", 1)
    topic_title = active_day.get("topic", "Study Session")
    difficulty = active_day.get("difficulty", "medium").lower()
    
    # Map difficulty to priority
    priority = "medium"
    if difficulty == "hard":
        priority = "high"
    elif difficulty == "easy":
        priority = "low"
        
    for idx, task in enumerate(active_day.get("tasks", [])):
        title = task.get("title", "Study Task")
        completed = task.get("completed", False)
        
        plan_items.append({
            "id": f"day_{day_num}_task_{idx}",
            "title": title,
            "description": f"Day {day_num}: {topic_title}",
            "progress": 100 if completed else 0,
            "priority": priority,
        })
        
    return plan_items


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


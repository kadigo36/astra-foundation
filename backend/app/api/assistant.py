import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.agents.gemini import GeminiNotConfigured, GeminiRequestFailed, generate_plan
from app.api.dependencies import current_user, require_space_member
from app.core.config import settings
from app.db.models import AuditEvent, MemoryEntry, User
from app.db.session import get_db

router = APIRouter(prefix="/assistant", tags=["assistant"])


class PlanRequest(BaseModel):
    message: str = Field(min_length=1, max_length=6000)
    space_id: int | None = None


def select_authorized_memory(db: Session, user: User, message: str, space_id: int | None):
    query = db.query(MemoryEntry).filter(
        MemoryEntry.user_id == user.id,
        MemoryEntry.status == "confirmed",
    )
    if space_id is None:
        query = query.filter(MemoryEntry.scope == "central")
    else:
        query = query.filter(
            ((MemoryEntry.scope == "central") & (MemoryEntry.space_id.is_(None)))
            | ((MemoryEntry.scope == "space") & (MemoryEntry.space_id == space_id))
        )

    words = set(re.findall(r"[a-zA-ZÀ-ÿ0-9]{3,}", message.lower()))
    candidates = query.order_by(MemoryEntry.updated_at.desc()).limit(100).all()

    def score(entry):
        haystack = f"{entry.title} {entry.category} {entry.content}".lower()
        return sum(1 for word in words if word in haystack)

    ranked = sorted(candidates, key=lambda entry: (score(entry), entry.updated_at), reverse=True)
    selected = [entry for entry in ranked if score(entry) > 0][:8]
    return [
        {
            "scope": entry.scope,
            "category": entry.category,
            "title": entry.title,
            "content": entry.content[:700],
        }
        for entry in selected
    ]


@router.post("/plan")
def create_plan(
    payload: PlanRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if payload.space_id is not None:
        require_space_member(payload.space_id, user, db)

    memory_context = (
        select_authorized_memory(db, user, payload.message, payload.space_id)
        if settings.gemini_share_memory
        else []
    )
    try:
        plan = generate_plan(payload.message, memory_context)
    except GeminiNotConfigured:
        raise HTTPException(status_code=503, detail="Gemini is not configured on the server")
    except GeminiRequestFailed:
        db.add(AuditEvent(
            actor_user_id=user.id,
            space_id=payload.space_id,
            event_type="assistant.plan",
            outcome="provider_error",
            details="Gemini request failed",
        ))
        db.commit()
        raise HTTPException(status_code=502, detail="The assistant provider is temporarily unavailable")

    db.add(AuditEvent(
        actor_user_id=user.id,
        space_id=payload.space_id,
        event_type="assistant.plan",
        outcome="success",
        details=f"specialists={len(plan.specialists)}; memory_items={len(memory_context)}",
    ))
    db.commit()

    return {
        "plan": plan.model_dump(),
        "memory_items_used": len(memory_context),
        "execution": "not_performed",
    }

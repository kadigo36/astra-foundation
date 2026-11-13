from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import current_user
from app.db.models import AuditEvent, User
from app.db.session import get_db

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/events")
def list_own_events(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(AuditEvent)
        .filter(AuditEvent.actor_user_id == user.id)
        .order_by(AuditEvent.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": event.id,
            "space_id": event.space_id,
            "event_type": event.event_type,
            "outcome": event.outcome,
            "details": event.details,
            "created_at": event.created_at,
        }
        for event in rows
    ]

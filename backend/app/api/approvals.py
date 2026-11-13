from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies import current_user, require_space_member
from app.db.models import Approval, AuditEvent, User
from app.db.session import get_db

router = APIRouter(prefix="/approvals", tags=["approvals"])


class ApprovalInput(BaseModel):
    space_id: int
    action_type: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=5, max_length=500)


@router.post("", status_code=201)
def request_approval(payload: ApprovalInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_space_member(payload.space_id, user, db)
    approval = Approval(
        user_id=user.id, space_id=payload.space_id,
        action_type=payload.action_type, description=payload.description,
        status="pending",
    )
    db.add(approval)
    db.flush()
    db.add(AuditEvent(actor_user_id=user.id, space_id=payload.space_id,
                      event_type="approval.requested", outcome="pending",
                      details=f"approval_id={approval.id}; action_type={payload.action_type}"))
    db.commit()
    return {"id": approval.id, "status": approval.status}


@router.get("")
def list_approvals(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Approval).filter_by(user_id=user.id).order_by(Approval.created_at.desc()).all()
    return [{"id": x.id, "space_id": x.space_id, "action_type": x.action_type,
             "description": x.description, "status": x.status, "created_at": x.created_at}
            for x in rows]


@router.post("/{approval_id}/decision")
def decide_approval(approval_id: int, decision: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if decision not in {"approved", "rejected"}:
        raise HTTPException(status_code=422, detail="Decision must be approved or rejected")
    approval = db.query(Approval).filter_by(id=approval_id, user_id=user.id).with_for_update().first()
    if approval is None:
        raise HTTPException(status_code=404, detail="Approval not found")
    if approval.status != "pending":
        raise HTTPException(status_code=409, detail="Approval has already been decided")
    approval.status = decision
    approval.decided_at = datetime.now(timezone.utc)
    db.add(AuditEvent(actor_user_id=user.id, space_id=approval.space_id,
                      event_type="approval.decided", outcome=decision,
                      details=f"approval_id={approval.id}"))
    db.commit()
    # A decision records consent only; this endpoint deliberately executes no external action.
    return {"id": approval.id, "status": approval.status, "executed": False}

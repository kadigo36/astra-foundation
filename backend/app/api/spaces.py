from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies import current_user, require_space_member
from app.db.models import AuditEvent, Space, SpaceMember, User
from app.db.session import get_db

router = APIRouter(prefix="/spaces", tags=["spaces"])


class SpaceInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)


@router.post("", status_code=201)
def create_space(payload: SpaceInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    space = Space(name=payload.name.strip(), owner_id=user.id)
    db.add(space)
    db.flush()
    db.add(SpaceMember(user_id=user.id, space_id=space.id, role="owner"))
    db.add(AuditEvent(actor_user_id=user.id, space_id=space.id, event_type="space.create", outcome="success"))
    db.commit()
    return {"id": space.id, "name": space.name, "role": "owner"}


@router.get("")
def list_spaces(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Space, SpaceMember.role).join(SpaceMember).filter(SpaceMember.user_id == user.id).all()
    return [{"id": space.id, "name": space.name, "role": role} for space, role in rows]


@router.get("/{space_id}")
def get_space(space_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_space_member(space_id, user, db)
    space = db.get(Space, space_id)
    return {"id": space.id, "name": space.name}

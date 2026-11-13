from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.api.dependencies import current_user, require_space_member
from app.db.models import AuditEvent, MemoryEntry, MemoryRevision, User
from app.db.session import get_db
from app.memory.markdown import render_memory_markdown

router = APIRouter(prefix="/memory", tags=["memory"])
ALLOWED_SCOPES = {"central", "space"}
ALLOWED_CATEGORIES = {"project", "preference", "decision", "goal", "task", "note"}


class MemoryInput(BaseModel):
    scope: str = "central"
    space_id: int | None = None
    category: str = "note"
    title: str = Field(min_length=1, max_length=160)
    content: str = Field(min_length=1, max_length=12000)
    status: str = "confirmed"

    @model_validator(mode="after")
    def validate_scope(self):
        if self.scope not in ALLOWED_SCOPES:
            raise ValueError("scope must be central or space")
        if self.scope == "central" and self.space_id is not None:
            raise ValueError("central memory cannot reference a space")
        if self.scope == "space" and self.space_id is None:
            raise ValueError("space memory requires space_id")
        if self.category not in ALLOWED_CATEGORIES:
            raise ValueError("unsupported memory category")
        if self.status not in {"confirmed", "proposed"}:
            raise ValueError("status must be confirmed or proposed")
        return self


def visible_entry(db: Session, user: User, memory_id: int) -> MemoryEntry:
    entry = db.query(MemoryEntry).filter_by(id=memory_id, user_id=user.id).first()
    if entry is None:
        raise HTTPException(status_code=404, detail="Memory entry not found")
    if entry.scope == "space":
        require_space_member(entry.space_id, user, db)
    return entry


def snapshot(db: Session, entry: MemoryEntry, user: User, revision_type: str):
    db.add(MemoryRevision(
        memory_id=entry.id, user_id=user.id, revision_type=revision_type,
        snapshot_title=entry.title, snapshot_content=entry.content,
        snapshot_status=entry.status,
    ))


def serialize(entry: MemoryEntry):
    return {
        "id": entry.id, "scope": entry.scope, "space_id": entry.space_id,
        "category": entry.category, "title": entry.title, "content": entry.content,
        "source": entry.source, "status": entry.status,
        "created_at": entry.created_at, "updated_at": entry.updated_at,
    }


@router.post("", status_code=201)
def create_memory(payload: MemoryInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if payload.scope == "space":
        require_space_member(payload.space_id, user, db)
    entry = MemoryEntry(
        user_id=user.id, scope=payload.scope, space_id=payload.space_id,
        category=payload.category, title=payload.title.strip(),
        content=payload.content.strip(), status=payload.status, source="user",
    )
    db.add(entry)
    db.flush()
    snapshot(db, entry, user, "created")
    db.add(AuditEvent(
        actor_user_id=user.id, space_id=entry.space_id,
        event_type="memory.created", outcome="success",
        details=f"memory_id={entry.id}; scope={entry.scope}",
    ))
    db.commit()
    db.refresh(entry)
    return serialize(entry)


@router.get("")
def list_memory(
    scope: str | None = Query(default=None),
    space_id: int | None = Query(default=None),
    category: str | None = Query(default=None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if scope is not None and scope not in ALLOWED_SCOPES:
        raise HTTPException(status_code=422, detail="Invalid memory scope")
    query = db.query(MemoryEntry).filter(MemoryEntry.user_id == user.id)
    if scope:
        query = query.filter(MemoryEntry.scope == scope)
    if space_id is not None:
        require_space_member(space_id, user, db)
        query = query.filter(MemoryEntry.space_id == space_id, MemoryEntry.scope == "space")
    if category:
        query = query.filter(MemoryEntry.category == category)
    return [serialize(entry) for entry in query.order_by(MemoryEntry.updated_at.desc()).limit(200).all()]


@router.get("/{memory_id}")
def get_memory(memory_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return serialize(visible_entry(db, user, memory_id))


@router.patch("/{memory_id}")
def update_memory(memory_id: int, payload: MemoryInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    entry = visible_entry(db, user, memory_id)
    if payload.scope == "space":
        require_space_member(payload.space_id, user, db)
    snapshot(db, entry, user, "before_update")
    entry.scope = payload.scope
    entry.space_id = payload.space_id
    entry.category = payload.category
    entry.title = payload.title.strip()
    entry.content = payload.content.strip()
    entry.status = payload.status
    db.add(AuditEvent(
        actor_user_id=user.id, space_id=entry.space_id,
        event_type="memory.updated", outcome="success",
        details=f"memory_id={entry.id}",
    ))
    db.commit()
    db.refresh(entry)
    return serialize(entry)


@router.delete("/{memory_id}", status_code=204)
def delete_memory(memory_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    entry = visible_entry(db, user, memory_id)
    # Deletion removes the entry and its revision snapshots; the audit event remains.
    db.query(MemoryRevision).filter_by(memory_id=entry.id, user_id=user.id).delete()
    db.add(AuditEvent(
        actor_user_id=user.id, space_id=entry.space_id,
        event_type="memory.deleted", outcome="success",
        details=f"memory_id={entry.id}",
    ))
    db.delete(entry)
    db.commit()


@router.get("/{memory_id}/export.md")
def export_markdown(memory_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    entry = visible_entry(db, user, memory_id)
    return Response(
        content=render_memory_markdown(entry),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="astra-memory-{entry.id}.md"'},
    )


@router.get("/{memory_id}/revisions")
def list_revisions(memory_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    # Require current ownership and scope membership before exposing history.
    visible_entry(db, user, memory_id)
    rows = (
        db.query(MemoryRevision)
        .filter_by(memory_id=memory_id, user_id=user.id)
        .order_by(MemoryRevision.created_at.desc())
        .limit(100)
        .all()
    )
    return [{
        "id": row.id, "revision_type": row.revision_type,
        "title": row.snapshot_title, "content": row.snapshot_content,
        "status": row.snapshot_status, "created_at": row.created_at,
    } for row in rows]

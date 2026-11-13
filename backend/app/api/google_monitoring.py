from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependencies import current_user
from app.api.google_integrations import (
    PROVIDER_REQUIRED_SCOPES,
    _classroom_preview,
    _drive_preview,
    _get_valid_access_token,
    _gmail_preview,
)
from app.db.models import (
    AuditEvent,
    GoogleCredential,
    GoogleDetectedEvent,
    GoogleSyncState,
    User,
)
from app.db.session import get_db
from app.integrations.google_oauth import GoogleOAuthExchangeError

router = APIRouter(prefix="/integrations/google", tags=["google monitoring"])
SUPPORTED_PROVIDERS = ("classroom", "gmail", "drive")


def _event_data(provider: str, item: dict) -> tuple[str, str, str, str | None, dict]:
    """Return a stable ID and safe, metadata-only event representation."""
    if provider == "classroom":
        external_id = f"{item.get('course_id', '')}:{item.get('id', '')}"
        title = item.get("title") or "Novo trabalho na Classroom"
        course = item.get("course_name") or "Curso"
        due = item.get("due_date")
        summary = f"{course}" + (f" · prazo: {due}" if due else "")
        return external_id, "classroom.coursework.created", title, item.get("url"), {
            "course_id": item.get("course_id"),
            "course_name": course,
            "due_date": due,
            "due_time": item.get("due_time"),
            "created_at": item.get("created_at"),
            "updated_at": item.get("updated_at"),
            "state": item.get("state"),
        }
    if provider == "gmail":
        external_id = str(item.get("id") or "")
        title = item.get("subject") or "Email importante sem assunto"
        sender = item.get("from") or "Remetente desconhecido"
        summary = f"De: {sender}"
        return external_id, "gmail.important_message", title, None, {
            "thread_id": item.get("thread_id"),
            "from": sender,
            "date": item.get("date"),
            "internal_date": item.get("internal_date"),
            "labels": item.get("labels", []),
        }
    external_id = str(item.get("id") or "")
    title = item.get("name") or "Novo ficheiro no Drive"
    mime_type = item.get("mimeType") or "Tipo desconhecido"
    return external_id, "drive.file.created", title, item.get("webViewLink"), {
        "mime_type": mime_type,
        "created_time": item.get("createdTime"),
        "modified_time": item.get("modifiedTime"),
    }


def _fetch_provider_items(provider: str, access_token: str) -> list[dict]:
    if provider == "classroom":
        return _classroom_preview(access_token)
    if provider == "gmail":
        return _gmail_preview(access_token)
    return _drive_preview(access_token)


def _sync_provider(db: Session, user: User, provider: str) -> dict:
    credential = db.query(GoogleCredential).filter_by(user_id=user.id).first()
    if credential is None:
        return {"provider": provider, "status": "not_connected", "new_events": 0}

    missing = PROVIDER_REQUIRED_SCOPES[provider] - set(credential.scopes or [])
    if missing:
        return {"provider": provider, "status": "missing_scopes", "new_events": 0}

    state = db.query(GoogleSyncState).filter_by(
        user_id=user.id, provider=provider
    ).first()
    if state is None:
        state = GoogleSyncState(user_id=user.id, provider=provider)
        db.add(state)
        db.flush()

    try:
        access_token = _get_valid_access_token(db, credential)
        items = _fetch_provider_items(provider, access_token)
    except (GoogleOAuthExchangeError, HTTPException) as exc:
        state.last_checked_at = datetime.now(timezone.utc)
        state.last_error = "provider_unavailable"
        db.add(AuditEvent(
            actor_user_id=user.id,
            event_type="google.sync",
            outcome="provider_error",
            details=f"provider={provider}; error={type(exc).__name__}",
        ))
        db.commit()
        return {"provider": provider, "status": "error", "new_events": 0}

    now = datetime.now(timezone.utc)
    new_count = 0
    baseline = not state.baseline_completed
    for item in items:
        external_id, event_type, title, resource_url, payload = _event_data(provider, item)
        if not external_id:
            continue
        existing = db.query(GoogleDetectedEvent.id).filter_by(
            user_id=user.id, provider=provider, external_id=external_id
        ).first()
        if existing:
            continue
        if not baseline:
            db.add(GoogleDetectedEvent(
                user_id=user.id,
                provider=provider,
                event_type=event_type,
                external_id=external_id,
                title=title[:300],
                summary=summary_for(provider, item),
                resource_url=resource_url,
                payload=payload,
                status="new",
            ))
            new_count += 1

    state.baseline_completed = True
    state.last_checked_at = now
    state.last_success_at = now
    state.last_error = None
    db.add(AuditEvent(
        actor_user_id=user.id,
        event_type="google.sync",
        outcome="success",
        details=f"provider={provider}; scanned={len(items)}; new={new_count}; baseline={str(baseline).lower()}",
    ))
    db.commit()
    return {
        "provider": provider,
        "status": "baseline_created" if baseline else "success",
        "scanned": len(items),
        "new_events": new_count,
        "checked_at": now.isoformat(),
    }


def summary_for(provider: str, item: dict) -> str:
    if provider == "classroom":
        due = item.get("due_date")
        return (item.get("course_name") or "Curso") + (f" · prazo: {due}" if due else "")
    if provider == "gmail":
        return f"De: {item.get('from') or 'Remetente desconhecido'}"
    return item.get("mimeType") or "Ficheiro"


@router.post("/sync")
def sync_google_integrations(
    provider: str | None = Query(default=None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Run a read-only sync. First run establishes a baseline; later runs detect new IDs."""
    providers = (provider,) if provider else SUPPORTED_PROVIDERS
    if any(item not in SUPPORTED_PROVIDERS for item in providers):
        raise HTTPException(status_code=404, detail="Unknown Google integration")
    results = [_sync_provider(db, user, item) for item in providers]
    return {
        "results": results,
        "new_events": sum(result.get("new_events", 0) for result in results),
        "execution": "read_only",
        "notifications_sent": False,
    }


@router.get("/events")
def list_google_events(
    status: str | None = Query(default=None, pattern="^(new|seen|archived)$"),
    limit: int = Query(default=50, ge=1, le=100),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    query = db.query(GoogleDetectedEvent).filter_by(user_id=user.id)
    if status:
        query = query.filter_by(status=status)
    events = query.order_by(GoogleDetectedEvent.created_at.desc()).limit(limit).all()
    return {
        "items": [{
            "id": event.id,
            "provider": event.provider,
            "event_type": event.event_type,
            "title": event.title,
            "summary": event.summary,
            "resource_url": event.resource_url,
            "payload": event.payload,
            "status": event.status,
            "created_at": event.created_at.isoformat(),
        } for event in events],
        "count": len(events),
    }

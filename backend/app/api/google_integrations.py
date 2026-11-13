import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.api.dependencies import current_user
from app.core.config import settings
from app.db.models import AuditEvent, GoogleCredential, GoogleOAuthState, User
from app.db.session import get_db
from app.integrations.google_oauth import (
    GoogleOAuthConfigurationError,
    GoogleOAuthExchangeError,
    PROVIDER_SCOPES,
    build_authorization_url,
    decrypt_secret,
    encrypt_secret,
    exchange_authorization_code,
    serialize_token_bundle,
)

router = APIRouter(prefix="/integrations/google", tags=["google integrations"])
STATE_TTL_MINUTES = 10


def _state_digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _frontend_result(result: str) -> RedirectResponse:
    base = settings.frontend_url.rstrip("/")
    return RedirectResponse(f"{base}/?google={result}", status_code=303)


@router.post("/connect/{provider}")
def connect_google(
    provider: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if provider not in PROVIDER_SCOPES:
        raise HTTPException(status_code=404, detail="Unknown Google integration")
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    try:
        authorization_url = build_authorization_url(provider, state, verifier)
        verifier_encrypted = encrypt_secret(verifier)
    except GoogleOAuthConfigurationError:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured on the server")

    db.add(GoogleOAuthState(
        user_id=user.id,
        state_hash=_state_digest(state),
        provider=provider,
        scopes=list(PROVIDER_SCOPES[provider]),
        code_verifier_encrypted=verifier_encrypted,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=STATE_TTL_MINUTES),
    ))
    db.add(AuditEvent(
        actor_user_id=user.id,
        event_type="google.oauth.start",
        outcome="success",
        details=f"provider={provider}",
    ))
    db.commit()
    return {"authorization_url": authorization_url, "provider": provider}


@router.get("/callback")
def google_callback(
    state: str = Query(min_length=20, max_length=256),
    code: str | None = Query(default=None, min_length=1, max_length=4096),
    error: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
):
    oauth_state = db.query(GoogleOAuthState).filter_by(state_hash=_state_digest(state)).first()
    now = datetime.now(timezone.utc)
    if oauth_state is None or oauth_state.consumed_at is not None:
        raise HTTPException(status_code=400, detail="Invalid or already used Google OAuth state")

    expires_at = oauth_state.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= now:
        oauth_state.consumed_at = now
        db.commit()
        raise HTTPException(status_code=400, detail="Google OAuth state expired")

    consume_result = db.execute(
        update(GoogleOAuthState)
        .where(
            GoogleOAuthState.id == oauth_state.id,
            GoogleOAuthState.consumed_at.is_(None),
        )
        .values(consumed_at=now)
    )
    if consume_result.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=400, detail="Invalid or already used Google OAuth state")
    user_id = oauth_state.user_id
    provider = oauth_state.provider
    verifier_encrypted = oauth_state.code_verifier_encrypted
    db.commit()

    if error:
        db.add(AuditEvent(
            actor_user_id=user_id,
            event_type="google.oauth.callback",
            outcome="denied",
            details=f"provider={provider}",
        ))
        db.commit()
        return _frontend_result("denied")
    if not code:
        raise HTTPException(status_code=400, detail="Google authorization code is missing")

    try:
        verifier = decrypt_secret(verifier_encrypted)
        token_data = exchange_authorization_code(code, verifier)
        credential = db.query(GoogleCredential).filter_by(user_id=user_id).first()
        encrypted_tokens, scopes = serialize_token_bundle(
            token_data,
            credential.encrypted_tokens if credential else None,
        )
    except GoogleOAuthConfigurationError:
        raise HTTPException(status_code=503, detail="Google token encryption is not configured correctly")
    except GoogleOAuthExchangeError:
        db.add(AuditEvent(
            actor_user_id=user_id,
            event_type="google.oauth.callback",
            outcome="provider_error",
            details=f"provider={provider}",
        ))
        db.commit()
        raise HTTPException(status_code=502, detail="Google authorization could not be completed")

    if credential is None:
        credential = GoogleCredential(user_id=user_id, encrypted_tokens=encrypted_tokens, scopes=scopes)
        db.add(credential)
    else:
        credential.encrypted_tokens = encrypted_tokens
        credential.scopes = scopes

    db.add(AuditEvent(
        actor_user_id=user_id,
        event_type="google.oauth.callback",
        outcome="connected",
        details=f"provider={provider}; scopes={len(scopes)}",
    ))
    db.commit()
    return _frontend_result("connected")


@router.get("/status")
def google_status(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    credential = db.query(GoogleCredential).filter_by(user_id=user.id).first()
    if credential is None:
        return {"connected": False, "scopes": []}
    return {"connected": True, "scopes": credential.scopes}


@router.post("/disconnect")
def disconnect_google(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    credential = db.query(GoogleCredential).filter_by(user_id=user.id).first()
    if credential is None:
        return {"disconnected": True}
    db.delete(credential)
    db.add(AuditEvent(
        actor_user_id=user.id,
        event_type="google.oauth.disconnect",
        outcome="success",
        details="Local credential deleted; provider token revocation is not yet implemented",
    ))
    db.commit()
    return {"disconnected": True, "provider_revocation": "not_performed"}

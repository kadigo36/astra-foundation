from urllib.parse import parse_qs, urlparse

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.models import GoogleCredential, GoogleOAuthState, User
from app.db.session import Base, SessionLocal, engine
from app.main import app


@pytest.fixture()
def client(monkeypatch):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "test-client-secret")
    monkeypatch.setattr(
        settings,
        "google_redirect_uri",
        "http://localhost:8000/api/integrations/google/callback",
    )
    monkeypatch.setattr(
        settings,
        "google_token_encryption_key",
        Fernet.generate_key().decode(),
    )
    monkeypatch.setattr(settings, "frontend_url", "http://localhost:5173")
    with TestClient(app) as test_client:
        yield test_client
    Base.metadata.drop_all(bind=engine)


def register(client, email="google-user@example.com"):
    response = client.post("/api/auth/register", json={
        "email": email,
        "password": "correct-horse-battery",
    })
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_google_connect_requires_authentication(client):
    response = client.post("/api/integrations/google/connect/classroom")
    assert response.status_code == 401


def test_google_connect_builds_pkce_url_and_persists_hashed_state(client):
    headers = register(client)
    response = client.post(
        "/api/integrations/google/connect/classroom",
        headers=headers,
    )
    assert response.status_code == 200
    authorization_url = response.json()["authorization_url"]
    params = parse_qs(urlparse(authorization_url).query)
    assert params["code_challenge_method"] == ["S256"]
    assert params["access_type"] == ["offline"]
    assert "classroom.courses.readonly" in params["scope"][0]
    assert "classroom.coursework.me.readonly" in params["scope"][0]
    assert params["state"][0]

    db = SessionLocal()
    try:
        saved_state = db.query(GoogleOAuthState).one()
        assert saved_state.state_hash != params["state"][0]
        assert saved_state.provider == "classroom"
        assert saved_state.consumed_at is None
    finally:
        db.close()


def test_google_connect_rejects_unknown_provider(client):
    headers = register(client)
    response = client.post(
        "/api/integrations/google/connect/calendar",
        headers=headers,
    )
    assert response.status_code == 404


def test_google_connect_fails_closed_without_encryption_key(client, monkeypatch):
    headers = register(client)
    monkeypatch.setattr(settings, "google_token_encryption_key", None)
    response = client.post(
        "/api/integrations/google/connect/gmail",
        headers=headers,
    )
    assert response.status_code == 503


def test_google_callback_rejects_unknown_state(client):
    response = client.get(
        "/api/integrations/google/callback",
        params={"state": "x" * 32, "code": "one-time-code"},
    )
    assert response.status_code == 400


def test_google_callback_encrypts_tokens_and_preserves_refresh_token(client, monkeypatch):
    headers = register(client)
    start = client.post(
        "/api/integrations/google/connect/drive",
        headers=headers,
    )
    state = parse_qs(urlparse(start.json()["authorization_url"]).query)["state"][0]

    monkeypatch.setattr(
        "app.api.google_integrations.exchange_authorization_code",
        lambda code, verifier: {
            "access_token": "plain-access-token",
            "refresh_token": "plain-refresh-token",
            "scope": "https://www.googleapis.com/auth/drive.metadata.readonly",
            "expires_in": 3600,
            "token_type": "Bearer",
        },
    )
    callback = client.get(
        "/api/integrations/google/callback",
        params={"state": state, "code": "one-time-code"},
        follow_redirects=False,
    )
    assert callback.status_code == 303
    assert callback.headers["location"] == "http://localhost:5173/?google=connected"

    status = client.get("/api/integrations/google/status", headers=headers)
    assert status.status_code == 200
    assert status.json()["connected"] is True
    assert "https://www.googleapis.com/auth/drive.metadata.readonly" in status.json()["scopes"]

    db = SessionLocal()
    try:
        credential = db.query(GoogleCredential).one()
        assert "plain-access-token" not in credential.encrypted_tokens
        assert "plain-refresh-token" not in credential.encrypted_tokens
        oauth_state = db.query(GoogleOAuthState).one()
        assert oauth_state.consumed_at is not None
    finally:
        db.close()

    replay = client.get(
        "/api/integrations/google/callback",
        params={"state": state, "code": "one-time-code"},
    )
    assert replay.status_code == 400


def test_google_callback_denial_consumes_state_without_credentials(client):
    headers = register(client)
    start = client.post(
        "/api/integrations/google/connect/gmail",
        headers=headers,
    )
    state = parse_qs(urlparse(start.json()["authorization_url"]).query)["state"][0]
    callback = client.get(
        "/api/integrations/google/callback",
        params={"state": state, "error": "access_denied"},
        follow_redirects=False,
    )
    assert callback.status_code == 303
    assert callback.headers["location"] == "http://localhost:5173/?google=denied"
    status = client.get("/api/integrations/google/status", headers=headers)
    assert status.json() == {"connected": False, "scopes": []}


def test_google_disconnect_only_deletes_local_credential(client, monkeypatch):
    headers = register(client)
    start = client.post(
        "/api/integrations/google/connect/classroom",
        headers=headers,
    )
    state = parse_qs(urlparse(start.json()["authorization_url"]).query)["state"][0]
    monkeypatch.setattr(
        "app.api.google_integrations.exchange_authorization_code",
        lambda code, verifier: {
            "access_token": "access",
            "refresh_token": "refresh",
            "scope": "https://www.googleapis.com/auth/classroom.courses.readonly",
        },
    )
    client.get(
        "/api/integrations/google/callback",
        params={"state": state, "code": "code"},
        follow_redirects=False,
    )
    response = client.post("/api/integrations/google/disconnect", headers=headers)
    assert response.status_code == 200
    assert response.json()["provider_revocation"] == "not_performed"
    assert client.get("/api/integrations/google/status", headers=headers).json() == {
        "connected": False,
        "scopes": [],
    }



def add_google_credential(headers, scopes, token_bundle=None):
    from app.integrations.google_oauth import encrypt_secret
    import json

    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email="google-user@example.com").one()
        bundle = token_bundle or {
            "access_token": "valid-access-token",
            "refresh_token": "valid-refresh-token",
            "expires_at": "2999-01-01T00:00:00+00:00",
            "scopes": scopes,
        }
        db.add(GoogleCredential(
            user_id=user.id,
            encrypted_tokens=encrypt_secret(json.dumps(bundle)),
            scopes=scopes,
        ))
        db.commit()
    finally:
        db.close()


def test_gmail_preview_uses_metadata_only_and_important_label(client, monkeypatch):
    headers = register(client)
    scope = "https://www.googleapis.com/auth/gmail.metadata"
    add_google_credential(headers, [scope])
    calls = []

    def fake_google_get(url, access_token, params=None):
        calls.append((url, params or {}))
        if url.endswith("/messages"):
            return {"messages": [{"id": "message-1", "threadId": "thread-1"}]}
        return {
            "id": "message-1",
            "threadId": "thread-1",
            "internalDate": "1790000000000",
            "labelIds": ["IMPORTANT", "INBOX"],
            "payload": {"headers": [
                {"name": "From", "value": "teacher@example.com"},
                {"name": "Subject", "value": "Trabalho de projeto"},
                {"name": "Date", "value": "Fri, 13 Nov 2026 10:00:00 +0000"},
            ]},
        }

    monkeypatch.setattr("app.api.google_integrations.google_api_get", fake_google_get)
    response = client.get("/api/integrations/google/preview/gmail", headers=headers)
    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert response.json()["items"][0]["subject"] == "Trabalho de projeto"
    assert "body" not in response.json()["items"][0]
    assert calls[0][1] == {"labelIds": ["IMPORTANT"], "maxResults": 20}
    assert calls[1][1]["format"] == "metadata"


def test_drive_preview_returns_metadata_without_downloading_content(client, monkeypatch):
    headers = register(client)
    scope = "https://www.googleapis.com/auth/drive.metadata.readonly"
    add_google_credential(headers, [scope])
    captured = {}

    def fake_google_get(url, access_token, params=None):
        captured["url"] = url
        captured["params"] = params
        return {"files": [{
            "id": "file-1",
            "name": "Relatorio TIC",
            "mimeType": "application/pdf",
            "createdTime": "2026-11-13T10:00:00Z",
            "webViewLink": "https://drive.google.com/file/d/file-1/view",
        }]}

    monkeypatch.setattr("app.api.google_integrations.google_api_get", fake_google_get)
    response = client.get("/api/integrations/google/preview/drive", headers=headers)
    assert response.status_code == 200
    assert response.json()["items"][0]["name"] == "Relatorio TIC"
    assert captured["url"] == "https://www.googleapis.com/drive/v3/files"
    assert "alt=media" not in str(captured["params"])


def test_classroom_preview_lists_courses_and_student_coursework(client, monkeypatch):
    headers = register(client)
    scopes = [
        "https://www.googleapis.com/auth/classroom.courses.readonly",
        "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
    ]
    add_google_credential(headers, scopes)
    calls = []

    def fake_google_get(url, access_token, params=None):
        calls.append(url)
        if url.endswith("/courses"):
            return {"courses": [{"id": "course-1", "name": "TDS"}]}
        return {"courseWork": [{
            "id": "work-1",
            "title": "Ficha de programação",
            "dueDate": {"year": 2026, "month": 11, "day": 20},
            "state": "PUBLISHED",
        }]}

    monkeypatch.setattr("app.api.google_integrations.google_api_get", fake_google_get)
    response = client.get("/api/integrations/google/preview/classroom", headers=headers)
    assert response.status_code == 200
    assert response.json()["items"][0]["course_name"] == "TDS"
    assert response.json()["items"][0]["title"] == "Ficha de programação"
    assert len(calls) == 2


def test_preview_rejects_missing_scopes(client):
    headers = register(client)
    add_google_credential(headers, [])
    response = client.get("/api/integrations/google/preview/drive", headers=headers)
    assert response.status_code == 403


def test_expired_access_token_is_refreshed_before_preview(client, monkeypatch):
    headers = register(client)
    scope = "https://www.googleapis.com/auth/drive.metadata.readonly"
    add_google_credential(headers, [scope], {
        "access_token": "expired-access-token",
        "refresh_token": "still-valid-refresh-token",
        "expires_at": "2020-01-01T00:00:00+00:00",
        "scopes": [scope],
    })
    refreshed = {}

    def fake_refresh(refresh_token):
        assert refresh_token == "still-valid-refresh-token"
        return {"access_token": "new-access-token", "expires_in": 3600}

    def fake_google_get(url, access_token, params=None):
        refreshed["access_token"] = access_token
        return {"files": []}

    monkeypatch.setattr("app.api.google_integrations.refresh_access_token", fake_refresh)
    monkeypatch.setattr("app.api.google_integrations.google_api_get", fake_google_get)
    response = client.get("/api/integrations/google/preview/drive", headers=headers)
    assert response.status_code == 200
    assert refreshed["access_token"] == "new-access-token"

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.models import GoogleCredential, GoogleDetectedEvent, User
from app.db.session import Base, SessionLocal, engine
from app.integrations.google_oauth import encrypt_secret
from app.main import app
import json


@pytest.fixture()
def client(monkeypatch):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "test-client-secret")
    monkeypatch.setattr(settings, "google_redirect_uri", "http://localhost:8000/callback")
    monkeypatch.setattr(settings, "google_token_encryption_key", Fernet.generate_key().decode())
    with TestClient(app) as test_client:
        yield test_client
    Base.metadata.drop_all(bind=engine)


def register(client, email="monitor@example.com"):
    response = client.post("/api/auth/register", json={
        "email": email,
        "password": "correct-horse-battery",
    })
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def add_credential(email, scopes):
    bundle = {
        "access_token": "valid-access-token",
        "refresh_token": "valid-refresh-token",
        "expires_at": "2999-01-01T00:00:00+00:00",
        "scopes": scopes,
    }
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=email).one()
        db.add(GoogleCredential(
            user_id=user.id,
            encrypted_tokens=encrypt_secret(json.dumps(bundle)),
            scopes=scopes,
        ))
        db.commit()
    finally:
        db.close()


def test_sync_requires_authentication(client):
    assert client.post("/api/integrations/google/sync").status_code == 401
    assert client.get("/api/integrations/google/events").status_code == 401


def test_first_sync_creates_baseline_without_old_item_alerts(client, monkeypatch):
    headers = register(client)
    add_credential("monitor@example.com", [
        "https://www.googleapis.com/auth/drive.metadata.readonly"
    ])
    monkeypatch.setattr(
        "app.api.google_monitoring._fetch_provider_items",
        lambda provider, token: [{"id": "file-old", "name": "Old file", "mimeType": "text/plain"}],
    )

    response = client.post("/api/integrations/google/sync?provider=drive", headers=headers)
    assert response.status_code == 200
    assert response.json()["results"][0]["status"] == "baseline_created"
    assert response.json()["new_events"] == 0
    assert client.get("/api/integrations/google/events", headers=headers).json()["count"] == 0


def test_incremental_sync_detects_only_new_ids_and_deduplicates(client, monkeypatch):
    headers = register(client)
    add_credential("monitor@example.com", [
        "https://www.googleapis.com/auth/drive.metadata.readonly"
    ])
    items = [{"id": "file-1", "name": "Existing", "mimeType": "text/plain"}]
    monkeypatch.setattr(
        "app.api.google_monitoring._fetch_provider_items",
        lambda provider, token: list(items),
    )
    client.post("/api/integrations/google/sync?provider=drive", headers=headers)

    items.append({
        "id": "file-2",
        "name": "New project",
        "mimeType": "application/pdf",
        "webViewLink": "https://drive.google.com/file/d/file-2/view",
    })
    first_increment = client.post(
        "/api/integrations/google/sync?provider=drive", headers=headers
    )
    second_increment = client.post(
        "/api/integrations/google/sync?provider=drive", headers=headers
    )

    assert first_increment.json()["new_events"] == 1
    assert second_increment.json()["new_events"] == 0
    events = client.get("/api/integrations/google/events", headers=headers).json()
    assert events["count"] == 1
    assert events["items"][0]["title"] == "New project"
    assert events["items"][0]["provider"] == "drive"


def test_sync_all_skips_disconnected_providers(client):
    headers = register(client)
    response = client.post("/api/integrations/google/sync", headers=headers)
    assert response.status_code == 200
    assert response.json()["new_events"] == 0
    assert all(item["status"] == "not_connected" for item in response.json()["results"])


def test_sync_skips_missing_scopes(client):
    headers = register(client)
    add_credential("monitor@example.com", [])
    response = client.post(
        "/api/integrations/google/sync?provider=gmail", headers=headers
    )
    assert response.status_code == 200
    assert response.json()["results"][0]["status"] == "missing_scopes"


def test_events_are_private_to_their_owner(client, monkeypatch):
    owner_headers = register(client)
    add_credential("monitor@example.com", [
        "https://www.googleapis.com/auth/drive.metadata.readonly"
    ])
    monkeypatch.setattr(
        "app.api.google_monitoring._fetch_provider_items",
        lambda provider, token: [{"id": "old", "name": "Old"}],
    )
    client.post("/api/integrations/google/sync?provider=drive", headers=owner_headers)
    other_headers = register(client, "other@example.com")
    assert client.get("/api/integrations/google/events", headers=other_headers).json()["count"] == 0

import json
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.models import GoogleCredential, User
from app.db.session import Base, SessionLocal, engine
from app.integrations.google_oauth import encrypt_secret
from app.main import app
from app.jobs.google_sync import run_monitoring_cycle


@pytest.fixture()
def worker_client(monkeypatch):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "test-client-secret")
    monkeypatch.setattr(settings, "google_redirect_uri", "http://localhost:8000/callback")
    monkeypatch.setattr(settings, "google_token_encryption_key", Fernet.generate_key().decode())
    with TestClient(app) as test_client:
        yield test_client
    Base.metadata.drop_all(bind=engine)


def create_worker_user(client, email):
    response = client.post("/api/auth/register", json={"email": email, "password": "correct-horse-battery"})
    assert response.status_code == 201


def add_worker_credential(email):
    scopes = ["https://www.googleapis.com/auth/drive.metadata.readonly"]
    bundle = {"access_token": "valid-token", "refresh_token": "refresh-token", "expires_at": "2999-01-01T00:00:00+00:00", "scopes": scopes}
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=email).one()
        db.add(GoogleCredential(user_id=user.id, encrypted_tokens=encrypt_secret(json.dumps(bundle)), scopes=scopes))
        db.commit()
    finally:
        db.close()


def test_scheduled_worker_scans_each_connected_user_and_provider(worker_client, monkeypatch):
    create_worker_user(worker_client, "worker@example.com")
    add_worker_credential("worker@example.com")
    calls = []

    def fake_sync(db, user, provider):
        calls.append((user.id, provider))
        return {"provider": provider, "status": "success", "new_events": 1 if provider == "drive" else 0, "scanned": 3}

    monkeypatch.setattr("app.jobs.google_sync._sync_provider", fake_sync)
    result = run_monitoring_cycle()

    assert result["users_scanned"] == 1
    assert result["providers_scanned"] == 3
    assert result["new_events"] == 1
    assert result["provider_errors"] == 0
    assert [provider for _, provider in calls] == ["classroom", "gmail", "drive"]


def test_scheduled_worker_isolates_provider_errors(worker_client, monkeypatch):
    create_worker_user(worker_client, "worker-error@example.com")
    add_worker_credential("worker-error@example.com")
    calls = []

    def fake_sync(db, user, provider):
        calls.append(provider)
        if provider == "gmail":
            raise RuntimeError("simulated provider outage")
        return {"provider": provider, "status": "success", "new_events": 0, "scanned": 0}

    monkeypatch.setattr("app.jobs.google_sync._sync_provider", fake_sync)
    result = run_monitoring_cycle()

    assert calls == ["classroom", "gmail", "drive"]
    assert result["providers_scanned"] == 3
    assert result["provider_errors"] == 1
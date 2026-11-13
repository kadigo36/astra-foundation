import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import Base, engine

@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as test_client:
        yield test_client
    Base.metadata.drop_all(bind=engine)


def register(client, email="astra-test@example.com"):
    response = client.post("/api/auth/register", json={
        "email": email,
        "password": "correct-horse-battery",
    })
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_auth_required_for_spaces(client):
    assert client.get("/api/spaces").status_code == 401


def test_register_and_me(client):
    headers = register(client)
    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["email"] == "astra-test@example.com"


def test_duplicate_registration_rejected(client):
    register(client)
    response = client.post("/api/auth/register", json={
        "email": "astra-test@example.com",
        "password": "another-long-password",
    })
    assert response.status_code == 409


def test_spaces_are_private_and_approval_is_not_execution(client):
    owner_headers = register(client)
    space = client.post("/api/spaces", json={"name": "Programação"}, headers=owner_headers)
    assert space.status_code == 201
    space_id = space.json()["id"]

    approval = client.post("/api/approvals", headers=owner_headers, json={
        "space_id": space_id,
        "action_type": "email.send",
        "description": "Enviar mensagem de teste ao destinatário autorizado",
    })
    assert approval.status_code == 201
    approval_id = approval.json()["id"]
    decision = client.post(
        f"/api/approvals/{approval_id}/decision?decision=approved",
        headers=owner_headers,
    )
    assert decision.status_code == 200
    assert decision.json()["executed"] is False

    other_headers = register(client, "other-user@example.com")
    assert client.get(f"/api/spaces/{space_id}", headers=other_headers).status_code == 404


def test_invalid_token_rejected(client):
    response = client.get("/api/spaces", headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 401

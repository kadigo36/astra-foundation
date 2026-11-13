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


def register(client, email):
    response = client.post("/api/auth/register", json={
        "email": email, "password": "correct-horse-battery",
    })
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_central_memory_crud_and_revision_history(client):
    headers = register(client, "memory-owner@example.com")
    created = client.post("/api/memory", headers=headers, json={
        "scope": "central", "category": "preference",
        "title": "Idioma", "content": "Português europeu",
    })
    assert created.status_code == 201
    memory_id = created.json()["id"]

    changed = client.patch(f"/api/memory/{memory_id}", headers=headers, json={
        "scope": "central", "category": "preference",
        "title": "Idioma", "content": "Português europeu formal",
    })
    assert changed.status_code == 200
    history = client.get(f"/api/memory/{memory_id}/revisions", headers=headers)
    assert history.status_code == 200
    assert len(history.json()) == 2
    assert history.json()[-1]["content"] == "Português europeu"

    deleted = client.delete(f"/api/memory/{memory_id}", headers=headers)
    assert deleted.status_code == 204
    assert client.get(f"/api/memory/{memory_id}", headers=headers).status_code == 404


def test_space_memory_isolation(client):
    owner = register(client, "memory-owner@example.com")
    other = register(client, "memory-other@example.com")
    space = client.post("/api/spaces", headers=owner, json={"name": "Escola"})
    space_id = space.json()["id"]

    created = client.post("/api/memory", headers=owner, json={
        "scope": "space", "space_id": space_id, "category": "project",
        "title": "Trabalho", "content": "Contexto privado do espaço",
    })
    assert created.status_code == 201
    memory_id = created.json()["id"]

    assert client.get(f"/api/memory/{memory_id}", headers=other).status_code == 404
    assert client.get(f"/api/memory?space_id={space_id}", headers=other).status_code == 404
    assert client.get("/api/memory?scope=central", headers=other).json() == []


def test_scope_validation_and_proposed_memory(client):
    headers = register(client, "memory-owner@example.com")
    invalid = client.post("/api/memory", headers=headers, json={
        "scope": "space", "category": "note", "title": "Sem espaço", "content": "Não deve entrar",
    })
    assert invalid.status_code == 422

    proposed = client.post("/api/memory", headers=headers, json={
        "scope": "central", "category": "decision", "title": "Nova regra",
        "content": "Confirmar antes de guardar como conhecimento estável",
        "status": "proposed",
    })
    assert proposed.status_code == 201
    assert proposed.json()["status"] == "proposed"


def test_memory_requires_authentication(client):
    assert client.get("/api/memory").status_code == 401

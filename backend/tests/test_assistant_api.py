import pytest
from fastapi.testclient import TestClient

from app.agents.schemas import AssistantPlan
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


def test_assistant_requires_authentication(client):
    response = client.post("/api/assistant/plan", json={"message": "Ajuda-me a estudar"})
    assert response.status_code == 401


def test_assistant_uses_only_authorized_memory(client, monkeypatch):
    owner = register(client, "assistant-owner@example.com")
    other = register(client, "assistant-other@example.com")
    space = client.post("/api/spaces", headers=owner, json={"name": "Escola"}).json()
    space_id = space["id"]

    client.post("/api/memory", headers=owner, json={
        "scope": "central", "category": "preference",
        "title": "Idioma", "content": "Prefiro português europeu",
    })
    client.post("/api/memory", headers=owner, json={
        "scope": "space", "space_id": space_id, "category": "project",
        "title": "Projeto escola", "content": "Estou a desenvolver um projeto escolar",
    })
    client.post("/api/memory", headers=other, json={
        "scope": "central", "category": "note",
        "title": "Segredo", "content": "Nunca deve ser enviado para outro utilizador",
    })

    captured = {}
    def fake_generate(message, memories):
        captured["memories"] = memories
        return AssistantPlan(
            answer="Vamos dividir o trabalho em etapas.",
            intent="planeamento",
            specialists=["teacher", "project_manager"],
            memory_queries=["projeto escolar"],
            proposed_actions=["Criar uma lista de tarefas"],
            requires_approval=False,
        )

    monkeypatch.setattr("app.api.assistant.generate_plan", fake_generate)
    response = client.post(
        "/api/assistant/plan",
        headers=owner,
        json={"message": "Ajuda-me com o projeto escolar", "space_id": space_id},
    )
    assert response.status_code == 200
    assert response.json()["execution"] == "not_performed"
    assert response.json()["memory_items_used"] == 2
    assert all("Nunca deve ser enviado" not in str(item) for item in captured["memories"])
    assert {item["scope"] for item in captured["memories"]} == {"central", "space"}


def test_assistant_rejects_access_to_another_users_space(client, monkeypatch):
    owner = register(client, "assistant-owner@example.com")
    other = register(client, "assistant-other@example.com")
    space = client.post("/api/spaces", headers=owner, json={"name": "Privado"}).json()

    def should_not_run(*args, **kwargs):
        raise AssertionError("Gemini must not be called for an unauthorized space")

    monkeypatch.setattr("app.api.assistant.generate_plan", should_not_run)
    response = client.post(
        "/api/assistant/plan",
        headers=other,
        json={"message": "Mostra-me a memória", "space_id": space["id"]},
    )
    assert response.status_code == 404


def test_assistant_returns_clear_error_when_gemini_not_configured(client, monkeypatch):
    from app.agents.gemini import GeminiNotConfigured

    headers = register(client, "assistant-owner@example.com")
    def not_configured(*args, **kwargs):
        raise GeminiNotConfigured()

    monkeypatch.setattr("app.api.assistant.generate_plan", not_configured)
    response = client.post(
        "/api/assistant/plan", headers=headers, json={"message": "Olá ASTRA"}
    )
    assert response.status_code == 503

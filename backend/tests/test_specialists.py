import pytest
from pydantic import ValidationError

from app.agents.registry import SPECIALISTS, get_specialist, specialist_catalogue_prompt
from app.agents.schemas import AssistantPlan


def test_registry_contains_expected_specialists():
    assert set(SPECIALISTS) == {
        "teacher", "developer", "researcher",
        "project_manager", "analyst", "security",
    }


def test_every_specialist_has_instructions_and_no_tools():
    for specialist in SPECIALISTS.values():
        assert specialist.purpose
        assert specialist.instructions
        assert specialist.allowed_tools == ()


def test_catalogue_prompt_describes_roles_and_no_tools():
    prompt = specialist_catalogue_prompt()
    assert "teacher" in prompt
    assert "developer" in prompt
    assert "security" in prompt
    assert "Ferramentas permitidas: nenhuma." in prompt


def test_unknown_specialist_lookup_returns_none():
    assert get_specialist("administrator") is None


def test_assistant_plan_rejects_duplicate_specialists():
    with pytest.raises(ValidationError):
        AssistantPlan(
            answer="Resposta",
            intent="ajuda",
            specialists=["teacher", "teacher"],
        )


def test_assistant_plan_rejects_more_than_three_specialists():
    with pytest.raises(ValidationError):
        AssistantPlan(
            answer="Resposta",
            intent="ajuda",
            specialists=["teacher", "developer", "security", "analyst"],
        )


def test_assistant_plan_accepts_unique_specialists():
    plan = AssistantPlan(
        answer="Resposta",
        intent="ajuda",
        specialists=["teacher", "developer"],
    )
    assert plan.specialists == ["teacher", "developer"]

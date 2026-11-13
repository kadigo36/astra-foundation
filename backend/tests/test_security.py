import pytest

from app.core.permissions import Decision, RiskLevel, evaluate_action
from app.agents.contracts import AgentProposal
from app.orchestration.router import validate_proposal


def test_low_risk_action_is_allowed():
    assert evaluate_action(RiskLevel.LOW) is Decision.ALLOW


def test_sensitive_action_requires_approval():
    assert evaluate_action(RiskLevel.SENSITIVE) is Decision.REQUIRE_APPROVAL


def test_sensitive_action_allowed_after_approval():
    assert evaluate_action(RiskLevel.SENSITIVE, approved=True) is Decision.ALLOW


def test_prohibited_action_is_denied_even_if_approved():
    assert evaluate_action(RiskLevel.PROHIBITED, approved=True) is Decision.DENY


def test_cross_space_proposal_is_rejected():
    proposal = AgentProposal(
        agent_id="researcher",
        space_id="school",
        summary="Summarize a document",
        action_type="document.read",
        risk="low",
    )
    with pytest.raises(PermissionError):
        validate_proposal(proposal, active_space_id="personal")

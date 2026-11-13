from enum import StrEnum


class RiskLevel(StrEnum):
    LOW = "low"
    SENSITIVE = "sensitive"
    PROHIBITED = "prohibited"


class Decision(StrEnum):
    ALLOW = "allow"
    REQUIRE_APPROVAL = "require_approval"
    DENY = "deny"


def evaluate_action(risk: RiskLevel, *, approved: bool = False) -> Decision:
    """Apply the ASTRA v0.1 default-deny action policy.

    The model must never decide its own permissions. The trusted backend
    evaluates the action classification and explicit human approval.
    """
    if risk is RiskLevel.PROHIBITED:
        return Decision.DENY
    if risk is RiskLevel.SENSITIVE and not approved:
        return Decision.REQUIRE_APPROVAL
    return Decision.ALLOW

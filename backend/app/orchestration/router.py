from app.agents.contracts import AgentProposal


def validate_proposal(proposal: AgentProposal, active_space_id: str) -> AgentProposal:
    """Minimal deterministic boundary check for v0.1.

    This does not authorize execution. It only rejects cross-space proposals;
    authorization and approval must be evaluated separately by the backend.
    """
    if proposal.space_id != active_space_id:
        raise PermissionError("Cross-space access requires explicit authorization.")
    return proposal

from typing import Literal
from pydantic import BaseModel, Field


class AgentProposal(BaseModel):
    """Untrusted proposal produced by an AI agent; never execute directly."""

    agent_id: str = Field(min_length=1, max_length=80)
    space_id: str = Field(min_length=1, max_length=80)
    summary: str = Field(min_length=1, max_length=500)
    action_type: str = Field(min_length=1, max_length=80)
    risk: Literal["low", "sensitive", "prohibited"]
    requires_external_write: bool = False

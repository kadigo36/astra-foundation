from typing import Literal
from pydantic import BaseModel, Field, field_validator

Specialist = Literal[
    "teacher", "developer", "researcher", "project_manager", "analyst", "security",
]



class AssistantPlan(BaseModel):
    answer: str = Field(min_length=1, max_length=6000)
    intent: str = Field(min_length=1, max_length=120)
    specialists: list[Specialist] = Field(default_factory=list, max_length=3)
    memory_queries: list[str] = Field(default_factory=list, max_length=5)
    proposed_actions: list[str] = Field(default_factory=list, max_length=5)
    requires_approval: bool = False

    @field_validator("specialists")
    @classmethod
    def specialists_must_be_unique(cls, value: list[Specialist]) -> list[Specialist]:
        if len(value) != len(set(value)):
            raise ValueError("Specialist names must be unique")
        return value

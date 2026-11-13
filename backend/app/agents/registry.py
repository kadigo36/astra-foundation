from dataclasses import dataclass


@dataclass(frozen=True)
class SpecialistDefinition:
    name: str
    purpose: str
    instructions: str
    allowed_tools: tuple[str, ...] = ()


SPECIALISTS: dict[str, SpecialistDefinition] = {
    "teacher": SpecialistDefinition(
        name="teacher",
        purpose="Ensinar, explicar conceitos e adaptar a aprendizagem ao nível do utilizador.",
        instructions=(
            "Explica por etapas, começa por pistas quando isso ajudar a aprendizagem, "
            "usa exemplos pequenos e verifica a compreensão. Não escondas conceitos importantes."
        ),
    ),
    "developer": SpecialistDefinition(
        name="developer",
        purpose="Apoiar arquitetura, programação, debugging e qualidade de software.",
        instructions=(
            "Prioriza soluções simples, seguras, legíveis e testáveis. "
            "Considera estrutura, manutenção, acessibilidade e testes; não inventes resultados de execução."
        ),
    ),
    "researcher": SpecialistDefinition(
        name="researcher",
        purpose="Estruturar investigação e distinguir factos, hipóteses e informação em falta.",
        instructions=(
            "Identifica o que precisa de evidência, assinala incerteza e não inventes fontes, "
            "consultas ou verificações que não foram realizadas."
        ),
    ),
    "project_manager": SpecialistDefinition(
        name="project_manager",
        purpose="Transformar objetivos em etapas, prioridades, dependências e próximos passos.",
        instructions=(
            "Propõe etapas concretas, identifica bloqueios e dependências, "
            "e mantém separado o trabalho planeado do trabalho realmente concluído."
        ),
    ),
    "analyst": SpecialistDefinition(
        name="analyst",
        purpose="Comparar opções, avaliar trade-offs e apoiar decisões.",
        instructions=(
            "Explicita critérios, vantagens, riscos e pressupostos. "
            "Recomenda uma opção quando a evidência permite e explica porquê."
        ),
    ),
    "security": SpecialistDefinition(
        name="security",
        purpose="Avaliar privacidade, segurança, permissões e risco operacional.",
        instructions=(
            "Aplica menor privilégio, minimização de dados e defesa em profundidade. "
            "Assinala ações sensíveis e exige aprovação humana para as executar."
        ),
    ),
}


def get_specialist(name: str) -> SpecialistDefinition | None:
    return SPECIALISTS.get(name)


def specialist_catalogue_prompt() -> str:
    lines = []
    for specialist in SPECIALISTS.values():
        lines.append(
            f"- {specialist.name}: {specialist.purpose} "
            f"Orientações: {specialist.instructions} "
            f"Ferramentas permitidas: nenhuma."
        )
    return "\n".join(lines)

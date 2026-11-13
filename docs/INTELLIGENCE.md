# ASTRA — Intelligence Engine v0.4 / Specialist Agents v0.5

## Objetivo

Introduzir Gemini como coordenador principal da ASTRA, mantendo o backend como única fronteira de confiança. O modelo interpreta pedidos e devolve um plano estruturado; não recebe ferramentas para executar ações externas.

## Componentes

- `app/agents/schemas.py`: contrato validado de resposta e limite de três especialistas únicos.
- `app/agents/registry.py`: catálogo fixo de seis especialistas, cada um com finalidade e instruções próprias; todos sem ferramentas permitidas.
- `app/agents/gemini.py`: integração isolada com o Google Gen AI SDK.
- `app/api/assistant.py`: endpoint autenticado, seleção de contexto autorizado e auditoria.
- Modelo predefinido: `gemini-3.8-flash`, configurável por variável de ambiente.

## Endpoint

`POST /api/assistant/plan`

Exemplo de pedido:

```json
{
  "message": "Ajuda-me a organizar o projeto da escola",
  "space_id": 1
}
```

O endpoint:
1. Exige JWT válido.
2. Se for indicado um espaço, confirma membership antes de consultar dados ou chamar Gemini.
3. Recupera apenas memórias confirmadas do utilizador: memória central e, quando autorizado, memória do espaço indicado.
4. Por defeito, não envia memória pessoal para Gemini. Só envia até oito entradas relevantes e truncadas quando `ASTRA_GEMINI_SHARE_MEMORY=true` estiver explicitamente configurado no servidor.
5. Valida a resposta do modelo através de Pydantic.
6. Regista metadados de auditoria sem guardar o conteúdo integral do pedido.
7. Devolve `execution: not_performed`.

## Contrato de resposta

- `answer`: resposta em linguagem natural.
- `intent`: intenção resumida.
- `specialists`: até três papéis sugeridos do catálogo fixo.
- `memory_queries`: termos que poderão orientar recuperação futura.
- `proposed_actions`: sugestões, nunca ações executadas.
- `requires_approval`: indicação do modelo de que uma ação sensível exigiria aprovação.

## Catálogo de especialistas v0.5

O Gemini recebe as descrições e instruções do catálogo para coordenar os papéis adequados ao pedido:

- `teacher`: ensino adaptado e explicações por etapas.
- `developer`: arquitetura, programação, debugging e qualidade.
- `researcher`: investigação, evidência e incerteza.
- `project_manager`: etapas, prioridades, dependências e bloqueios.
- `analyst`: comparação de opções e trade-offs.
- `security`: privacidade, permissões e risco operacional.

O modelo pode selecionar no máximo três especialistas. A resposta é validada por Pydantic e seleções duplicadas são rejeitadas. O catálogo não concede ferramentas: todos os especialistas têm `allowed_tools=()`. São perspetivas de raciocínio coordenadas pelo Gemini, não processos autónomos nem agentes com execução independente.

## Segurança e limites

- A chave Gemini existe apenas no backend (`GEMINI_API_KEY`).
- O modelo não recebe ferramentas, tokens Google, credenciais nem capacidade de executar código.
- A partilha de memória com o fornecedor está desativada por defeito (`ASTRA_GEMINI_SHARE_MEMORY=false`).
- Antes de ativar a partilha, rever os termos e a política de dados do nível de API escolhido. O nível gratuito pode usar conteúdos enviados para melhorar produtos Google; o nível pago indica que esses conteúdos não são usados para esse fim.
- Memórias são tratadas como dados não confiáveis, não como instruções.
- Memórias propostas não são enviadas ao modelo.
- Não é permitido atravessar espaços.
- Falta de chave resulta em HTTP 503; falha do fornecedor resulta em HTTP 502.
- A saída do modelo é validada; nomes de especialistas fora do catálogo são rejeitados.
- `requires_approval` é apenas uma indicação. A autorização real continua a ser responsabilidade do backend e do sistema de aprovações.

## Configuração

Adicionar no ambiente do backend, nunca no frontend nem no Git:

```env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.8-flash
ASTRA_GEMINI_SHARE_MEMORY=false
```

Sem chave, os testes e o restante backend continuam a funcionar; o endpoint responde com 503 até a integração ser configurada. Mesmo com chave, a memória pessoal não é partilhada por defeito.

## Próximas melhorias

- Testes de integração com respostas simuladas e testes de contrato adicionais.
- Rate limiting e limites de tokens/custo por utilizador.
- Métricas de latência, tokens e quotas sem registar prompts privados.
- Recuperação semântica com filtros de autorização aplicados antes da pesquisa.
- Evoluir os especialistas para módulos separados apenas quando existirem casos de uso e testes que justifiquem essa complexidade.
- Fluxo de aprovação ligado a ações concretas, com confirmação humana no momento da execução.

Esta versão não executa ações, não acede a Google Workspace e não está pronta para produção.

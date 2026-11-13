# ASTRA — Roadmap

## v0.1 — Foundation
- [x] Estrutura inicial do repositório
- [x] API FastAPI e health check
- [x] Política inicial de risco e aprovação
- [x] Contrato de proposta de agente
- [x] Verificação básica de isolamento entre espaços
- [x] Dashboard inicial responsivo
- [x] Workflow CI para testes do backend

## v0.2 — Core seguro (implementação inicial)
- [x] Registo e login com password hashing Argon2
- [x] JWT com expiração e rotas autenticadas
- [x] Criação e listagem de espaços privados
- [x] Verificação de membership por espaço
- [x] Pedidos de aprovação e decisões explícitas
- [x] Decisão de aprovação separada da execução
- [x] Registo e consulta dos próprios eventos de auditoria
- [x] Proteções de configuração para ambientes não-development
- [ ] Executar CI e confirmar resultados
- [ ] Rate limiting e recuperação de conta
- [ ] Migrações Alembic e testes adicionais

## v0.3 — Memory Engine (implementação inicial)
- [x] Memória central e memória por espaço
- [x] Categorias e estado confirmed/proposed
- [x] API autenticada de criação, leitura, atualização e eliminação
- [x] Isolamento por utilizador e membership do espaço
- [x] Snapshots de versões anteriores
- [x] Exportação Markdown
- [x] Auditoria de operações de memória sem guardar o conteúdo
- [ ] Migrações Alembic
- [ ] Pesquisa semântica com filtragem de permissões
- [ ] Backups cifrados, retenção e recuperação testada
- [ ] Interface de gestão de memória no dashboard

## v0.4 — Gemini Intelligence (primeira implementação)
- [x] Integração isolada com Google Gen AI SDK
- [x] Endpoint autenticado para planeamento
- [x] Seleção de memória central e do espaço autorizado
- [x] Resposta estruturada e validação Pydantic
- [x] Sugestões de especialistas sem execução automática
- [x] Auditoria de pedidos sem guardar prompts
- [ ] Configurar chave Gemini no ambiente cloud
- [ ] Executar CI e validar testes da nova fase
- [ ] Rate limiting e limites de tokens/custo
- [ ] Métricas de latência, tokens e quotas
- [ ] Catálogo de agentes especializados com instruções próprias

## v0.5 — Google e automações
- [ ] OAuth Google com scopes mínimos
- [ ] Classroom: novas tarefas
- [ ] Gmail: deteção de emails importantes
- [ ] Drive: novos ficheiros
- [ ] Fila de eventos, idempotência e aprovações

## v0.6 — Interfaces e cloud
- [ ] Dashboard autenticado
- [ ] Notificações
- [ ] Avaliação segura do gateway WhatsApp
- [ ] Deploy cloud, backups e recuperação testada

As fases só passam a concluídas quando existe implementação e validação observável.

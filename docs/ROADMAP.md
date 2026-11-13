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

## v0.3 — Memória
- [ ] Esquema PostgreSQL e migrações
- [ ] Memória estruturada + Markdown
- [ ] Pesquisa semântica
- [ ] Exportação, retenção e eliminação

## v0.4 — Gemini e agentes
- [ ] Interface de fornecedor e integração Gemini
- [ ] Orquestração com limites de custo/tempo
- [ ] Agentes temporários e catálogo aprovado
- [ ] Observabilidade e controlo de quotas

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

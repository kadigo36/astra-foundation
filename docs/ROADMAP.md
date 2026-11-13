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
- [x] Partilha de memória com Gemini desativada por defeito; ativação explícita por configuração
- [x] CI: 19 testes aprovados
- [ ] Configurar chave Gemini no ambiente cloud
- [ ] Teste de integração real com chave Gemini
- [ ] Rate limiting e limites de tokens/custo
- [ ] Métricas de latência, tokens e quotas
- [x] Catálogo fixo de seis especialistas com instruções próprias e sem ferramentas

## v0.5 — Specialist Agents
- [x] Catálogo fixo de seis especialistas: teacher, developer, researcher, project_manager, analyst e security
- [x] Instruções próprias para cada especialista injetadas no contexto do Gemini
- [x] Limite de três especialistas únicos por resposta, validado por Pydantic
- [x] Nenhum especialista tem ferramentas ou capacidade de execução
- [x] Testes de catálogo, permissões, unicidade e limites

## v0.6 — Google e automações
- [x] OAuth Google: authorization code, state de uso único, PKCE S256 e callback
- [x] Classroom: leitura manual de cursos e trabalhos publicados do próprio aluno (preview autenticado)
- [x] Gmail: preview manual de mensagens IMPORTANT usando apenas metadados/cabeçalhos
- [x] Drive: preview manual dos 50 ficheiros mais recentes, apenas metadados
- [x] Credenciais Google cifradas no backend e endpoints de estado/desligação local
- [x] Refresh automático de access tokens expirados/prestes a expirar
- [x] Testes CI: 39 aprovados (OAuth, PKCE, cifragem, refresh e previews)
- [ ] Revogação no fornecedor, polling agendado, fila de eventos, idempotência e aprovações

## v0.7 — Monitoring Engine (primeira implementação)
- [x] Estado de sincronização por utilizador e fornecedor Google
- [x] Primeira sincronização como baseline, sem gerar falsos alertas de itens antigos
- [x] Deteção incremental de novos itens Classroom, emails IMPORTANT e ficheiros Drive
- [x] Deduplicação persistente por utilizador/fornecedor/ID externo
- [x] API autenticada para sincronizar manualmente e consultar eventos
- [x] Auditoria agregada sem guardar conteúdo de emails ou ficheiros
- [ ] Paginação completa e cursores nativos dos fornecedores
- [x] Worker de sincronização executável como Cloud Run Job
- [x] Dockerfile dedicado e instruções Cloud Scheduler (15 minutos)
- [ ] Criar recursos reais na Google Cloud, configurar secrets e validar execução com conta Google real
- [ ] Paginação completa, cursores nativos e fila de eventos
- [ ] Notificações smart e preferências por utilizador

## v0.8 — Interfaces e cloud
- [ ] Dashboard autenticado
- [ ] Notificações
- [ ] Avaliação segura do gateway WhatsApp
- [ ] Deploy cloud, backups e recuperação testada

Esta entrega cobre OAuth, refresh e previews manuais de leitura; ainda não declara monitorização automática Classroom, Gmail ou Drive operacionais. As fases só passam a concluídas quando existe implementação e validação observável.

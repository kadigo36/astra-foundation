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
- [ ] Rate limiting e recuperação de conta
- [ ] Migrações Alembic e testes adicionais

## v0.3 — Memory Engine
- [x] Memória central e memória por espaço
- [x] Categorias e estado confirmed/proposed
- [x] API autenticada de memória e isolamento por utilizador/espaço
- [x] Snapshots, exportação Markdown e auditoria sem conteúdo
- [ ] Pesquisa semântica, backups cifrados e interface de gestão

## v0.4–v0.5 — Gemini Intelligence e especialistas
- [x] Integração Google Gen AI SDK e planeamento estruturado
- [x] Seis especialistas sem ferramentas de execução
- [x] Memória partilhada com Gemini desligada por defeito
- [ ] Teste real com chave e limites de custo/quota

## v0.6 — Google integrations
- [x] OAuth Google com state, PKCE, cifragem e refresh
- [x] Previews de Classroom, Gmail metadata e Drive metadata
- [ ] Revogação no fornecedor e fila de eventos

## v0.7 — Monitoring Engine
- [x] Worker de sincronização, deduplicação e auditoria
- [x] Execução preparada para Cloud Run Job
- [ ] Deploy real (adiado pela regra 0 €)
- [ ] Paginação completa e notificações smart

## v0.8 — Zero-Cost Architecture
- [x] Regra rígida 0 €/mês; sem billing, cartões ou serviços pagos
- [x] Monitor Apps Script inicial e CI estática
- [x] Baseline, deduplicação e folha privada por instância
- [ ] Validar integração real com serviços Google

## v0.9 — Multi-Google Accounts (em implementação)
- [x] Decidir uma instância Apps Script independente por conta Google
- [x] Configuração por alias, tipo e fornecedores ativos
- [x] Conta escolar preparada para Classroom + Gmail + Drive
- [x] Contas pessoais preparadas para Gmail + Drive por defeito
- [x] Folhas privadas e baselines isolados por conta
- [x] Agendamento separado da inicialização e teste manual
- [ ] Instalar e validar a instância da conta escolar
- [ ] Instalar e validar as duas instâncias pessoais
- [ ] Desenhar agregação central com consentimento explícito e isolamento de dados

## Regras de entrega
- Uma tarefa só passa a concluída quando existe implementação e validação observável.
- Código no GitHub não significa que esteja publicado, autorizado ou ativo.
- Nenhum recurso pago é criado sem decisão explícita separada.
- Se um limite gratuito for atingido, parar e reportar; nunca fazer upgrade automático.

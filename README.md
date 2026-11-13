# ASTRA Foundation

A ASTRA é um assistente pessoal estratégico, proativo e extensível. Este repositório contém a fundação técnica inicial, concebida para uma arquitetura cloud-first e independente de fornecedor.

## Estado

**v0.4 — Intelligence Engine (em desenvolvimento).** Inclui API FastAPI, autenticação por password + JWT, espaços privados, pedidos de aprovação e auditoria básica. A integração Gemini está preparada no backend, mas requer uma chave de API configurada no ambiente. O modelo apenas planeia; não executa ações.

## Princípios

- Gemini é o coordenador principal previsto; a integração será adicionada atrás de uma interface de modelo.
- O backend é a fronteira de confiança: modelos sugerem; o backend valida permissões e risco.
- Autonomia limitada: ações de baixo risco podem ser automatizadas; ações sensíveis exigem aprovação explícita.
- Espaços isolados por contexto, com partilha entre espaços apenas mediante autorização.
- Memória híbrida e exportável: base de dados, Markdown e pesquisa semântica.
- Segredos nunca são guardados no frontend ou no Git.
- Sem troca silenciosa de modelo ou failover automático.
- Cloud-first, com portabilidade futura para home-server.

## Estrutura

```text
backend/       API Python/FastAPI, segurança e orquestração
dashboard/     Interface web React + TypeScript
database/      Migrações e políticas de dados
docs/          Arquitetura, segurança, memória e roadmap
.github/       Automação de qualidade
```

## Desenvolvimento local

### Backend
1. Usa Python 3.11+.
2. Cria um ambiente virtual e instala: `pip install -r backend/requirements.txt`.
3. Copia `.env.example` para `backend/.env` e configura um segredo local.
4. Executa: `uvicorn app.main:app --reload --app-dir backend`.
5. Health check: `GET http://127.0.0.1:8000/health`.
6. Documentação interativa: `http://127.0.0.1:8000/docs`.

### Dashboard
1. Entra em `dashboard/`.
2. Executa `npm install`.
3. Executa `npm run dev`.

## Endpoints iniciais

- `POST /api/auth/register` — registar utilizador (desenvolvimento).
- `POST /api/auth/login` — iniciar sessão.
- `GET /api/auth/me` — identidade autenticada.
- `GET/POST /api/spaces` — listar/criar espaços próprios.
- `GET /api/spaces/{id}` — consultar espaço se membro.
- `GET/POST /api/approvals` — listar/criar pedidos de aprovação.
- `POST /api/approvals/{id}/decision?decision=approved|rejected` — decidir; não executa a ação.
- `GET /api/audit/events` — consultar os próprios eventos de auditoria.
- `POST /api/assistant/plan` — gerar um plano com Gemini usando apenas memória autorizada; não executa ações.

## Configuração e segurança

As variáveis em `.env.example` são placeholders. Nunca coloques chaves reais no repositório. Fora de development, a API exige segredo JWT próprio e registo público desativado. Esta versão ainda não está pronta para produção: faltam migrações versionadas, rate limiting, recuperação/revogação de sessões e revisão de segurança.

Consulta [Architecture](docs/ARCHITECTURE.md), [Security](docs/SECURITY.md), [Memory](docs/MEMORY.md), [Intelligence](docs/INTELLIGENCE.md) e [Roadmap](docs/ROADMAP.md).

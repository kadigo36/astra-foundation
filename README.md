# ASTRA Foundation

A ASTRA é um assistente pessoal estratégico, proativo e extensível. Esta repository contém a fundação técnica inicial, concebida para uma arquitetura cloud-first e independente de fornecedor.

## Estado

**v0.1 — Foundation scaffold.** Esta versão estabelece a estrutura, os limites de segurança, contratos internos, health check e dashboard inicial. Ainda não liga serviços externos nem executa ações reais.

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
1. Cria um ambiente virtual Python 3.11+.
2. Instala dependências: `pip install -r backend/requirements.txt`.
3. Copia `.env.example` para `backend/.env` (não comitar esse ficheiro).
4. Executa: `uvicorn app.main:app --reload --app-dir backend`.
5. Health check: `GET http://127.0.0.1:8000/health`.

### Dashboard
1. Entra em `dashboard/`.
2. Executa `npm install`.
3. Executa `npm run dev`.

## Configuração

As variáveis documentadas em `.env.example` são apenas placeholders. Não coloques chaves reais no repositório. A integração Gemini, Supabase, Google e WhatsApp ainda não está ativa nesta versão.

## Segurança e maturidade

Esta é uma base de desenvolvimento, não um serviço pronto para produção. Antes de alojar publicamente: configurar autenticação, gestão de segredos, políticas de rede, limites de utilização, backups, monitorização, testes de segurança e revisão das políticas de dados.

Consulta [Architecture](docs/ARCHITECTURE.md), [Security](docs/SECURITY.md), [Memory](docs/MEMORY.md) e [Roadmap](docs/ROADMAP.md).

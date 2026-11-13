# ASTRA — Arquitetura

## Visão geral

```text
WhatsApp / Dashboard
        |
   API Gateway
        |
 ASTRA CORE (identidade, espaços, políticas, auditoria)
        |
 Orquestração — Gemini como coordenador
        |
 Agentes especializados (temporários ou aprovados)
        |
 Serviços: memória | Google | tarefas | automações
        |
 PostgreSQL + documentos Markdown + índice semântico
```

## Fronteira de confiança

O modelo é um componente não confiável para efeitos de autorização. Pode interpretar pedidos e propor planos, mas nunca concede permissões, decide que uma aprovação ocorreu ou executa diretamente uma ação externa. O ASTRA CORE valida identidade, espaço ativo, política, risco, consentimento e estado da aprovação.

## Componentes planeados

- **Dashboard:** React + TypeScript, aplicação responsiva.
- **API:** Python + FastAPI.
- **Coordenação:** Gemini através de uma interface isolada de fornecedor.
- **Dados:** PostgreSQL/Supabase, com migrações versionadas.
- **Memória:** registos estruturados, Markdown e pesquisa semântica.
- **Integrações:** Google Classroom, Gmail e Drive, com OAuth incremental, scopes mínimos e tokens cifrados no backend; os clientes de leitura e a monitorização ainda estão pendentes.
- **Automação:** serviço de tarefas/eventos com execução idempotente.
- **Cloud:** alojamento cloud-first, mantendo portabilidade.

## Regra operacional de orçamento zero

A arquitetura de produção acima é o destino conceptual, não o ambiente atualmente ativo. A execução inicial tem de respeitar 0 €/mês e não pode depender de faturação Google Cloud.

- O backend FastAPI, autenticação, memória, aprovações e dashboard permanecem no repositório para desenvolvimento e evolução local.
- A primeira monitorização pessoal usa Google Apps Script, executado na conta Google do utilizador, com registo numa Google Sheet privada.
- O monitor usa scopes de leitura de metadados e não envia conteúdo de emails/ficheiros ao Gemini.
- Cloud Run, Cloud SQL, Cloud Scheduler, Artifact Registry e Secret Manager ficam adiados.
- Cloudflare Pages/Workers/D1 são opções futuras apenas depois de confirmar limites gratuitos, segurança e ausência de cobrança automática.
- Nenhum serviço é atualizado para um plano pago automaticamente.

Ver [Zero-Cost Architecture](ZERO_COST_ARCHITECTURE.md) para o fluxo operacional, limites e setup.

## Regras

1. Cada pedido tem utilizador, espaço, origem e identificador de correlação.
2. Cada proposta de agente é validada pelo backend.
3. Operações de leitura autorizadas podem ser automáticas.
4. Escritas de baixo risco só são automáticas dentro de escopos pré-aprovados.
5. Envio de mensagens, partilha/apagamento, pagamentos e alterações de permissões exigem aprovação.
6. Falhas de fornecedor, quotas ou base de dados são reportadas; não há failover silencioso.
7. Eventos e alterações relevantes ficam auditados.

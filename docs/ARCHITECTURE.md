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
- **Integrações:** Google Classroom, Gmail e Drive, com scopes mínimos.
- **Automação:** serviço de tarefas/eventos com execução idempotente.
- **Cloud:** alojamento cloud-first, mantendo portabilidade.

## Regras

1. Cada pedido tem utilizador, espaço, origem e identificador de correlação.
2. Cada proposta de agente é validada pelo backend.
3. Operações de leitura autorizadas podem ser automáticas.
4. Escritas de baixo risco só são automáticas dentro de escopos pré-aprovados.
5. Envio de mensagens, partilha/apagamento, pagamentos e alterações de permissões exigem aprovação.
6. Falhas de fornecedor, quotas ou base de dados são reportadas; não há failover silencioso.
7. Eventos e alterações relevantes ficam auditados.

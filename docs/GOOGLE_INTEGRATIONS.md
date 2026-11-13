# ASTRA — Google Integrations v0.6 (foundation)

## Estado real

Esta entrega implementa a fundação OAuth no backend. Ainda não consulta Classroom, Gmail ou Drive, não recebe notificações push e não executa monitorização periódica. Não configurar como integração operacional até concluir as etapas abaixo.

## Fluxo implementado

- `POST /api/integrations/google/connect/{provider}` — exige JWT e inicia consentimento para `classroom`, `gmail` ou `drive`.
- `GET /api/integrations/google/callback` — valida state de uso único, troca o código no servidor e guarda os tokens cifrados.
- `GET /api/integrations/google/status` — devolve apenas estado e scopes; nunca devolve tokens.
- `POST /api/integrations/google/disconnect` — apaga as credenciais locais. A revogação do consentimento no Google ainda não está implementada; a resposta declara `provider_revocation=not_performed`.

O fluxo usa authorization code, state aleatório com hash na base de dados, expiração de 10 minutos, PKCE S256 e acesso offline. A state é consumida atomicamente para dificultar replay. O utilizador autenticado que iniciou a ligação é o único proprietário da credencial guardada.

## Scopes por integração

| Integração | Scope solicitado | Limite |
|---|---|---|
| Classroom | `classroom.courses.readonly`, `classroom.coursework.me.readonly` | Leitura de cursos e trabalhos do próprio aluno |
| Gmail | `gmail.metadata` | Metadados e cabeçalhos; não lê corpo nem anexos |
| Drive | `drive.metadata.readonly` | Metadados; não descarrega conteúdo |

Os scopes são pedidos separadamente, quando a integração é ligada. A autorização incremental pode incluir scopes previamente concedidos pelo mesmo utilizador.

**Atenção:** Gmail metadata e Drive metadata readonly são scopes restritos segundo a classificação atual da Google. Uma aplicação pública pode precisar de verificação OAuth e, se armazenar/transmitir dados abrangidos por scopes restritos, avaliação de segurança. Não publicar nem abrir a aplicação a terceiros antes de confirmar os requisitos aplicáveis.

Classroom usa scopes de leitura do perfil de aluno. O scope `coursework.me.readonly` é indicado pela documentação para recuperar CourseWork em nome de alunos.

## Segredos obrigatórios no backend

Configurar fora do Git e fora do frontend:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` — tem de corresponder exatamente ao URI registado na Google Cloud Console.
- `ASTRA_GOOGLE_TOKEN_ENCRYPTION_KEY` — chave Fernet própria, estável e guardada num secret manager.
- `ASTRA_FRONTEND_URL` — origem do dashboard para redirecionamento após callback.

Gerar uma chave Fernet:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Nunca substituir a chave de cifragem depois de existirem tokens cifrados, a menos que se faça uma migração de chaves. Perder a chave torna os tokens irrecuperáveis. Em produção, usar um secret manager e backups protegidos.

## Ainda por implementar

1. Refresh seguro de access tokens e tratamento de revogação/expiração.
2. Revogação do token no Google ao desligar a conta.
3. Clientes de leitura para Classroom, Gmail e Drive com validação de scopes.
4. Polling inicial e deteção idempotente de novos eventos.
5. Gmail: regras de importância sem enviar conteúdo para o Gemini por defeito.
6. Drive: deteção de novos ficheiros sem descarregar conteúdo.
7. Fila persistente, retries, rate limits, deduplicação e auditoria.
8. Testes de integração com projeto Google de teste e revisão das permissões.

Nenhuma chave real, token ou conteúdo de conta deve ser colocado em commits, prompts de diagnóstico ou logs.

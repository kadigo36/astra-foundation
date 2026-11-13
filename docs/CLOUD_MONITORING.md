# ASTRA — Cloud Monitoring v0.7

## Arquitetura

O agendamento usa **Cloud Scheduler → Cloud Run Job → Google APIs**. O worker é um processo separado da API: não cria um endpoint público para o scheduler, não recebe JWT de utilizador e não precisa de expor a base de dados.

- O Cloud Scheduler chama a API run.googleapis.com com OAuth2 e uma service account dedicada.
- O Cloud Run Job corre o comando `python -m app.jobs.google_sync`.
- O worker procura utilizadores com credenciais Google guardadas e verifica Classroom, Gmail e Drive sequencialmente.
- Os tokens Google continuam cifrados na base de dados e são decifrados apenas no backend.
- Os dados lidos não são enviados ao Gemini.
- Não são enviadas notificações nem executadas ações externas.

A configuração proposta executa a cada 15 minutos, no fuso `Europe/Lisbon`. Ajustar o intervalo depois de observar quotas, duração e custos.

## Pré-requisitos antes de deploy

1. Projeto Google Cloud com faturação e APIs necessárias ativadas.
2. Base de dados PostgreSQL persistente e acessível pelo Cloud Run. **Não usar SQLite local/efémera em produção.**
3. Schema ASTRA aplicado à base de dados. O projeto ainda não tem migrações Alembic; não considerar produção pronta até resolver este ponto.
4. Credenciais OAuth Google e chave Fernet já configuradas no Secret Manager.
5. Contas Google ligadas através do fluxo OAuth da ASTRA.

APIs necessárias: Cloud Run, Cloud Build, Artifact Registry, Cloud Scheduler e Secret Manager.

## Build da imagem

Exemplo Bash; substitui os valores de projeto e região:

```bash
export PROJECT_ID="O_TEU_PROJECT_ID"
export REGION="europe-west1"
export IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/astra/monitoring:v0.7"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com

gcloud artifacts repositories create astra \
  --repository-format=docker \
  --location="$REGION" \
  --description="ASTRA container images"

gcloud builds submit backend --tag "$IMAGE"
```

Se o repositório Artifact Registry já existir, não repetir o comando de criação.

## Segredos e base de dados

Criar no Secret Manager os seguintes segredos, sem colocar os valores no Git ou no chat:

- `astra-database-url`: URL PostgreSQL SQLAlchemy, preferencialmente `postgresql+psycopg://...`.
- `astra-google-client-id`
- `astra-google-client-secret`
- `astra-google-token-encryption-key`: a mesma chave Fernet usada pela API que cifrou os tokens existentes.

A identidade de execução do Cloud Run Job precisa de `roles/secretmanager.secretAccessor` nos segredos e de permissões de rede/acesso à base de dados. Não criar uma nova chave Fernet se já existirem tokens cifrados.

## Criar o Cloud Run Job

```bash
export RUNTIME_SA="astra-monitoring-runtime@$PROJECT_ID.iam.gserviceaccount.com"

gcloud run jobs create astra-google-monitoring \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="$RUNTIME_SA" \
  --tasks=1 \
  --parallelism=1 \
  --max-retries=1 \
  --task-timeout=900s \
  --set-secrets="ASTRA_DATABASE_URL=astra-database-url:latest,GOOGLE_CLIENT_ID=astra-google-client-id:latest,GOOGLE_CLIENT_SECRET=astra-google-client-secret:latest,ASTRA_GOOGLE_TOKEN_ENCRYPTION_KEY=astra-google-token-encryption-key:latest"
```

Se o Job já existir, usar `gcloud run jobs update` em vez de `create`.

## Criar o agendamento

Usar uma service account separada para o Cloud Scheduler:

```bash
export SCHEDULER_REGION="$REGION"
export SCHEDULER_SA="astra-scheduler@$PROJECT_ID.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SCHEDULER_SA" \
  --role="roles/run.invoker"

gcloud scheduler jobs create http astra-google-monitoring-15m \
  --location="$SCHEDULER_REGION" \
  --schedule="*/15 * * * *" \
  --time-zone="Europe/Lisbon" \
  --uri="https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/$REGION/jobs/astra-google-monitoring:run" \
  --http-method=POST \
  --oauth-service-account-email="$SCHEDULER_SA" \
  --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform" \
  --message-body="{}" \
  --headers="Content-Type=application/json"
```

A service account do Scheduler deve pertencer ao mesmo projeto e ter autorização para invocar o Cloud Run Job. A pessoa que cria o agendamento também precisa de permissão para usar essa service account. Confirmar as permissões IAM exigidas pela política do projeto antes de aplicar.

## Testar e observar

Executar manualmente antes de ativar o Scheduler:

```bash
gcloud run jobs execute astra-google-monitoring --region="$REGION" --wait
```

Consultar a execução e os logs no Cloud Run. Confirmar que o worker terminou com código zero, que as três integrações aparecem com estados esperados e que não há dados privados ou tokens nos logs.

Para criar o Scheduler só depois do teste manual. Para interromper a monitorização, pausar ou apagar o Cloud Scheduler job; não é necessário apagar credenciais Google.

## Limites conhecidos

- Classroom: até 30 cursos e até 100 trabalhos por curso, sem seguir todos os `nextPageToken`.
- Gmail: até 20 mensagens IMPORTANT por sincronização.
- Drive: até 50 ficheiros recentes por sincronização. Itens fora destas janelas podem não ser detetados.
- O ciclo percorre utilizadores sequencialmente. Para muitos utilizadores, será necessário particionar o trabalho e introduzir uma fila.
- A primeira sincronização de cada fornecedor cria baseline e não gera eventos retroativos.
- Cloud Scheduler e Cloud Run têm custos/quotas próprios. O intervalo de 15 minutos equivale a 96 execuções por dia.
- Gmail metadata e Drive metadata readonly são scopes restritos; os requisitos de verificação e segurança Google têm de ser avaliados antes de disponibilizar ASTRA a terceiros.
- Esta documentação não significa que recursos Cloud tenham sido criados ou que exista uma conta Google ligada.
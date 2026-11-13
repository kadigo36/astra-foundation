# ASTRA — Segurança

## Implementado no Core v0.2

- Passwords são armazenadas com hash Argon2 através de pwdlib.
- Tokens JWT assinados e com expiração curta (configurável).
- Rotas privadas exigem autenticação Bearer.
- Espaços só são visíveis aos respetivos membros; IDs não autorizados devolvem 404.
- Pedidos de aprovação ficam pendentes até decisão explícita do utilizador.
- Decidir uma aprovação **não executa** a ação externa.
- Eventos de autenticação, criação de espaços e aprovações ficam registados.
- Em ambientes diferentes de development, a API recusa arrancar com segredo JWT de demonstração ou registo público ativado.

## Antes de produção

Esta versão continua a ser um scaffold e **não está pronta para produção**. Antes de exposição pública, implementar migrações Alembic, rate limiting, proteção contra abuso de registo/login, recuperação de conta, rotação/revogação de sessões, política de CORS restrita, gestão de segredos, backups, monitorização e testes de segurança.

Configurar obrigatoriamente:
- `ASTRA_ENV=production`
- `ASTRA_AUTH_SECRET` com valor aleatório forte, guardado num secret manager
- `ASTRA_ALLOW_PUBLIC_REGISTRATION=false`
- `ASTRA_DATABASE_URL` com base de dados persistente
- `ASTRA_ALLOWED_ORIGINS` com os domínios exatos do dashboard

## Modelo de risco

| Classe | Exemplos | Política |
|---|---|---|
| Baixo | preparar resumo, organizar rascunhos privados | permitido dentro do escopo autorizado |
| Sensível | enviar email, publicar, partilhar, apagar, pagamentos, permissões | aprovação obrigatória |
| Proibido | contornar controlos, exfiltrar credenciais, ações ilegais | negar |

O modelo de IA nunca concede permissões. O backend valida identidade, espaço, política e aprovação.


## Google OAuth v0.6

- Authorization code flow no backend, state aleatório com hash, expiração curta e PKCE S256.
- State é consumida uma única vez; tokens e verifier são cifrados com Fernet.
- Scopes são solicitados separadamente: Classroom read-only, Gmail metadata e Drive metadata.
- Endpoints de status nunca devolvem tokens; auditoria guarda apenas fornecedor e contagens, não credenciais.
- A chave de cifragem tem de ser persistente e guardada num secret manager. A sua perda impede decifrar tokens.
- Desligar a integração remove a credencial local, mas ainda não revoga o consentimento/token junto da Google. A API informa explicitamente esta limitação.
- Gmail metadata e Drive metadata readonly são scopes restritos; verificar requisitos de OAuth verification e security assessment antes de qualquer publicação.

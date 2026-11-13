# ASTRA — Segurança

## Modelo de segurança inicial

- **Deny by default:** tudo o que não estiver explicitamente permitido é recusado.
- **Separação de funções:** o modelo propõe; o backend autoriza e executa.
- **Menor privilégio:** scopes OAuth mínimos e acesso limitado por espaço.
- **Aprovação humana:** ações sensíveis precisam de aprovação explícita, associada à ação concreta e com prazo de validade.
- **Segredos:** apenas em secret manager/variáveis protegidas do servidor; nunca no Git, logs ou frontend.
- **Auditoria:** registar ator, ação, espaço, decisão, aprovação e resultado, evitando conteúdo sensível desnecessário.
- **Resiliência:** limites de utilização, timeouts, retries idempotentes e alertas; sem mudança silenciosa de modelo.

## Classificação de risco

| Classe | Exemplos | Política |
|---|---|---|
| Baixo | organizar rascunhos privados, preparar resumo | permitido dentro do escopo autorizado |
| Sensível | enviar email, publicar, partilhar, apagar, pagamentos, permissões | aprovação obrigatória |
| Proibido | contornar controlos, exfiltrar credenciais, ações ilegais | negar |

## Antes de produção

Implementar autenticação robusta, autorização por recurso, proteção CSRF quando aplicável, validação de entradas, rate limiting, gestão e rotação de segredos, backups cifrados, monitorização, revisão de dependências e testes de segurança.

## Dados pessoais

Recolher apenas o necessário. Dados sensíveis devem ficar separados e só ser guardados com autorização explícita. Definir retenção, exportação e eliminação antes de integrar contas pessoais.

# ASTRA — Instalação autorizada em 18/11/2026

## Resultado

Instaladas as duas alterações aprovadas pelo utilizador no projeto escolar ativo:
https://script.google.com/home/projects/18XTTP6tHIr6ciGEsFh6TjHtmEfYdeeUpLHzE_7ScFqvgg0mbv7SP2Q-X/edit

- TelegramNotifications.gs: validação fail-closed do cutoff Gmail, sem redefinir a fronteira existente.
- GmailOrganization.gs: novo módulo read-only de pré-visualização, sem aplicação de etiquetas.
- Nova propriedade ASTRA_GMAIL_ORGANIZER_START_MS: 18/11/2026 12:15:53.469 UTC/Lisboa, equivalente a 1795004153469 ms.

## Verificações

Antes da alteração, Code.gs, appsscript.json e TelegramNotifications.gs coincidiam com os hashes do snapshot auditado. Após guardar e reabrir o editor:

| Ficheiro | SHA-256 instalado |
|---|---|
| TelegramNotifications.gs | e7373968d39ec336efe743aa37d53d17aa3897ec6077fb78ecfe3c359a561ac1 |
| GmailOrganization.gs | 1af68b6fd84dbb64cc7beebff55f5b56858489d552cc270b58105a3139d14cca |
| Code.gs | 776549cf80fe445dc5316b3fde21efa5c8f27374b814ba54b2dca90b1ceb54aa |
| appsscript.json | 0992bd2b38fac8a710e88ecefd837cc806a7f74027cfb2aa528ddf403b34d9ec |

Git blobs instalados coincidem exatamente com os candidatos testados no commit 24c4d575b6f6453bde3dbf36d93adeaf0a5815ec:
Telegram 6972813709aac446fec511b09569dca7439cbe56;
Gmail 2df85b3f261e0e87c2f9611e992867873763e5ff.

As dez propriedades preexistentes foram comparadas por hash antes/depois: preservadas. A nova fronteira foi confirmada após guardar; total de onze propriedades. Nenhum valor secreto foi guardado nesta documentação.

Continuam exatamente dois triggers: runMonitoringCycle e syncAstraClassroomCalendar. Nenhum foi editado/criado. Code.gs e manifest permanecem idênticos; sem mudanças OAuth.

## Testes em Apps Script

- 12:17:10–12:17:11: previewAstraGmailOrganization concluiu sem erro.
  Resultado: scanned 0, eligible 0, proposed 0, review 0, preserved 0, hasMore false, dryRun true.
  Não havia mensagens posteriores à nova fronteira nesse instante. Isto valida a configuração e o acesso, mas não mede a qualidade das classificações sobre mensagens novas.
- 12:18:22: testAstraTelegramNotificationRules concluiu, passed 8, total 8. Teste sem envio.
- Os 34 testes locais da revisão anterior permanecem a referência de regressão; os ficheiros instalados correspondem aos candidatos que passaram esses testes.
- Nenhuma função de envio ou de monitorização com efeitos foi executada manualmente neste ciclo. O próximo ciclo automático posterior à instalação ainda não foi observado neste registo.

## Limites e próximos passos

O módulo Gmail continua exclusivamente manual/read-only: não foi ligado ao monitor nem recebeu um trigger. Aguarda mensagens novas para produzir uma amostra posterior à instalação. Aplicar etiquetas e automatizar a organização exigem plano próprio e aprovação para gmail.modify.

A proteção Telegram está no caminho já utilizado pelo monitor automático. Sem reset de baseline, filas, cutoff Telegram ou dados existentes.

## Rollback

Restaurar apenas TelegramNotifications.gs a partir de google-apps-script/live-school/TelegramNotifications.gs, capturado antes da alteração. Se necessário, remover o módulo Gmail novo; a propriedade de início pode permanecer inativa. Não requer apagar, migrar ou reescrever emails ou eventos. Este registo não substitui o backup de dados.

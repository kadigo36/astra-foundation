# Propostas para revisão — sem instalação

TelegramNotifications.gs é a cópia ativa com uma única alteração funcional:
recusar envios se ASTRA_TELEGRAM_GMAIL_CUTOFF_MS faltar, estiver vazio, inválido,
não inteiro, não positivo ou no futuro. Não cria nem redefine o cutoff existente.
Rollback: restaurar só este módulo de ../live-school/TelegramNotifications.gs.

GmailOrganization.gs é um módulo novo read-only. Reutiliza etiquetas existentes,
preserva classificações, aceita correções por ID na função pura e deixa ambíguos
para revisão. Não há ainda interface/persistência de correções ou fallback Gemini.
O entrypoint previewAstraGmailOrganization precisa da nova propriedade explícita
ASTRA_GMAIL_ORGANIZER_START_MS, inteira positiva em milissegundos. Não a cria.
Após aprovação, definir o instante da instalação, para excluir o histórico.

Lê só uma página de 20 emails; hasMore identifica amostra parcial. Não é um worker
de produção. Usa gmail.readonly já presente; não lê corpos/anexos, aplica etiquetas,
marca como lido, remove INBOX/IMPORTANT, arquiva, apaga ou cria triggers.
Rollback: remover só o módulo novo. Não é necessário alterar emails.

Após aprovação: verificar hashes atuais; aplicar apenas validação Telegram e novo
módulo; definir apenas o início da pré-visualização; executar preview read-only.
Preservar OAuth, triggers, runMonitoringCycle, filas e propriedades existentes.
Aplicar etiquetas exigirá outro plano e aprovação para gmail.modify.

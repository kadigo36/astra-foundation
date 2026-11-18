/** ASTRA Telegram: manual tests only. No triggers or monitor integration. */
function astraTelegramRequest_(method, payload) {
  const token = (PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN') || '').trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN em falta.');
  let response;
  try {
    response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload || {}),
      muteHttpExceptions: true, followRedirects: false
    });
  } catch (_) {
    throw new Error('Falha de transporte Telegram. Detalhes omitidos para proteger credenciais.');
  }
  const status = response.getResponseCode();
  let data;
  try { data = JSON.parse(response.getContentText()); }
  catch (_) { throw new Error('Resposta Telegram invalida (HTTP ' + status + ').'); }
  if (status !== 200 || !data.ok) {
    throw new Error('Pedido Telegram recusado (HTTP ' + status + '). Resposta omitida.');
  }
  return data.result;
}

function testAstraTelegramConnection() {
  const bot = astraTelegramRequest_('getMe');
  if (!bot || !bot.is_bot) throw new Error('A conta Telegram nao e um bot.');
  console.log(JSON.stringify({event:'astra_telegram_connection',ok:true,username:bot.username}));
}

function setupAstraTelegramChat() {
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty('TELEGRAM_CHAT_ID')) {
    throw new Error('TELEGRAM_CHAT_ID ja existe; nao foi substituido.');
  }
  // Only the exact pairing message from a recent private chat is accepted.
  // No offset: pending updates are not acknowledged or deleted.
  const updates = astraTelegramRequest_('getUpdates', {limit:100,timeout:0});
  const now = Math.floor(Date.now() / 1000);
  const chats = {};
  updates.forEach(function(update) {
    const message = update.message;
    if (message && message.chat && message.chat.type === 'private' &&
        message.from && !message.from.is_bot && message.from.id === message.chat.id &&
        message.text === 'ASTRA LIGAR 7K9P' && now - message.date >= 0 && now - message.date <= 900) {
      chats[String(message.chat.id)] = true;
    }
  });
  const ids = Object.keys(chats);
  if (ids.length !== 1) {
    throw new Error('Emparelhamento nao unico ou em falta. Envia a frase de ligacao ao bot em privado e tenta novamente em 15 minutos.');
  }
  properties.setProperty('TELEGRAM_CHAT_ID', ids[0]);
  console.log(JSON.stringify({event:'astra_telegram_chat_configured',ok:true,chatType:'private'}));
}

function testAstraTelegramSend() {
  const chatId = (PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID') || '').trim();
  if (!/^\d+$/.test(chatId)) throw new Error('TELEGRAM_CHAT_ID privado em falta ou invalido.');
  const result = astraTelegramRequest_('sendMessage', {
    chat_id: chatId,
    text: 'ASTRA ONLINE — Primeiro teste Telegram concluido. Monitorizacao ainda nao ligada ao Telegram.',
    protect_content: true
  });
  console.log(JSON.stringify({event:'astra_telegram_send_test',ok:true,messageId:result.message_id}));
}

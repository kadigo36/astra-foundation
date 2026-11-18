/** ASTRA Telegram notifications. Disabled until explicit activation.
 * Caller holds the script lock. Events remain immutable.
 * A persisted 'sending' or 'review' state is never retried automatically.
 */
const ASTRA_TELEGRAM_QUEUE_HEADER = ['Event key','Source row','State','Updated at','Message ID'];

function astraTelegramShouldSend_(state) { return state === 'pending'; }

function astraTelegramNotificationText_(event, change) {
  const labels = {classroom:'Classroom',gmail:'Email importante',drive:'Google Drive'};
  const title = String(event.title || 'Sem titulo').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,600);
  return 'ASTRA | ' + labels[event.provider] + '\n' +
    (change === 'updated' ? 'Alteracao detetada' : 'Novidade detetada') + '\n' + title;
}

function astraTelegramQueueSheet_(book, create) {
  let sheet = book.getSheetByName('TelegramDelivery');
  if (!sheet && create) {
    sheet = book.insertSheet('TelegramDelivery');
    sheet.appendRow(ASTRA_TELEGRAM_QUEUE_HEADER);
    sheet.setFrozenRows(1);
  }
  if (sheet && JSON.stringify(sheet.getRange(1,1,1,5).getValues()[0]) !== JSON.stringify(ASTRA_TELEGRAM_QUEUE_HEADER)) {
    throw new Error('Unexpected TelegramDelivery schema; no changes made.');
  }
  return sheet;
}

// Manual activation only: excludes all current Events rows from notification.
function activateAstraTelegramNotifications() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('ASTRA busy; activation postponed.');
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('ASTRA_TELEGRAM_START_ROW') !== null) {
      throw new Error('Activation baseline already exists; automatic reset refused.');
    }
    if (!props.getProperty('TELEGRAM_BOT_TOKEN') || !/^\d+$/.test(props.getProperty('TELEGRAM_CHAT_ID') || '')) {
      throw new Error('Telegram credentials not configured.');
    }
    const id = props.getProperty(ASTRA.spreadsheetProperty);
    if (!id) throw new Error('Existing events spreadsheet required.');
    const book = SpreadsheetApp.openById(id);
    const source = book.getSheetByName('Events');
    if (!source) throw new Error('Events sheet missing.');
    astraTelegramQueueSheet_(book,true);
    props.setProperty('ASTRA_TELEGRAM_START_ROW',String(source.getLastRow()+1));
    props.setProperty('ASTRA_TELEGRAM_ENABLED','true');
    console.log(JSON.stringify({event:'astra_telegram_activation',enabled:true,historyExcluded:true}));
  } finally { lock.releaseLock(); }
}

function astraDispatchTelegramUnlocked_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ASTRA_TELEGRAM_ENABLED') !== 'true') return {status:'disabled'};
  const start = Number(props.getProperty('ASTRA_TELEGRAM_START_ROW'));
  if (!Number.isInteger(start) || start < 2) throw new Error('Invalid Telegram activation baseline.');
  const chatId = props.getProperty('TELEGRAM_CHAT_ID') || '';
  if (!/^\d+$/.test(chatId)) throw new Error('Invalid private Telegram destination.');
  const id = props.getProperty(ASTRA.spreadsheetProperty);
  if (!id) throw new Error('Existing events spreadsheet required.');
  const book = SpreadsheetApp.openById(id);
  const source = book.getSheetByName('Events');
  const classified = book.getSheetByName('EventProcessing');
  const queue = astraTelegramQueueSheet_(book,false);
  if (!source || !classified || !queue) throw new Error('Telegram source or delivery register missing.');
  if (source.getLastRow() < start-1) throw new Error('Events rows removed; notification baseline requires review.');
  const accepted = new Set(classified.getLastRow() > 1 ? classified.getRange(2,2,classified.getLastRow()-1,1).getValues().map(r=>String(r[0])) : []);
  const states = new Map();
  if (queue.getLastRow() > 1) queue.getRange(2,1,queue.getLastRow()-1,5).getValues().forEach(function(r,i) {
    const key = String(r[0]);
    if (!key || states.has(key) || ['pending','sending','sent','review'].indexOf(String(r[2])) < 0) throw new Error('Invalid Telegram delivery state.');
    states.set(key,{row:i+2,state:String(r[2])});
  });
  const rows = source.getLastRow() >= start ? source.getRange(start,1,source.getLastRow()-start+1,9).getValues() : [];
  const summary = {status:'success',sent:0,review:0,skipped:0};
  const gmailCutoffMs = Number(props.getProperty('ASTRA_TELEGRAM_GMAIL_CUTOFF_MS') || 0);
  if (!Number.isFinite(gmailCutoffMs) || gmailCutoffMs < 0) throw new Error('Invalid Gmail notification cutoff.');
  let attempted = 0;
  for (let i=0;i<rows.length && attempted<10;i++) {
    const event = normalizeAstraEvent_(rows[i]);
    if (!event) continue;
    const change = String(rows[i][8]);
    // Gmail labels can change on old mail. Notify only genuinely new mail received after the cutoff.
    if (event.provider === 'gmail') {
      const sourceMs = new Date(event.sourceDate || '').getTime();
      if (change !== 'created' || !Number.isFinite(sourceMs) || sourceMs < gmailCutoffMs) {
        summary.skipped++;
        continue;
      }
    }
    const key = astraEventKey_(rows[i],start+i);
    if (!accepted.has(key)) continue;
    let entry = states.get(key);
    if (entry && !astraTelegramShouldSend_(entry.state)) { summary.skipped++; continue; }
    if (!entry) {
      entry = {row:queue.getLastRow()+1,state:'pending'};
      queue.getRange(entry.row,1,1,5).setValues([[key,start+i,'pending',new Date(),'']]);
      SpreadsheetApp.flush();
      states.set(key,entry);
    }
    // Commit before sending: a crash or timeout requires manual review, never blind retry.
    queue.getRange(entry.row,3,1,2).setValues([['sending',new Date()]]);
    SpreadsheetApp.flush();
    entry.state = 'sending';
    attempted++;
    let result;
    try {
      result = astraTelegramRequest_('sendMessage',{chat_id:chatId,
        text:event.provider === 'classroom' ? astraClassroomNotificationText_(event,change) : astraTelegramNotificationText_(event,change),protect_content:true});
    } catch (_) {
      queue.getRange(entry.row,3,1,2).setValues([['review',new Date()]]);
      SpreadsheetApp.flush();
      entry.state = 'review';
      summary.review++;
      break; // Do not hammer Telegram on errors, including rate limits.
    }
    queue.getRange(entry.row,3,1,3).setValues([['sent',new Date(),result.message_id]]);
    SpreadsheetApp.flush();
    entry.state = 'sent';
    summary.sent++;
  }
  console.log(JSON.stringify({event:'astra_telegram_dispatch',summary:summary}));
  return summary;
}

// One-time safety baseline: emails dated before this moment are never sent.
function setAstraTelegramGmailCutoff() {
  const now = Date.now();
  PropertiesService.getScriptProperties().setProperty('ASTRA_TELEGRAM_GMAIL_CUTOFF_MS', String(now));
  console.log(JSON.stringify({event:'astra_gmail_notification_cutoff',status:'set'}));
  return {status:'set'};
}

// Read-only preview: no event contents, credentials, Sheets writes or API calls.
function previewAstraTelegramIntegration() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(ASTRA.spreadsheetProperty);
  if (!id) throw new Error('Existing spreadsheet required.');
  const book = SpreadsheetApp.openById(id);
  const source = book.getSheetByName('Events');
  const classified = book.getSheetByName('EventProcessing');
  const summary = {event:'astra_telegram_integration_preview',enabled:props.getProperty('ASTRA_TELEGRAM_ENABLED')==='true',
    activationBaselineExists:props.getProperty('ASTRA_TELEGRAM_START_ROW')!==null,
    sourceEvents:source ? Math.max(0,source.getLastRow()-1):0,
    classifiedEvents:classified ? Math.max(0,classified.getLastRow()-1):0,
    deliveryRegisterExists:!!astraTelegramQueueSheet_(book,false)};
  console.log(JSON.stringify(summary));
  return summary;
}

function testAstraTelegramNotificationRules() {
  const checks = [];
  ['sending','sent','review','unknown',''].forEach(function(state) { checks.push(!astraTelegramShouldSend_(state)); });
  checks.push(astraTelegramShouldSend_('pending'));
  const text = astraTelegramNotificationText_({provider:'gmail',title:'Teste\nseguro',metadata:'PRIVATE_METADATA'},'updated');
  checks.push(text.indexOf('PRIVATE_METADATA')===-1 && text.indexOf('Alteracao detetada')!==-1);
  checks.push(astraTelegramNotificationText_({provider:'drive',title:'x'.repeat(5000)},'created').length<800);
  if (!checks.every(Boolean)) throw new Error('Telegram notification rule test failed.');
  console.log(JSON.stringify({event:'astra_telegram_rules_test',passed:checks.length,total:checks.length}));
}

/** ASTRA Gmail organisation preview. Read-only; never applies or removes labels.
 * Installation and a non-retroactive start boundary must be reviewed separately.
 * Rules use metadata only. Ambiguous mail is held for review, never sent to AI.
 */
const ASTRA_GMAIL_ORGANIZATION_LABELS = [
  'Escola/Classroom', 'Escola/Comunicações', 'Projetos',
  'Tecnologia e serviços', 'Contas e segurança', 'Ficheiros e calendário',
  'Promoções/Outras', 'Promoções/AliExpress', 'Promoções/Pinterest', 'Outros'
];

function astraClassifyGmailMetadata_(message, corrections) {
  if (!message || typeof message.id !== 'string' || !message.id) throw Error('Missing message identity.');
  const correction = corrections && Object.prototype.hasOwnProperty.call(corrections, message.id) ? corrections[message.id] : null;
  if (correction) {
    if (ASTRA_GMAIL_ORGANIZATION_LABELS.indexOf(correction) < 0) throw Error('Unknown correction label.');
    return {label:correction, reason:'user_correction', review:false};
  }
  const existing = (message.labelNames || []).filter(x => ASTRA_GMAIL_ORGANIZATION_LABELS.indexOf(x) >= 0);
  if (existing.length) return {label:null,reason:'existing_classification_preserved',review:false};
  const from = String(message.from || '').trim();
  const address = (from.match(/<([^<>]+)>\s*$/) || [null, from])[1].toLowerCase();
  if (!/^[^\s<>@]+@[^\s<>@]+$/.test(address)) return {label:null,reason:'invalid_sender',review:true};
  const domain = address.split('@')[1];
  const subject = String(message.subject || '').toLowerCase();
  // These categories take precedence over promotional or school routing.
  if (/security|segurança|password|palavra.passe|verifica.{0,8}conta|início de sessão|sign.in|código de acesso/.test(subject)) {
    return {label:'Contas e segurança',reason:'security_subject',review:false};
  }
  if (domain === 'classroom.google.com') return {label:'Escola/Classroom',reason:'classroom_sender',review:false};
  if (domain === 'esfundao.pt' || domain.endsWith('.esfundao.pt')) return {label:'Escola/Comunicações',reason:'school_sender',review:false};
  if (domain === 'pinterest.com' || domain.endsWith('.pinterest.com')) return {label:'Promoções/Pinterest',reason:'pinterest_sender',review:false};
  if (domain === 'aliexpress.com' || domain.endsWith('.aliexpress.com')) return {label:'Promoções/AliExpress',reason:'aliexpress_sender',review:false};
  if (domain === 'github.com' || domain.endsWith('.github.com')) return {label:'Projetos',reason:'github_sender',review:false};
  if ((message.labelNames || []).indexOf('CATEGORY_PROMOTIONS') >= 0) return {label:'Promoções/Outras',reason:'gmail_promotions',review:false};
  return {label:null,reason:'semantic_review_required',review:true};
}

function astraPreviewGmailRows_(messages, startMs, nowMs, corrections) {
  if (!Number.isSafeInteger(startMs) || startMs <= 0 || !Number.isFinite(nowMs) || startMs > nowMs) {
    throw Error('Explicit valid organisation start boundary required.');
  }
  const seen = new Set();
  const result = [];
  messages.forEach(function(message) {
    if (!message.id || seen.has(message.id)) return;
    seen.add(message.id);
    const received = Number(message.internalDate);
    if (!Number.isSafeInteger(received) || received < startMs || received > nowMs) return;
    result.push({messageId:message.id,decision:astraClassifyGmailMetadata_(message, corrections)});
  });
  return result;
}

function previewAstraGmailOrganization() {
  const raw = PropertiesService.getScriptProperties().getProperty('ASTRA_GMAIL_ORGANIZER_START_MS');
  if (!raw || !/^[0-9]+$/.test(raw)) throw Error('Organisation preview start boundary is not configured.');
  const start = Number(raw), now = Date.now();
  // Validate before any Google call. No automatic baseline creation/reset.
  astraPreviewGmailRows_([], start, now);
  const base = 'https://gmail.googleapis.com/gmail/v1/users/me/';
  const labels = googleGet_(base + 'labels').labels || [];
  const names = {};
  labels.forEach(l => { names[l.id] = l.name; });
  const list = googleGet_(base + 'messages?maxResults=20&q=' + encodeURIComponent('after:' + Math.floor(start / 1000) + ' -in:spam -in:trash'));
  const messages = (list.messages || []).map(function(item) {
    const m = googleGet_(base + 'messages/' + encodeURIComponent(item.id) + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject');
    const headers = m.payload && m.payload.headers || [];
    return {id:m.id,internalDate:m.internalDate,from:findHeader_(headers,'from'),subject:findHeader_(headers,'subject'),labelNames:(m.labelIds || []).map(id => names[id] || id)};
  });
  const result = astraPreviewGmailRows_(messages, start, now);
  const summary = {event:'astra_gmail_organization_preview',accountId:ASTRA.accountId,scanned:messages.length,eligible:result.length,proposed:0,review:0,preserved:0,hasMore:!!list.nextPageToken,dryRun:true};
  result.forEach(r => { if(r.decision.review) summary.review++; else if(r.decision.label) summary.proposed++; else summary.preserved++; });
  console.log(JSON.stringify(summary));
  return {summary:summary,decisions:result};
}

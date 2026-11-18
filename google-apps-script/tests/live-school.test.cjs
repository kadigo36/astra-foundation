const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const snapshot = path.join(root, 'live-school');

function context(extra = {}, candidate = false) {
  const c = vm.createContext({ Date, Logger:{log(){}},console:{log(){},warn(){},error(){}},
    UrlFetchApp:{fetch(){throw Error('Unexpected real-network attempt');}},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
      computeDigest:(_,value)=>Array.from(crypto.createHash('sha256').update(value).digest()),
      formatDate(date,zone,format) {
        assert.equal(format, 'yyyy-MM-dd');
        const parts = new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
        return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
      }},...extra});
  for (const name of ['Code.gs','EventProcessor.gs','ClassroomNotificationPreview.gs','ClassroomCalendar.gs','TelegramNotifications.gs']) {
    const dir=candidate && name==='TelegramNotifications.gs' ? path.join(root,'candidates') : snapshot;
    vm.runInContext(fs.readFileSync(path.join(dir,name),'utf8'),c,{filename:name});
  }
  vm.runInContext(fs.readFileSync(path.join(root,'candidates/GmailOrganization.gs'),'utf8'),c);
  return c;
}
function sheet(rows, onWrite=()=>{}) {
  return { rows, getLastRow:()=>rows.length,getRange(r,col,h,w){return {
    getValues:()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>rows[r+i-1]?.[col+j-1]??'')),
    setValues(values){onWrite(); values.forEach((v,i)=>{rows[r+i-1] ||= [];v.forEach((x,j)=>rows[r+i-1][col+j-1]=x);});}
  };}};
}
const eventHeader=['Detected at','Provider','Title','Metadata','External ID','Source date','Open','Event key','Change type'];
function monitor() {
  const state=new Map([['ASTRA_EVENTS_SPREADSHEET_ID','existing'],['ASTRA_SEEN_GMAIL','["known"]']]);
  const faults={}; const calls=[];
  const events=sheet([eventHeader.slice()],()=>{calls.push('event');if(faults.event) throw Error('event failed');});
  const durable=sheet([['Provider','External ID','Revision','Fingerprint']],()=>{calls.push('state');if(faults.state) throw Error('state failed');});
  const book={getSheetByName:n=>n==='Events'?events:n==='MonitorStateV09'?durable:null};
  const c=context({PropertiesService:{getScriptProperties:()=>({getProperty:k=>state.get(k)??null,setProperty(){throw Error('Legacy state must not change');}})},
    SpreadsheetApp:{openById(){if(faults.open) throw Error('unavailable');return book;},create(){throw Error('No replacement');},flush(){calls.push('flush');}},
    LockService:{getScriptLock:()=>({tryLock:()=>!faults.lock,releaseLock(){calls.push('unlock');}})}});
  const item={id:'new',title:'Synthetic message',createdAt:'2026-11-18T10:00:00Z',revision:'[]'};
  return {c,state,faults,events,durable,calls,item,run:()=>c.recordNewItems_('gmail',[item])};
}
function telegram(candidate, cutoff, deliveryState) {
  const state=new Map([['ASTRA_TELEGRAM_ENABLED','true'],['ASTRA_TELEGRAM_START_ROW','2'],['TELEGRAM_CHAT_ID','123'],['ASTRA_EVENTS_SPREADSHEET_ID','existing']]);
  if(cutoff!==undefined) state.set('ASTRA_TELEGRAM_GMAIL_CUTOFF_MS',cutoff);
  const events=sheet([eventHeader.slice(),[new Date(),'gmail','Synthetic subject','','message-id','2026-11-18T10:00:00Z','','event-key','created']]);
  const accepted=sheet([['Processed at','Event key'],['','event-key']]);
  const queue=sheet([['Event key','Source row','State','Updated at','Message ID']]);
  if(deliveryState) queue.rows.push(['event-key',2,deliveryState,new Date(),'']);
  let sent=0;
  const c=context({PropertiesService:{getScriptProperties:()=>({getProperty:k=>state.get(k)??null})},SpreadsheetApp:{openById:()=>({getSheetByName:n=>({Events:events,EventProcessing:accepted,TelegramDelivery:queue}[n])}),flush(){}}},candidate);
  c.astraTelegramRequest_=()=>{sent++;return {message_id:42};};
  return {c,events,queue,get sent(){return sent;},run:()=>c.astraDispatchTelegramUnlocked_()};
}

test('nine source files match the recorded snapshot hashes',()=>{
  const meta=JSON.parse(fs.readFileSync(path.join(snapshot,'snapshot.json')));
  assert.equal(Object.keys(meta.files).length,9);
  for(const [name,m] of Object.entries(meta.files)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(snapshot,name))).digest('hex'),m.sha256);
});
for(const name of ['testAstraDeadlinePriority','testAstraClassroomActionEngine','testAstraTelegramNotificationRules','testAstraClassroomNotificationDetails','testAstraCalendarRules']) {
  test('existing pure rule suite: '+name,()=>context()[name]());
}
test('live recorder persists and flushes event before durable state',()=>{
  const h=monitor();assert.equal(h.run().newEvents,1);
  assert.deepEqual(h.calls.slice(0,4),['event','event','flush','state']); // first write verifies extension headers
  assert.equal(h.state.get('ASTRA_SEEN_GMAIL'),'["known"]');
});
test('live recorder recovers after event persistence and state failure without duplicate event',()=>{
  const h=monitor();h.faults.state=true;assert.throws(h.run,/state failed/);assert.equal(h.events.rows.length,2);
  h.faults.state=false;assert.equal(h.run().recoveredEvents,1);assert.equal(h.events.rows.length,2);
  assert.equal(h.run().newEvents,0);
});
test('sheet access failure preserves configured destination',()=>{
  const h=monitor();h.faults.open=true;assert.throws(h.run,/destination preserved/);assert.equal(h.state.get('ASTRA_EVENTS_SPREADSHEET_ID'),'existing');
});
test('direct recorder calls reject overlap before data access',()=>{
  const h=monitor();h.faults.lock=true;assert.throws(h.run,/busy/);assert.deepEqual(h.calls,[]);
});
test('actual installed cutoff blocks old mail',()=>{
  const h=telegram(false,'1794839940228');h.events.rows[1][5]='2026-05-16T12:00:00Z';assert.equal(h.run().sent,0);assert.equal(h.sent,0);
});
test('label-change update is not sent as new Gmail',()=>{
  const h=telegram(false,'1794839940228');h.events.rows[1][8]='updated';assert.equal(h.run().sent,0);
});
test('reproduce current missing-cutoff weakness with mock transport only',()=>{
  const h=telegram(false,undefined);h.events.rows[1][5]='2026-05-16T12:00:00Z';h.run();assert.equal(h.sent,1);
});
test('candidate blocks missing, empty, malformed, zero, unsafe and future cutoff before writes',()=>{
  for(const cutoff of [undefined,'','0','-1','NaN','1e3','1000.1','9007199254740992',String(Date.now()+86400000)]) {
    const h=telegram(true,cutoff);assert.throws(h.run,/cutoff missing or invalid/);assert.equal(h.sent,0);assert.equal(h.queue.rows.length,1);
  }
});
test('candidate preserves valid cutoff and sends once',()=>{
  const h=telegram(true,'1794839940228');assert.equal(h.run().sent,1);assert.equal(h.run().sent,0);assert.equal(h.sent,1);
});
test('sending, review and sent deliveries never resend automatically',()=>{
  for(const state of ['sending','review','sent']){const h=telegram(true,'1794839940228',state);h.run();assert.equal(h.sent,0);}
});
test('Classroom calendar IDs remain stable when title or deadline changes',()=>{
  const c=context();let title='First',day=20;c.astraListAll_=(_,field)=>field==='courses'?[{id:'1',name:'Synthetic course'}]:[{id:'2',state:'PUBLISHED',title,dueDate:{year:2026,month:11,day}}];
  const a=c.astraCalendarEntries_(new Date('2026-11-18'));title='Changed';day=21;const b=c.astraCalendarEntries_(new Date('2026-11-18'));
  assert.equal(a[0].id,b[0].id);assert.notEqual(a[0].summary,b[0].summary);assert.notEqual(a[0].start.date,b[0].start.date);
});
test('Gmail preview respects manual correction and existing classification',()=>{
  const c=context();assert.equal(c.astraClassifyGmailMetadata_({id:'a',from:'x@esfundao.pt'},{a:'Projetos'}).label,'Projetos');
  assert.equal(c.astraClassifyGmailMetadata_({id:'a',from:'x@esfundao.pt',labelNames:['Outros']}).label,null);
});
test('Gmail school domain match rejects lookalike domains and malformed sender',()=>{
  const c=context();assert.equal(c.astraClassifyGmailMetadata_({id:'a',from:'x@esfundao.pt'}).label,'Escola/Comunicações');
  assert.equal(c.astraClassifyGmailMetadata_({id:'a',from:'x@esfundao.pt.evil.example'}).review,true);
  assert.equal(c.astraClassifyGmailMetadata_({id:'a',from:'not-an-address'}).review,true);
});
test('security subject takes precedence over promotional routing',()=>{
  const c=context();assert.equal(c.astraClassifyGmailMetadata_({id:'a',from:'x@pinterest.com',subject:'Alerta de segurança'}).label,'Contas e segurança');
});
test('Gmail preview excludes history, invalid dates and duplicate IDs',()=>{
  const c=context();const r=c.astraPreviewGmailRows_([{id:'a',internalDate:'1000',from:'x@esfundao.pt'},{id:'b',internalDate:'2000',from:'x@esfundao.pt'},{id:'b',internalDate:'2000'},{id:'c',internalDate:'bad'}],1500,3000);
  assert.equal(r.length,1);assert.equal(r[0].messageId,'b');assert.throws(()=>c.astraPreviewGmailRows_([],0,3000));
});
test('Gmail preview refuses absent baseline before any API request or write',()=>{
  const c=context({PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})}});c.googleGet_=()=>{throw Error('API must not be called');};
  assert.throws(()=>c.previewAstraGmailOrganization(),/start boundary is not configured/);
});

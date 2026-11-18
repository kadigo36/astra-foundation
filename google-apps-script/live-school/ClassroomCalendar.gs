/** ASTRA Classroom → personal calendar. Manual until enabled and authorized. */
const ASTRA_CLASSROOM_CALENDAR_ID = '3d09d14a9f571efe15c6ef22af564978900d7db568ed6abb793eff7edb419e5f@group.calendar.google.com';

function astraCalendarDue_(work, now) {
  if (!work.dueDate) return null;
  const d=work.dueDate;
  const date=[String(d.year).padStart(4,'0'),String(d.month).padStart(2,'0'),String(d.day).padStart(2,'0')].join('-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid deadline date');
  if (!work.dueTime) {
    if (date < Utilities.formatDate(now,'Europe/Lisbon','yyyy-MM-dd')) return null;
    const next=new Date(Date.UTC(d.year,d.month-1,d.day+1));
    return {start:{date:date},end:{date:Utilities.formatDate(next,'UTC','yyyy-MM-dd')}};
  }
  const end=new Date(getAstraClassroomDueDate_(work));
  if (end.getTime() <= now.getTime()) return null;
  const start=new Date(end.getTime()-15*60*1000);
  return {start:{dateTime:start.toISOString()},end:{dateTime:end.toISOString()}};
}
function astraCalendarEntries_(now) {
  const courses=astraListAll_('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize='+ASTRA.maxCourses,'courses');
  const entries=[];
  courses.forEach(function(c) {
    const base='https://classroom.googleapis.com/v1/courses/'+encodeURIComponent(c.id)+'/courseWork?pageSize='+ASTRA.maxCourseWorkPerCourse;
    astraListAll_(base,'courseWork').forEach(function(w) {
      if (!w.id || w.state !== 'PUBLISHED') return;
      const due=astraCalendarDue_(w,now);
      if (!due) return;
      const key=astraHash_(JSON.stringify([c.id,w.id]));
      entries.push({id:'a'+key,summary:'Entrega: '+String(w.title || 'Sem título').slice(0,500),
        description:'Disciplina: '+String(c.name || '')+'\nClassroom: '+String(w.alternateLink || '')+'\nASTRA_CLASSROOM_KEY:'+key,
        start:due.start,end:due.end,transparency:'transparent',visibility:'private'});
    });
  });
  return entries;
}
function previewAstraClassroomCalendar() {
  const entries=astraCalendarEntries_(new Date());
  const result={event:'astra_calendar_preview',futureDeadlines:entries.length,timed:entries.filter(e=>!!e.start.dateTime).length,allDay:entries.filter(e=>!!e.start.date).length};
  console.log(JSON.stringify(result)); return result;
}
function astraCalendarRequest_(method,url,payload) {
  const options={method:method,headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true};
  if (payload) { options.contentType='application/json'; options.payload=JSON.stringify(payload); }
  const response=UrlFetchApp.fetch(url,options), status=response.getResponseCode();
  return {status:status,data:status===404?null:JSON.parse(response.getContentText() || '{}')};
}
function syncAstraClassroomCalendar() {
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(1000)) { console.log('ASTRA busy; calendar sync skipped'); return; }
  try {
    const entries=astraCalendarEntries_(new Date());
    const base='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(ASTRA_CLASSROOM_CALENDAR_ID)+'/events';
    const result={event:'astra_calendar_sync',scanned:entries.length,created:0,updated:0,unchanged:0,errors:0};
    entries.forEach(function(e) {
      try {
        const existing=astraCalendarRequest_('get',base+'/'+e.id);
        if (existing.status===404) {
          const created=astraCalendarRequest_('post',base,e);
          if (created.status<200 || created.status>=300) throw new Error('create failed');
          result.created++; return;
        }
        if (existing.status!==200 || String(existing.data.description || '').indexOf('ASTRA_CLASSROOM_KEY:'+e.id.slice(1))<0) throw new Error('event identity conflict');
        const old=existing.data;
        if (old.summary===e.summary && old.description===e.description && astraCalendarSameTime_(old.start,e.start) && astraCalendarSameTime_(old.end,e.end)) {result.unchanged++; return;}
        const updated=astraCalendarRequest_('patch',base+'/'+e.id,{summary:e.summary,description:e.description,start:e.start,end:e.end,transparency:e.transparency,visibility:e.visibility});
        if (updated.status<200 || updated.status>=300) throw new Error('update failed');
        result.updated++;
      } catch (_) { result.errors++; }
    });
    console.log(JSON.stringify(result)); return result;
  } finally {lock.releaseLock();}
}

function testAstraCalendarAccess() {
  const url='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(ASTRA_CLASSROOM_CALENDAR_ID)+'/events?maxResults=1';
  const r=astraCalendarRequest_('get',url);
  console.log(JSON.stringify({event:'astra_calendar_access',status:r.status,ok:r.status===200}));
  if(r.status!==200) throw new Error('Calendar access failed: HTTP '+r.status);
}

function diagnoseAstraCalendarAccess() {
  const url='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(ASTRA_CLASSROOM_CALENDAR_ID)+'/events?maxResults=1';
  const r=astraCalendarRequest_('get',url);
  const error=r.data && r.data.error || {};
  console.log(JSON.stringify({event:'astra_calendar_access_diagnostic',status:r.status,reasons:(error.errors||[]).map(x=>x.reason),message:String(error.message||'').slice(0,500)}));
}

function astraCalendarSameTime_(a,b) {
  if (a.date || b.date) return a.date === b.date;
  return !!a.dateTime && !!b.dateTime && new Date(a.dateTime).getTime() === new Date(b.dateTime).getTime();
}
function testAstraCalendarRules() {
  const now=new Date('2026-11-16T12:00:00Z');
  const past=astraCalendarDue_({dueDate:{year:2026,month:11,day:15}},now);
  const all=astraCalendarDue_({dueDate:{year:2026,month:11,day:20}},now);
  const timed=astraCalendarDue_({dueDate:{year:2026,month:11,day:20},dueTime:{hours:14}},now);
  if(past!==null || all.start.date!=='2026-11-20' || all.end.date!=='2026-11-21' || timed.end.dateTime!=='2026-11-20T14:00:00.000Z' || !astraCalendarSameTime_({dateTime:'2026-11-20T14:00:00Z',timeZone:'Europe/Lisbon'},timed.end)) throw Error('Calendar rules failed');
  console.log(JSON.stringify({event:'astra_calendar_rules',passed:true}));
}
function installAstraCalendarSync() {
  const existing=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='syncAstraClassroomCalendar');
  if(existing.length>1) throw Error('Duplicate calendar triggers; review required');
  if(existing.length===0) ScriptApp.newTrigger('syncAstraClassroomCalendar').timeBased().everyMinutes(15).create();
  console.log(JSON.stringify({event:'astra_calendar_trigger',alreadyPresent:existing.length===1}));
}

/** Isolated Classroom notification diagnostics. Does not send or alter events. */
function previewAstraClassroomNotificationReadiness() {
  const courses = astraListAll_('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=' + ASTRA.maxCourses, 'courses');
  const result = {event:'astra_classroom_notification_readiness', courses:0, tasks:0, withDeadline:0, withLink:0, submissionKnown:0, submissionUnknown:0, errors:0};
  for (const course of courses.slice(0, 3)) {
    try {
      const base = 'https://classroom.googleapis.com/v1/courses/' + encodeURIComponent(course.id) + '/courseWork';
      const works = astraListAll_(base + '?pageSize=' + ASTRA.maxCourseWorkPerCourse, 'courseWork');
      result.courses++;
      for (const work of works.slice(0, 5)) {
        result.tasks++;
        if (work.dueDate) result.withDeadline++;
        if (work.alternateLink) result.withLink++;
        try {
          const submissions = googleGet_(base + '/' + encodeURIComponent(work.id) + '/studentSubmissions?userId=me&pageSize=10');
          if ((submissions.studentSubmissions || []).length === 1 && !submissions.nextPageToken) result.submissionKnown++;
          else result.submissionUnknown++;
        } catch (_) { result.submissionUnknown++; }
      }
    } catch (_) { result.errors++; }
  }
  console.log(JSON.stringify(result));
  return result;
}

/** Builds Classroom detail messages; lookup failures are shown as unknown. */
function astraClassroomMessage_(event, change, work, submission) {
  const clean = value => String(value || '').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,500);
  const lines = ['ASTRA | Classroom', change === 'updated' ? 'Alteração detetada' : 'Novidade detetada',
    'Tarefa: ' + (clean(event.title) || 'Sem título'), 'Disciplina: ' + (clean(event.metadata) || 'Desconhecida')];
  if (work && work.dueDate) {
    const d = work.dueDate;
    if (work.dueTime) {
      const deadline = getAstraClassroomDueDate_(work);
      lines.push('Prazo: ' + Utilities.formatDate(new Date(deadline), 'Europe/Lisbon', 'dd/MM/yyyy HH:mm') + ' (Lisboa)');
    } else lines.push('Prazo: ' + String(d.day).padStart(2,'0') + '/' + String(d.month).padStart(2,'0') + '/' + d.year + ' (hora não indicada)');
  } else lines.push(work ? 'Prazo: sem prazo indicado' : 'Prazo: indisponível');
  const states = {NEW:'Por entregar',CREATED:'Por entregar',RECLAIMED_BY_STUDENT:'Por entregar',TURNED_IN:'Entregue',RETURNED:'Devolvido pelo professor'};
  lines.push('Entrega: ' + (submission && states[submission.state] || 'Desconhecida'));
  const url = String(event.url || '');
  if (/^https:\/\/classroom\.google\.com\//i.test(url)) lines.push('Abrir: ' + url);
  return lines.join('\n');
}
function astraClassroomNotificationText_(event, change) {
  const parts = String(event.externalId || '').split(':');
  let work = null, submission = null;
  if (parts.length === 2 && parts.every(x => /^[0-9]+$/.test(x))) {
    const base = 'https://classroom.googleapis.com/v1/courses/' + encodeURIComponent(parts[0]) + '/courseWork/' + encodeURIComponent(parts[1]);
    try { work = googleGet_(base); } catch (_) {}
    try {
      const response = googleGet_(base + '/studentSubmissions?userId=me&pageSize=10');
      if ((response.studentSubmissions || []).length === 1 && !response.nextPageToken) submission = response.studentSubmissions[0];
    } catch (_) {}
  }
  return astraClassroomMessage_(event, change, work, submission);
}
function testAstraClassroomNotificationDetails() {
  const e = {title:'Exercício',metadata:'Programação',url:'https://classroom.google.com/c/test'};
  const a = astraClassroomMessage_(e,'created',{dueDate:{year:2026,month:11,day:20}}, {state:'TURNED_IN'});
  const b = astraClassroomMessage_({title:'X',url:'https://example.com'},'updated',null,null);
  if (!a.includes('20/11/2026 (hora não indicada)') || !a.includes('Entrega: Entregue') || !a.includes('Disciplina: Programação') || !a.includes('https://classroom.google.com/') || !b.includes('Entrega: Desconhecida') || b.includes('example.com')) throw new Error('Classroom message test failed');
  console.log(JSON.stringify({event:'astra_classroom_message_tests',passed:true}));
}


// Manual test: selects one real assignment; does not change monitoring state.
function testAstraClassroomTelegramReal() {
  const courses = astraListAll_('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=' + ASTRA.maxCourses,'courses');
  for (const course of courses) {
    const base = 'https://classroom.googleapis.com/v1/courses/' + encodeURIComponent(course.id) + '/courseWork';
    const works = astraListAll_(base + '?pageSize=' + ASTRA.maxCourseWorkPerCourse,'courseWork');
    if (!works.length) continue;
    const work = works[0];
    const event = {provider:'classroom',externalId:course.id + ':' + work.id,title:work.title || '',metadata:course.name || '',url:work.alternateLink || ''};
    const message = '[TESTE MANUAL — tarefa existente]\n' + astraClassroomNotificationText_(event,'created');
    const id = PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID') || '';
    if (!/^\d+$/.test(id)) throw new Error('Destino Telegram inválido');
    astraTelegramRequest_('sendMessage',{chat_id:id,text:message,protect_content:true});
    console.log(JSON.stringify({event:'astra_classroom_real_notification_test',sent:true}));
    return;
  }
  throw new Error('Nenhuma tarefa disponível para o teste.');
}

/**
 * SAT practice site — results receiver (one Google Sheet per student).
 * Paste this whole file into Extensions → Apps Script of your results Google Sheet.
 * Choose your own long random tutor key before deploying. Preserve it on updates.
 */
const TUTOR_KEY = 'REPLACE_WITH_YOUR_OWN_LONG_RANDOM_KEY';

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const a = JSON.parse(e.postData.contents);
    if (a.kind === 'vocab-add') return vocabAdd_(a);
    if (a.kind === 'vocab-review') return vocabReview_(a);
    if (a.kind === 'feedback') return feedback_(a);
    if (a.kind === 'feedback-status') return feedbackStatus_(a);
    if (a.kind === 'feedback-reply') return feedbackReply_(a);
    if (a.kind === 'feedback-read') return feedbackRead_(a);
    if (a.kind === 'review') return review_(a);
    if (!a.id || !a.setId || !Array.isArray(a.items)) return json_({ ok: false, error: 'bad payload' });
    const att = sheet_('Attempts', ['Submitted', 'Student', 'Set', 'Score', 'Out of', '%', 'Total time (min)',
      'Avg sec / question', 'Off-tab (min)', 'Timed out', 'Attempt ID', 'Raw JSON']);
    // a resend after a dropped connection must not create a duplicate row
    const ids = att.getLastRow() > 1 ? att.getRange(2, 11, att.getLastRow() - 1, 1).getValues().flat() : [];
    if (ids.indexOf(a.id) === -1) {
      att.appendRow([new Date(a.submittedAt), a.student, a.setTitle, a.score, a.total,
        a.total ? Math.round(100 * a.score / a.total) : 0, round1_(a.totalSeconds / 60),
        Math.round(a.totalSeconds / Math.max(1, a.items.length)), round1_(a.awaySeconds / 60),
        a.timedOut ? 'yes' : '', a.id, JSON.stringify(a)]);
      const qs = sheet_('Questions', ['Submitted', 'Set', 'Q#', 'Answer', 'Correct', 'Result',
        'Seconds', 'First pick', 'Changes', 'Marked', 'Attempt ID']);
      const rows = a.items.map(it => [new Date(a.submittedAt), a.setTitle, it.n, it.ans || '', it.key || '',
        it.key == null ? 'unscored' : !it.ans ? 'blank' : it.ok ? 'correct' : 'WRONG',
        it.sec, it.first || '', it.changes || 0, it.marked ? 'yes' : '', a.id]);
      if (rows.length) qs.getRange(qs.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  if (e.parameter.kind === 'vocab') return vocabList_(e.parameter);
  if (e.parameter.kind === 'feedback-student') return feedbackStudent_(e.parameter);
  if ((e.parameter.key || '') !== TUTOR_KEY) return json_({ ok: false, error: 'bad key' });
  if (e.parameter.kind === 'feedback') {
    const sh = SpreadsheetApp.getActive().getSheetByName('Student questions');
    const raw = !sh || sh.getLastRow() < 2 ? [] : sh.getRange(2, 9, sh.getLastRow() - 1, 1).getValues().flat();
    return json_({ ok: true, threadsVersion:1, studentToken:feedbackToken_(), reports: raw.filter(String).map(r => JSON.parse(r)) });
  }
  if (e.parameter.kind === 'review') {
    const rv = SpreadsheetApp.getActive().getSheetByName('Error log');
    if (!rv || rv.getLastRow() < 2) return json_({ ok: true, reviews: [] });
    const rr = rv.getRange(2, 15, rv.getLastRow() - 1, 1).getValues().flat();
    return json_({ ok: true, reviews: rr.filter(String).map(r => JSON.parse(r)) });
  }
  const att = SpreadsheetApp.getActive().getSheetByName('Attempts');
  if (!att || att.getLastRow() < 2) return json_({ ok: true, attempts: [] });
  const raw = att.getRange(2, 12, att.getLastRow() - 1, 1).getValues().flat();
  return json_({ ok: true, attempts: raw.filter(String).map(r => JSON.parse(r)) });
}

// One row each time the student first opens a card's explanation in the error log
function review_(r) {
  if (!r.id || !r.set || !r.qid) return json_({ ok: false, error: 'bad payload' });
  const sh = sheet_('Error log', ['Checked', 'Student', 'Set', 'Card', 'Twin/original', 'Original Q', 'Skill',
    'Answer', 'Correct', 'Result', 'First pick', 'Changes', 'Timer (sec)', 'Round', 'Raw JSON', 'Record ID']);
  const ids = sh.getLastRow() > 1 ? sh.getRange(2, 16, sh.getLastRow() - 1, 1).getValues().flat() : [];
  if (ids.indexOf(r.id) === -1) {
    sh.appendRow([new Date(r.at), r.student, r.setTitle, r.card, r.type, r.origNum, r.skill,
      r.pick || '', r.key, !r.pick ? 'no answer' : r.ok ? 'correct' : 'WRONG', r.first || '',
      r.changes || 0, r.sec || 0, r.round || 1, JSON.stringify(r), r.id]);
  }
  return json_({ ok: true });
}

// Store untrusted free text as literal sheet text, never as a formula.
function feedbackText_(s) { return "'" + String(s == null ? '' : s); }
function feedback_(a) {
  if (typeof a.id !== 'string' || !/^fb_[a-zA-Z0-9_-]{1,100}$/.test(a.id) ||
      typeof a.message !== 'string' || !a.message.trim() || a.message.length > 3000 ||
      !a.context || typeof a.context.qid !== 'string' || JSON.stringify(a).length > 60000) {
    return json_({ ok: false, error: 'bad feedback payload' });
  }
  const sh = sheet_('Student questions', ['Received', 'Student', 'Set', 'Question', 'Selected answer', 'Category', 'Message', 'Status', 'Raw JSON', 'Report ID']);
  const ids = sh.getLastRow() > 1 ? sh.getRange(2, 10, sh.getLastRow() - 1, 1).getValues().flat() : [];
  if (ids.indexOf(a.id) === -1) {
    const r = { kind:'feedback', id:a.id, student:String(a.student || '').slice(0,100),
      at:new Date().toISOString(), category:String(a.category || 'Question').slice(0,100),
      message:a.message.trim(), context:a.context, status:'New', replies:[] };
    sh.appendRow([new Date(), feedbackText_(r.student), feedbackText_(r.context.setTitle),
      feedbackText_(r.context.label || r.context.qid), feedbackText_(r.context.answer),
      feedbackText_(r.category), feedbackText_(r.message), r.status, JSON.stringify(r), r.id]);
  }
  return json_({ ok:true, feedbackId:a.id });
}
function feedbackStatus_(a) {
  if (a.key !== TUTOR_KEY) return json_({ ok:false, error:'bad key' });
  if (['New','Resolved'].indexOf(a.status) === -1) return json_({ ok:false, error:'bad status' });
  const sh = SpreadsheetApp.getActive().getSheetByName('Student questions');
  if (sh && sh.getLastRow() > 1) {
    const ids = sh.getRange(2, 10, sh.getLastRow() - 1, 1).getValues().flat();
    const i = ids.indexOf(a.id);
    if (i !== -1) {
      const row = i + 2, r = JSON.parse(sh.getRange(row,9).getValue());
      r.status = a.status;
      sh.getRange(row,8,1,2).setValues([[a.status,JSON.stringify(r)]]);
      return json_({ ok:true });
    }
  }
  return json_({ ok:false, error:'report not found' });
}

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function round1_(x) { return Math.round(x * 10) / 10; }
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Vocabulary is visible to visitors of this student's site; only the tutor can
// publish definitions. Each student's deployment is bound to a different Sheet.
function vocabRows_() {
  const sh=SpreadsheetApp.getActive().getSheetByName('Vocabulary');
  return !sh||sh.getLastRow()<2?[]:sh.getRange(2,12,sh.getLastRow()-1,1).getValues().flat().filter(String).map(x=>JSON.parse(x));
}
function vocabList_(p) {
  if(p.key && p.key!==TUTOR_KEY)return json_({ok:false,error:'bad key'});
  return json_({ok:true,entries:vocabRows_()});
}
function vocabSignature_(e) {
  const c=e.context;
  return JSON.stringify([e.expression.normalize('NFC').toLowerCase().replace(/\s+/g,' ').trim(),c.source,c.setId,c.qid,c.area]);
}
function vocabSheet_() {
  return sheet_('Vocabulary',['Added','Student','Expression','Set','Question','Location','Original context','Status','Definition','Example','Entry ID','Raw JSON']);
}
function vocabAdd_(a) {
  const c=a.context;
  if(typeof a.id!=='string'||!/^v_[a-zA-Z0-9_-]{1,100}$/.test(a.id)||typeof a.expression!=='string'||!a.expression.trim()||a.expression.length>180||a.expression.trim().split(/\s+/).length>12||!c||!['results','errorlog'].includes(c.source)||['setId','qid','area','setTitle','label','excerpt','passage'].some(k=>typeof c[k]!=='string')||c.passage.length>18000||c.excerpt.length>18000||JSON.stringify(a).length>50000)return json_({ok:false,error:'bad vocabulary payload'});
  const entry={id:a.id,expression:a.expression.normalize('NFC').replace(/\s+/g,' ').trim(),student:String(a.student||'').slice(0,100),createdAt:new Date().toISOString(),context:{source:c.source,setId:c.setId.slice(0,150),setTitle:c.setTitle.slice(0,300),qid:c.qid.slice(0,150),label:c.label.slice(0,150),area:c.area.slice(0,100),excerpt:c.excerpt,passage:c.passage},status:'Pending',definition:'',example:'',generationMode:'tutor-reviewed'};
  const entries=vocabRows_(),signature=vocabSignature_(entry);
  const existing=entries.find(e=>e.id===a.id||vocabSignature_(e)===signature);
  if(existing)return json_({ok:true,requestId:a.id,entry:existing});
  const sh=vocabSheet_();
  sh.appendRow([new Date(),feedbackText_(entry.student),feedbackText_(entry.expression),feedbackText_(entry.context.setTitle),feedbackText_(entry.context.label),feedbackText_(entry.context.area),feedbackText_(entry.context.excerpt),entry.status,'','',entry.id,JSON.stringify(entry)]);
  return json_({ok:true,requestId:a.id,entry});
}
function vocabReview_(a) {
  if(a.key!==TUTOR_KEY)return json_({ok:false,error:'bad key'});
  if(typeof a.id!=='string'||typeof a.definition!=='string'||!a.definition.trim()||a.definition.length>2000||typeof a.example!=='string'||!a.example.trim()||a.example.length>2000)return json_({ok:false,error:'Provide a definition and an example, each at most 2000 characters.'});
  const sh=SpreadsheetApp.getActive().getSheetByName('Vocabulary');
  if(sh&&sh.getLastRow()>1){
    const ids=sh.getRange(2,11,sh.getLastRow()-1,1).getValues().flat(),i=ids.indexOf(a.id);
    if(i!==-1){
      const row=i+2,e=JSON.parse(sh.getRange(row,12).getValue());
      e.definition=a.definition.trim();e.example=a.example.trim();e.status='Ready';e.reviewedAt=new Date().toISOString();e.generationMode='tutor-reviewed';
      sh.getRange(row,8,1,5).setValues([[e.status,feedbackText_(e.definition),feedbackText_(e.example),e.id,JSON.stringify(e)]]);
      return json_({ok:true,entry:e});
    }
  }
  return json_({ok:false,error:'Vocabulary entry not found.'});
}

// Conversation access is separate from the tutor key; it only grants this
// student's question threads. Never return attempts or tutor credentials.
function feedbackToken_() {
  const p=PropertiesService.getScriptProperties();
  let t=p.getProperty('FEEDBACK_STUDENT_TOKEN');
  if(!t){t=Utilities.getUuid()+Utilities.getUuid();p.setProperty('FEEDBACK_STUDENT_TOKEN',t);}
  return t;
}
function feedbackStudent_(a) {
  const token=PropertiesService.getScriptProperties().getProperty('FEEDBACK_STUDENT_TOKEN');
  if(!token || a.token!==token)return json_({ok:false,error:'Open the private conversation link from your tutor on this device.'});
  const sh=SpreadsheetApp.getActive().getSheetByName('Student questions');
  const reports=!sh || sh.getLastRow()<2?[]:sh.getRange(2,9,sh.getLastRow()-1,1).getValues().flat().filter(String).map(JSON.parse);
  return json_({ok:true,threadsVersion:1,reports:reports});
}
function feedbackFind_(id) {
  const sh=SpreadsheetApp.getActive().getSheetByName('Student questions');
  if(!sh || sh.getLastRow()<2)return null;
  const i=sh.getRange(2,10,sh.getLastRow()-1,1).getValues().flat().indexOf(id);
  return i<0?null:{sh:sh,row:i+2,report:JSON.parse(sh.getRange(i+2,9).getValue())};
}
function feedbackActor_(a) {
  if(a.role==='tutor')return a.key===TUTOR_KEY?'tutor':'';
  const t=PropertiesService.getScriptProperties().getProperty('FEEDBACK_STUDENT_TOKEN');
  return t && a.token===t?'student':'';
}
function feedbackReply_(a) {
  const role=feedbackActor_(a);
  if(!role)return json_({ok:false,error:'Access denied'});
  if(typeof a.replyId!=='string' || !/^msg_[a-zA-Z0-9_-]{1,100}$/.test(a.replyId) || typeof a.message!=='string' || !a.message.trim() || a.message.length>3000)return json_({ok:false,error:'Write a message of 1–3000 characters.'});
  const f=feedbackFind_(a.id);if(!f)return json_({ok:false,error:'Question not found'});
  const r=f.report;r.replies=r.replies||[];
  if(!r.replies.some(m=>m.id===a.replyId)) {
    if(r.replies.length>=100)return json_({ok:false,error:'This thread has reached its message limit.'});
    r.replies.push({id:a.replyId,role:role,message:a.message.trim(),at:new Date().toISOString()});
    r.status='New';
    // Keep each JSON cell below the Sheets cell-size limit.
    if(JSON.stringify(r).length>45000)return json_({ok:false,error:'This thread is full. Please start a new question.'});
    f.sh.getRange(f.row,8,1,2).setValues([[r.status,JSON.stringify(r)]]);
  }
  return json_({ok:true,replyId:a.replyId,report:r});
}
function feedbackRead_(a) {
  const role=feedbackActor_(a);if(!role)return json_({ok:false,error:'Access denied'});
  const f=feedbackFind_(a.id);if(!f)return json_({ok:false,error:'Question not found'});
  const r=f.report;
  // Acknowledge exactly the messages rendered, never a newer arrival.
  const ids=Array.isArray(a.messageIds)?a.messageIds.slice(0,100):[];
  const allowed=(r.replies||[]).filter(m=>m.role!==role).map(m=>m.id);
  const key=role==='tutor'?'tutorReadIds':'studentReadIds';
  r[key]=Array.from(new Set((r[key]||[]).concat(ids.filter(id=>allowed.indexOf(id)!==-1))));
  f.sh.getRange(f.row,9).setValues([[JSON.stringify(r)]]);
  return json_({ok:true,readId:r.id});
}

/* Question feedback, bundled when config.feedback is enabled. */
(function(){
  'use strict';
  const K = NS + '::feedback::';
  const read = (k,d) => { try { return JSON.parse(localStorage.getItem(K+k)) || d; } catch(e){ return d; } };
  // Do not claim a draft is saved if the browser refuses storage.
  const write = (k,v) => localStorage.setItem(K+k,JSON.stringify(v));
  let busy=false, reports=null, inboxError='', modal=null, returnFocus=null;
  let inboxRole='tutor', studentToken=read('studentToken',''), accessToken='', threadsVersion=0;
  const tokenMatch=CONFIG.feedbackThreads && location.hash.match(/^#questions=([a-zA-Z0-9-]{20,150})$/);
  if(tokenMatch){studentToken=tokenMatch[1];try{write('studentToken',studentToken);}catch(e){} history.replaceState(null,'',location.pathname+location.search+'#questions');}
  const css=document.createElement('style');
  css.textContent=`
  .fb-action{display:inline-block;margin-top:16px;padding:9px 13px;border:1px solid #316487;border-radius:6px;background:#fff;color:#214f70;font:600 14px system-ui;cursor:pointer}
  .fb-action:focus-visible,.fb-dialog :focus-visible{outline:3px solid #2572ac;outline-offset:3px}
  .fb-overlay{position:fixed;inset:0;z-index:900;background:rgba(16,34,50,.48);display:flex;align-items:center;justify-content:center;padding:16px;font:15px/1.5 system-ui;color:#172e42}
  .fb-dialog{background:#fff;border-radius:12px;box-shadow:0 16px 60px #10223244;width:100%;max-width:650px;max-height:90vh;overflow:auto;padding:26px}
  .fb-dialog h2{font-size:24px;margin:0 0 8px}.fb-dialog label{display:block;font-weight:600;margin:15px 0 6px}
  .fb-dialog textarea,.fb-dialog select{box-sizing:border-box;width:100%;padding:10px;border:1px solid #8193a2;border-radius:5px;background:#fff;color:#172e42;font:inherit}
  .fb-dialog textarea{min-height:130px;resize:vertical}.fb-help{color:#526577;font-size:14px}.fb-status{margin:12px 0;white-space:pre-wrap}
  .fb-buttons{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.fb-primary{background:#214f70;color:#fff}.fb-report{border-top:1px solid #dce4eb;padding:18px 0}.fb-message{white-space:pre-wrap;overflow-wrap:anywhere;margin:10px 0}.fb-blank{display:inline-block;min-width:4em;text-align:center}.fb-context table{border-collapse:collapse;max-width:100%}.fb-context th,.fb-context td{border:1px solid #8193a2;padding:6px}.fb-context{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f6f9;padding:12px;border-radius:5px}
  @media(max-width:520px){.fb-dialog{padding:18px}.fb-dialog h2{font-size:21px}}`;
  document.head.appendChild(css);
  function close(){ if(modal) modal.remove(); modal=null; if(returnFocus && returnFocus.isConnected) returnFocus.focus(); }
  function dialog(title,content){
    close(); returnFocus=document.activeElement;
    modal=document.createElement('div'); modal.className='fb-overlay';
    modal.innerHTML=`<section class="fb-dialog" role="dialog" aria-modal="true" aria-labelledby="fb-title"><h2 id="fb-title">${esc(title)}</h2>${content}</section>`;
    modal.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();close();return;}
      if(e.key==='Tab'){
        const nodes=[...modal.querySelectorAll('button:not(:disabled),input,textarea,select,a[href],summary')];
        if(!nodes.length)return;
        if(e.shiftKey && document.activeElement===nodes[0]){e.preventDefault();nodes[nodes.length-1].focus();}
        else if(!e.shiftKey && document.activeElement===nodes[nodes.length-1]){e.preventDefault();nodes[0].focus();}
      }
    });
    document.body.appendChild(modal);
    modal.querySelector('textarea,button,select')?.focus();
    return modal;
  }
  async function post(payload){
    if(!syncConfigured())throw new Error('This site is not connected yet.');
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),20000);
    try{
      const res=await fetch(CONFIG.submitUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),signal:controller.signal});
      const data=await res.json();
      if(!data.ok)throw new Error(data.error || 'The server did not accept this message.');
      // Old Apps Scripts may reply ok for unrelated payloads. Require feature acknowledgement.
      if(payload.kind==='feedback-reply' && data.replyId!==payload.replyId)throw new Error('The conversation service needs an update. Your draft is retained.');
      if(payload.kind==='feedback-read' && data.readId!==payload.id)throw new Error('Read status was not saved.');
      if(payload.kind==='feedback' && data.feedbackId!==payload.id)throw new Error('The feedback service needs an update.');
      return data;
    }finally{clearTimeout(timer);}
  }
  async function flush(){
    if(busy)return; busy=true;
    try{
      for(const rec of read('outbox',[])){
        await post(rec);
        write('outbox',read('outbox',[]).filter(x=>x.id!==rec.id));
      }
    }catch(e){ /* Keep unsent reports for retry, including when Apps Script is still old. */ }
    finally{busy=false;}
  }
  function open(context){
    const draftKey='draft:'+context.source+':'+context.setId+':'+context.qid;
    const draft=read(draftKey,{});
    const box=dialog('Ask about this question',`
      <p class="fb-help">${esc(context.setTitle)} · ${esc(context.label)}${context.answer?' · You chose '+esc(context.answer):''}</p>
      <p>Tell your tutor where you got stuck, or report something that looks wrong.</p>
      <form id="fb-form"><label for="fb-category">What do you need help with?</label>
      <select id="fb-category"><option>Help understanding</option><option>Possible answer or explanation issue</option><option>Display or technical problem</option><option>Something else</option></select>
      <label for="fb-message">Your question</label><textarea id="fb-message" maxlength="3000" required placeholder="For example: I can rule out C, but why is A wrong?"></textarea>
      <p class="fb-help">The question and your selected answer are attached automatically. Your draft is saved on this device.</p>
      <div class="fb-status" role="status" aria-live="polite"></div>
      <div class="fb-buttons"><button class="fb-action fb-primary" type="submit">Send to tutor</button><button class="fb-action" type="button" id="fb-close">Close</button></div></form>`);
    const field=box.querySelector('textarea'), category=box.querySelector('select'), status=box.querySelector('.fb-status'), send=box.querySelector('[type=submit]');
    field.value=draft.message||'';
    if([...category.options].some(o=>o.value===draft.category))category.value=draft.category;
    const saveDraft=()=>{try{write(draftKey,{message:field.value,category:category.value});}catch(e){status.textContent='This browser could not save your draft. Keep this box open until you send it.';}};
    field.oninput=saveDraft; category.onchange=saveDraft;
    box.querySelector('#fb-close').onclick=close;
    box.querySelector('form').onsubmit=async e=>{
      e.preventDefault(); if(!field.value.trim()){field.setCustomValidity('Please describe your question.');field.reportValidity();field.setCustomValidity('');return;}
      const rec={kind:'feedback',id:'fb_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10),student:CONFIG.student,at:new Date().toISOString(),category:category.value,message:field.value.trim(),context};
      try{write('outbox',read('outbox',[]).concat([rec]));}catch(e){status.textContent='Could not save your message. Copy it somewhere safe and try again.';return;}
      send.disabled=true;field.disabled=true;category.disabled=true;status.textContent='Sending…';
      await flush();
      if(read('outbox',[]).some(x=>x.id===rec.id)){
        status.textContent='Saved on this device, but not delivered yet. Keep or reopen this site to retry. Your tutor will see it only after delivery.';
        send.textContent='Retry delivery';send.disabled=false;
        box.querySelector('form').onsubmit=async ev=>{ev.preventDefault();send.disabled=true;await flush();send.disabled=false;if(!read('outbox',[]).some(x=>x.id===rec.id)){status.textContent='Sent to your tutor.';send.hidden=true;localStorage.removeItem(K+draftKey);}};
      }else{status.textContent='Sent to your tutor.';send.hidden=true;localStorage.removeItem(K+draftKey);}
    };
  }
  function resultButtons(){
    const att=getHistory().find(a=>a.id===UI.attemptId);if(!att)return;
    const set=getSet(att.setId);
    document.querySelectorAll('.review-item').forEach(card=>{
      const n=Number(card.id.replace('ri-','')), it=att.items.find(i=>i.n===n), q=set?.questions.find(q=>q.num===n);
      if(!q || !it || card.querySelector('.fb-action'))return;
      const b=document.createElement('button');b.className='fb-action';b.textContent='Ask about this question';
      b.onclick=()=>open({source:'results',setId:att.setId,setTitle:att.setTitle,qid:String(q.qid||q.num),num:q.num,label:'Q'+q.num,answer:it.ans||'',attemptId:att.id,passage:q.passage,prompt:q.prompt,choices:q.choices,correctAnswer:q.correctAnswer});
      card.querySelector('.review-detail')?.appendChild(b);
    });
  }
  async function loadInbox(){
    reports=null;inboxError='';showInbox();
    const loadingModal=modal, requestedKey=TUTOR.key, requestedRole=inboxRole;
    try{
      const res=await fetch(CONFIG.submitUrl+(inboxRole==='tutor'?'?kind=feedback&key='+encodeURIComponent(TUTOR.key):'?kind=feedback-student&token='+encodeURIComponent(studentToken)));
      const data=await res.json();
      if(!data.ok)throw new Error(data.error==='bad key'?'Please unlock the tutor dashboard again.':data.error);
      if(!Array.isArray(data.reports))throw new Error('Update the Google Apps Script to enable Student questions. See FEEDBACK-TRIAL.md.');
      if(CONFIG.feedbackThreads && data.threadsVersion!==1)throw new Error('The conversation service needs an update. Please try again after your tutor updates it.');
      threadsVersion=data.threadsVersion||0;accessToken=data.studentToken||'';
      reports=data.reports.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
    }catch(e){inboxError=e.message||'Could not load messages. Please retry.';}
    if(modal!==loadingModal || inboxRole!==requestedRole || (inboxRole==='tutor' && (TUTOR.key!==requestedKey || TUTOR.attempts===null)))return;
    showInbox();
  }
  // Question snapshots contain limited teaching markup. Rebuild an allowlisted
  // fragment; never insert stored HTML or its attributes into the live document.
  function questionText(value){
    const tpl=document.createElement('template');
    tpl.innerHTML=String(value==null?'':value);
    const allowed=new Set(['I','EM','B','STRONG','U','SUB','SUP','BR','P','DIV','TABLE','THEAD','TBODY','TR','TH','TD','CAPTION']);
    const blocked=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH']);
    function clean(n){
      if(n.nodeType===3)return esc(n.textContent);
      if(n.nodeType!==1 || blocked.has(n.tagName))return '';
      const body=Array.from(n.childNodes,clean).join('');
      if(n.tagName==='SPAN' && n.classList.contains('blank'))return '<span class="fb-blank">'+body+'</span>';
      if(!allowed.has(n.tagName))return body;
      const tag=n.tagName.toLowerCase();return tag==='br'?'<br>':'<'+tag+'>'+body+'</'+tag+'>';
    }
    return Array.from(tpl.content.childNodes,clean).join('');
  }
  function showInbox(){
    const tutor=inboxRole==='tutor';
    const box=dialog(tutor?'Student questions':'My questions & replies',`<p class="fb-help">${tutor?esc(CONFIG.student)+'’s questions and saved conversations.':'Your questions, tutor replies, and follow-ups are saved here for your next session.'}</p>${tutor && accessToken?'<details><summary>Private student conversation link</summary><p class="fb-help">Share this link with '+esc(CONFIG.student)+' once. Open it on each device to receive replies. Keep it private.</p><input aria-label="Private student conversation link" readonly style="width:100%;box-sizing:border-box" value="'+esc(location.origin+location.pathname+'#questions='+accessToken)+'"></details>':''}<div class="fb-buttons"><button class="fb-action" id="fb-refresh">Refresh</button><button class="fb-action" id="fb-close">Close</button></div><div class="fb-status" role="status">${inboxError?esc(inboxError):reports===null?'Loading…':''}</div><div id="fb-reports"></div>`);
    box.querySelector('#fb-close').onclick=close;box.querySelector('#fb-refresh').onclick=loadInbox;
    const list=box.querySelector('#fb-reports');
    if(reports && !reports.length)list.textContent='No questions yet. Messages will appear here after '+CONFIG.student+' sends them.';
    (reports||[]).forEach(r=>{
      const c=r.context||{}, node=document.createElement('article');node.className='fb-report';
      node.innerHTML=`<strong>${esc(c.setTitle)} · ${esc(c.label||c.qid)}</strong><div class="fb-help">${esc(r.student)} · ${esc(r.category)} · ${esc(new Date(r.at).toLocaleString())} · ${esc(r.status||'New')}</div><p class="fb-message">${esc(r.message)}</p><details><summary>View attached question${c.answer?' · selected '+esc(c.answer):''}</summary><div class="fb-context">${questionText(c.passage)}\n\n${questionText(c.prompt)}\n\n${Object.entries(c.choices||{}).map(([l,t])=>esc(l+'. ')+questionText(t)).join('\n')}\n\nCorrect answer: ${esc(c.correctAnswer)}</div></details><button class="fb-action">${r.status==='Resolved'?'Reopen':'Mark resolved'}</button><div class="fb-status" role="status"></div>`;
      node.querySelector('button').hidden=!tutor;
      node.querySelector('button').onclick=async e=>{
        e.target.disabled=true;
        try{await post({kind:'feedback-status',key:TUTOR.key,id:r.id,status:r.status==='Resolved'?'New':'Resolved'});await loadInbox();}
        catch(err){node.querySelector('.fb-status').textContent='Could not update status: '+err.message;e.target.disabled=false;}
      };
      list.appendChild(node);
      if(CONFIG.feedbackThreads && threadsVersion===1)thread(node,r,tutor);
    });
  }
  const oldResult=renderResult, oldTutor=renderTutor;
  renderResult=function(){oldResult();resultButtons();};
  renderTutor=function(){oldTutor();if(TUTOR.attempts===null)return;const page=document.querySelector('#app .page');if(!page)return;const b=document.createElement('button');b.className='fb-action';b.textContent='Student questions';b.onclick=()=>{inboxRole='tutor';loadInbox();};page.querySelector('.page-hd')?.after(b);};
  function unread(r,role){
    const seen=r[role==='tutor'?'tutorReadIds':'studentReadIds']||[];
    return (r.replies||[]).filter(m=>m.role!==role && !seen.includes(m.id));
  }
  function credentials(){return inboxRole==='tutor'?{role:'tutor',key:TUTOR.key}:{role:'student',token:studentToken};}
  function thread(node,r,tutor){
    const role=tutor?'tutor':'student', fresh=unread(r,role);
    const details=document.createElement('details');details.className='fb-thread';
    details.innerHTML='<summary>Conversation · '+(r.replies||[]).length+' replies'+(fresh.length?' · '+fresh.length+' unread':'')+'</summary><div class="fb-thread-messages"></div>';
    const messages=details.querySelector('div');
    (r.replies||[]).forEach(m=>{const item=document.createElement('div');item.className='fb-report';item.innerHTML='<strong>'+esc(m.role==='tutor'?'Tutor':CONFIG.student)+'</strong><span class="fb-help"> · '+esc(new Date(m.at).toLocaleString())+'</span><div class="fb-message">'+esc(m.message)+'</div>';messages.appendChild(item);});
    const draftKey='replyDraft:'+role+':'+r.id, draft=read(draftKey,{});
    const form=document.createElement('form');form.innerHTML='<label>Reply<textarea aria-label="Reply to '+esc(r.context?.label||'question')+'" maxlength="3000" required></textarea></label><p class="fb-help">Your draft is saved on this device. Send your reply to make it visible in the conversation.</p><button class="fb-action fb-primary" type="submit">Send reply</button><div class="fb-status" role="status" aria-live="polite"></div>';
    const field=form.querySelector('textarea'), status=form.querySelector('.fb-status'), button=form.querySelector('button');field.value=draft.message||'';
    let replyId=draft.replyId||('msg_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10));
    field.oninput=()=>{try{write(draftKey,{message:field.value,replyId});}catch(e){status.textContent='This browser could not save the draft. Copy it before leaving.';}};
    form.onsubmit=async e=>{
      e.preventDefault();if(!field.value.trim())return;
      try{write(draftKey,{message:field.value,replyId});}catch(e){status.textContent='Could not save your draft. Copy it somewhere safe before sending.';return;}
      button.disabled=true;field.disabled=true;status.textContent='Sending…';
      try{await post({kind:'feedback-reply',id:r.id,replyId,message:field.value.trim(),...credentials()});localStorage.removeItem(K+draftKey);await loadInbox();}
      catch(err){status.textContent='Delivery not confirmed. Your draft is retained; retry to send it safely. '+err.message;button.disabled=false;field.disabled=false;}
    };
    details.appendChild(form);node.appendChild(details);
    details.ontoggle=async()=>{
      if(!details.open || !fresh.length)return;
      try{await post({kind:'feedback-read',id:r.id,messageIds:fresh.map(m=>m.id),...credentials()});r[role==='tutor'?'tutorReadIds':'studentReadIds']=(r[role==='tutor'?'tutorReadIds':'studentReadIds']||[]).concat(fresh.map(m=>m.id));details.querySelector('summary').textContent='Conversation · '+(r.replies||[]).length+' replies';updateNotice();}
      catch(e){ /* Retain unread state until the server acknowledges it. */ }
    };
  }
  function openStudent(){inboxRole='student';if(!studentToken){dialog('My questions & replies','<p>Open the private conversation link from your tutor once on this device. Your questions and replies will then appear here.</p><button class="fb-action" id="fb-close">Close</button>').querySelector('#fb-close').onclick=close;return;}loadInbox();}
  async function updateNotice(){
    const b=document.querySelector('#fb-student-inbox');if(!b || !studentToken || !syncConfigured())return;
    try{const res=await fetch(CONFIG.submitUrl+'?kind=feedback-student&token='+encodeURIComponent(studentToken));const d=await res.json();if(d.ok && d.threadsVersion===1 && Array.isArray(d.reports)){const n=d.reports.reduce((sum,r)=>sum+unread(r,'student').length,0);b.textContent='My questions & replies'+(n?' · '+n+' unread':'');}}catch(e){}
  }
  const oldHome=renderHome;
  renderHome=function(){oldHome();if(!CONFIG.feedbackThreads)return;const page=document.querySelector('#app .page');if(!page)return;const b=document.createElement('button');b.id='fb-student-inbox';b.className='fb-action';b.textContent='My questions & replies';b.onclick=openStudent;page.querySelector('.page-hd')?.after(b);updateNotice();};
  window.addEventListener('focus',updateNotice);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateNotice();});
  setInterval(updateNotice,60000);
  if(UI.view==='home' && location.hash!=='#tutor')renderHome();
  if(location.hash==='#questions')openStudent();
  window.StudentFeedback={open,flush};
  window.addEventListener('online',flush);setInterval(flush,30000);flush();
  if(location.hash==='#tutor')renderTutor();else if(UI.view==='result')resultButtons();
})();

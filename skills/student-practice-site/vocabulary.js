/* Personal vocabulary: context snapshots, offline additions, tutor-reviewed definitions. */
(function(){
  'use strict';
  const K=NS+'::vocab::';
  const get=(k,d)=>{try{return JSON.parse(localStorage.getItem(K+k))||d;}catch(e){return d;}};
  const put=(k,v)=>localStorage.setItem(K+k,JSON.stringify(v));
  const normalize=s=>String(s||'').normalize('NFC').toLowerCase().replace(/\s+/g,' ').trim();
  const signature=e=>JSON.stringify([normalize(e.expression),e.context.source,e.context.setId,e.context.qid,e.context.area]);
  const plain=s=>{const t=document.createElement('template');t.innerHTML=String(s||'');return t.content.textContent||'';};
  let busy=false,overlay=null,previousFocus=null,toolbar=null,listMode=false,filter='all',query='',loadError='',generation=0;
  const css=document.createElement('style');css.textContent=`
  .voc-button{padding:9px 14px;border:1px solid #316487;border-radius:6px;background:white;color:#214f70;font:600 14px system-ui;cursor:pointer}.voc-button:focus-visible,.voc-dialog :focus-visible{outline:3px solid #2572ac;outline-offset:3px}.voc-button:disabled{opacity:.6;cursor:wait}
  .voc-home{margin:24px 0;padding:20px;border:1px solid #ccd9e2;border-left:4px solid #316487;border-radius:8px}.voc-home h2{font-size:21px;margin:0 0 7px}.voc-home p{color:#526577;margin:0 0 12px}
  .voc-toolbar{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:750;display:flex;align-items:center;gap:10px;flex-wrap:wrap;max-width:calc(100vw - 32px);width:max-content;padding:12px 16px;border:1px solid #8193a2;border-radius:9px;box-shadow:0 6px 24px #172e4233;background:white;color:#172e42;font:15px system-ui}.voc-toolbar span{max-width:260px;overflow-wrap:anywhere}.voc-toolbar button{flex-shrink:0}
  .voc-overlay{position:fixed;inset:0;z-index:950;background:#10223277;display:flex;align-items:center;justify-content:center;padding:16px;color:#172e42;font:15px/1.55 system-ui}.voc-dialog{box-sizing:border-box;width:100%;max-width:760px;max-height:90vh;overflow:auto;background:#fff;padding:26px;border-radius:12px;box-shadow:0 16px 60px #10223244}.voc-dialog h2{margin:0 0 8px;font-size:25px}.voc-tools{display:flex;gap:10px;flex-wrap:wrap;margin:15px 0}.voc-dialog input,.voc-dialog select,.voc-dialog textarea{box-sizing:border-box;font:inherit;color:inherit;background:#fff;border:1px solid #8193a2;border-radius:5px;padding:9px;max-width:100%}.voc-dialog textarea{width:100%;min-height:80px}.voc-dialog label{display:block;font-weight:600;margin:10px 0 5px}.voc-entry{border-top:1px solid #dce4eb;padding:18px 0}.voc-entry h3{margin:0;font-size:21px}.voc-muted{color:#526577;font-size:14px}.voc-copy{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}.voc-pending{color:#805719}.voc-ready{color:#226648}.voc-status{margin:10px 0;white-space:pre-wrap}.voc-context{background:#f2f6f9;border-radius:5px;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere}
  @media(max-width:520px){.voc-dialog{padding:18px}.voc-toolbar{bottom:8px;padding:10px}.voc-toolbar span{max-width:170px}.voc-tools input{width:100%}}`;
  document.head.appendChild(css);
  function entries(){
    const remote=get('entries',[]),all=remote.slice();
    for(const pending of get('outbox',[]))if(!all.some(e=>signature(e)===signature(pending)))all.push({...pending,status:'Pending',unsent:true});
    return all.sort((a,b)=>String(b.createdAt||b.at).localeCompare(String(a.createdAt||a.at)));
  }
  async function request(params,payload){
    if(!syncConfigured())throw Error('This site is not connected yet.');
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
    try{
      const response=await fetch(CONFIG.submitUrl+(params?'?'+new URLSearchParams(params):''),payload?{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),signal:abort.signal}:{signal:abort.signal});
      const d=await response.json();if(!d.ok)throw Error(d.error||'Could not reach the vocabulary service.');return d;
    }finally{clearTimeout(timer);}
  }
  function cache(entry){const all=get('entries',[]).filter(e=>e.id!==entry.id && signature(e)!==signature(entry));put('entries',all.concat([entry]));}
  async function flush(){
    if(busy)return;busy=true;
    try{for(const item of get('outbox',[])){
      const d=await request(null,{...item,kind:'vocab-add'});
      if(d.requestId!==item.id || !d.entry?.id)throw Error('Update the Google Apps Script to enable vocabulary.');
      cache(d.entry);put('outbox',get('outbox',[]).filter(e=>e.id!==item.id));
    }}catch(e){/* Preserve unsent entries until a confirmed acknowledgement. */}
    finally{busy=false;}
  }
  function removeToolbar(){toolbar?.remove();toolbar=null;}
  function offer(expression,context){
    if(location.hash==='#tutor')return;
    const word=String(expression||'').replace(/\s+/g,' ').trim();
    if(!word || word.length>180 || word.split(' ').length>12 || !/[A-Za-z\u00c0-\uffff]/.test(word)){removeToolbar();return;}
    // Selection events may arrive after mouseup or while a save is in flight.
    // Keep the same button and its progress/confirmation for this selection.
    const selectionKey=signature({expression:word,context});
    if(toolbar?.dataset.selectionKey===selectionKey)return;
    removeToolbar();toolbar=document.createElement('div');toolbar.className='voc-toolbar';toolbar.setAttribute('role','region');toolbar.setAttribute('aria-label','Selected vocabulary');
    toolbar.dataset.selectionKey=selectionKey;
    const label=document.createElement('span');label.textContent='“'+word+'”';toolbar.appendChild(label);
    const button=document.createElement('button');button.className='voc-button';button.textContent='Add to vocabulary';toolbar.appendChild(button);
    const dismiss=document.createElement('button');dismiss.className='voc-button';dismiss.textContent='Close';dismiss.onclick=removeToolbar;toolbar.appendChild(dismiss);
    // Retain the selected text until the click, including in editable error-log text.
    toolbar.onmousedown=e=>e.preventDefault();
    button.onclick=async()=>{
      button.disabled=true;
      label.textContent='Saving “'+word+'”…';
      try{
        if(entries().some(e=>signature(e)===signature({expression:word,context}))){label.textContent='Already in your vocabulary.';button.hidden=true;return;}
        const entry={id:'v_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10),expression:word,student:CONFIG.student,at:new Date().toISOString(),context};
        put('outbox',get('outbox',[]).concat([entry]));
        await flush();
        label.textContent=get('outbox',[]).some(e=>e.id===entry.id)?'Saved on this device; waiting to sync.':'Saved. Definition pending tutor review.';button.hidden=true;
      }catch(e){label.textContent='Could not save. Please try again.';button.disabled=false;}
    };
    document.body.appendChild(toolbar);
  }
  function nodeElement(n){return n?.nodeType===1?n:n?.parentElement;}
  function bindSelection(doc,resolve){
    let timer;
    function selected(event){
      // Mouseup on the toolbar happens before click. Replacing its button here
      // drops that click; keyboard activation must keep the button too.
      if(nodeElement(event?.target)?.closest('.voc-toolbar,.voc-overlay'))return;
      if(overlay)return;
      const sel=doc.defaultView.getSelection();
      if(!sel || sel.isCollapsed || !sel.rangeCount){removeToolbar();return;}
      const range=sel.getRangeAt(0),a=nodeElement(range.startContainer),b=nodeElement(range.endContainer);
      const context=resolve(a,b);if(context)offer(sel.toString(),context);
    }
    doc.addEventListener('mouseup',selected);doc.addEventListener('keyup',selected);
    doc.addEventListener('selectionchange',()=>{clearTimeout(timer);timer=setTimeout(selected,120);});
  }
  bindSelection(document,(a,b)=>{
    if(location.hash==='#tutor' || UI.view!=='result')return;
    const area=a?.closest('.rp,.review-choice');if(!area || area!==b?.closest('.rp,.review-choice'))return;
    const card=area.closest('.review-item'),att=getHistory().find(x=>x.id===UI.attemptId),set=att&&getSet(att.setId),n=Number(card?.id.replace('ri-','')),q=set?.questions.find(x=>x.num===n);if(!q)return;
    const choice=area.classList.contains('review-choice')?['A','B','C','D'][[...card.querySelectorAll('.review-choice')].indexOf(area)]:null;
    return {source:'results',setId:set.id,setTitle:set.title,qid:String(q.qid||q.num),label:'Q'+q.num,area:choice?'Choice '+choice:'Passage',excerpt:plain(choice?q.choices[choice]:q.passage),passage:plain(q.passage)};
  });
  function close(){generation++;overlay?.remove();overlay=null;previousFocus?.isConnected&&previousFocus.focus();}
  function dialog(title){
    close();previousFocus=document.activeElement;overlay=document.createElement('div');overlay.className='voc-overlay';
    overlay.innerHTML=`<section class="voc-dialog" role="dialog" aria-modal="true" aria-labelledby="voc-title"><h2 id="voc-title">${esc(title)}</h2><div id="voc-body"></div></section>`;
    overlay.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();close();}
      if(e.key==='Tab'){
        const nodes=[...overlay.querySelectorAll('button:not(:disabled),input,select,textarea,summary,a[href]')];
        if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}
        else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}
      }
    });document.body.appendChild(overlay);return overlay.querySelector('#voc-body');
  }
  function contextChoices(c){
    // Resolve older saved entries against the bundled source question, preserving their IDs and definitions.
    if(c.source==='results'){
      const set=getSet(c.setId),q=set?.questions.find(q=>String(q.qid||q.num)===String(c.qid));
      if(q && plain(q.passage)===c.passage)return {choices:q.choices,correctAnswer:q.correctAnswer};
    }
    if(c.source==='errorlog' && typeof VOCABULARY_QUESTIONS!=='undefined'){
      const q=VOCABULARY_QUESTIONS.find(q=>String(q.qid)===String(c.qid)&&plain(q.prompt)===c.passage);
      if(q)return {choices:Object.fromEntries(q.choices.map((text,i)=>[['A','B','C','D'][i],text])),correctAnswer:['A','B','C','D'][q.correct]};
    }
    return null;
  }
  function originalContext(c){
    const question=contextChoices(c),choices=question?.choices;
    const text=esc(c.excerpt)+(c.area!=='Passage'?'\n\nPassage: '+esc(c.passage):'');
    return text+(choices?'\n\n<b>Answer choices</b>\n'+['A','B','C','D'].map(letter=>(letter===question.correctAnswer?'<b>'+esc(letter+'. '+plain(choices[letter]))+' — Correct answer</b>':esc(letter+'. '+plain(choices[letter])))).join('\n'):'');
  }
  function paint(){
    if(!overlay)return;
    const body=overlay.querySelector('#voc-body'),all=entries(),shown=all.filter(e=>(filter==='all'||(filter==='ready'?e.status==='Ready':e.status!=='Ready'))&&normalize(e.expression).includes(normalize(query)));
    body.innerHTML=`<p class="voc-muted">${listMode?'Review saved words and publish a definition and example.':'Words and phrases you saved while reviewing. Definitions appear after tutor review.'}</p><div class="voc-tools"><input id="voc-search" type="search" aria-label="Search vocabulary" placeholder="Find a word or phrase" value="${esc(query)}"><select id="voc-filter" aria-label="Filter vocabulary"><option value="all">All words</option><option value="pending">Definition pending</option><option value="ready">Ready to study</option></select><button class="voc-button" id="voc-refresh">Refresh</button><button class="voc-button" id="voc-close">Close</button></div><div class="voc-status" role="status" aria-live="polite">${esc(loadError)}</div>${listMode?'<div class="voc-tools"><button class="voc-button" id="voc-export">Export pending words</button><button class="voc-button" id="voc-import">Import reviewed definitions</button></div>':''}<p class="voc-muted">${all.length} saved · ${all.filter(e=>e.status!=='Ready').length} awaiting a definition</p><div id="voc-entries"></div>`;
    body.querySelector('#voc-filter').value=filter;
    body.querySelector('#voc-search').oninput=e=>{query=e.target.value;const pos=e.target.selectionStart;paint();const input=overlay.querySelector('#voc-search');input.focus();try{input.setSelectionRange(pos,pos);}catch(e){}};
    body.querySelector('#voc-filter').onchange=e=>{filter=e.target.value;paint();};
    body.querySelector('#voc-refresh').onclick=load;
    body.querySelector('#voc-close').onclick=close;
    if(listMode){body.querySelector('#voc-export').onclick=exportPending;body.querySelector('#voc-import').onclick=importReviewed;}
    const list=body.querySelector('#voc-entries');
    if(!shown.length)list.textContent=all.length?'No words match this filter.':'No words saved yet. Select a word or phrase in a review passage or answer choice, then choose Add to vocabulary.';
    shown.forEach(e=>{
      const node=document.createElement('article');node.className='voc-entry';const c=e.context||{};
      node.innerHTML=`<h3>${esc(e.expression)}</h3><div class="voc-muted">${esc(c.setTitle)} · ${esc(c.label)} · ${esc(c.area)}</div><p class="${e.status==='Ready'?'voc-ready':'voc-pending'}">${e.unsent?'Saved on this device · not synced yet':e.status==='Ready'?'Ready to study':'Definition pending tutor review'}</p>${e.status==='Ready'?`<p class="voc-copy"><b>Meaning in context:</b> ${esc(e.definition)}</p><p class="voc-copy"><b>Example:</b> ${esc(e.example)}</p>`:''}<details><summary>Original context</summary><div class="voc-context">${originalContext(c)}</div></details>`;
      if(listMode && !e.unsent){
        const edit=document.createElement('details');edit.innerHTML=`<summary>${e.status==='Ready'?'Edit definition':'Add a definition'}</summary><form><label>Meaning in this context<textarea name="definition" maxlength="2000" required></textarea></label><label>Example sentence<textarea name="example" maxlength="2000" required></textarea></label><button class="voc-button" type="submit">Publish to word list</button><p class="voc-status" role="status"></p></form>`;
        const form=edit.querySelector('form');form.elements.definition.value=e.definition||'';form.elements.example.value=e.example||'';
        form.onsubmit=async event=>{
          event.preventDefault();const button=form.querySelector('button'),status=form.querySelector('.voc-status');button.disabled=true;status.textContent='Saving…';
          try{const d=await request(null,{kind:'vocab-review',key:TUTOR.key,id:e.id,definition:form.elements.definition.value.trim(),example:form.elements.example.value.trim()});if(!d.entry?.id)throw Error('Vocabulary service needs an update.');cache(d.entry);paint();}
          catch(err){status.textContent='Could not publish: '+err.message;button.disabled=false;}
        };node.appendChild(edit);
      }list.appendChild(node);
    });
  }
  async function load(){
    const token=++generation;loadError='Loading…';paint();
    try{
      await flush();const d=await request(listMode?{kind:'vocab',key:TUTOR.key}:{kind:'vocab'});
      if(!Array.isArray(d.entries))throw Error('Update the Google Apps Script to enable vocabulary.');
      put('entries',d.entries);loadError='';
    }catch(e){loadError='Could not refresh. Showing words saved on this device. '+e.message;}
    if(token===generation&&overlay)paint();
  }
  function open(tutor,browse){if(!tutor&&!browse&&window.VocabularyLearning){close();window.VocabularyLearning.open();return;}removeToolbar();listMode=!!tutor;filter='all';query='';loadError='';dialog(tutor?CONFIG.student+'’s vocabulary':'My vocabulary');paint();overlay.querySelector('input')?.focus();load();}
  function exportPending(){
    const rows=entries().filter(e=>e.status!=='Ready'&&!e.unsent).map(e=>({id:e.id,expression:e.expression,context:e.context,definition:'',example:''}));
    const url=URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=CONFIG.student+'-vocabulary-pending.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function importReviewed(){
    dialog('Import reviewed definitions');const body=overlay.querySelector('#voc-body');
    body.innerHTML='<p>Paste reviewed entries exported from this student’s vocabulary list. Each entry needs its ID, definition, and example.</p><label for="voc-json">Reviewed entries</label><textarea id="voc-json" style="min-height:180px"></textarea><div class="voc-tools"><button class="voc-button" id="voc-preview">Preview</button><button class="voc-button" id="voc-back">Back to vocabulary</button></div><div class="voc-status" role="status"></div><div id="voc-preview-list"></div>';
    body.querySelector('#voc-back').onclick=()=>open(true);
    body.querySelector('#voc-preview').onclick=()=>{
      const status=body.querySelector('.voc-status'),preview=body.querySelector('#voc-preview-list');preview.replaceChildren();
      try{
        const rows=JSON.parse(body.querySelector('textarea').value),existing=entries();
        if(!Array.isArray(rows)||!rows.length||rows.length>100)throw Error('Provide 1–100 reviewed entries.');
        const ids=new Set();
        for(const r of rows){if(ids.has(r.id)||!existing.some(e=>e.id===r.id)||typeof r.definition!=='string'||!r.definition.trim()||r.definition.length>2000||typeof r.example!=='string'||!r.example.trim()||r.example.length>2000)throw Error('Check IDs, definitions, and examples. Every ID must belong to this list.');ids.add(r.id);}
        rows.forEach(r=>{const p=document.createElement('p');p.className='voc-copy';p.textContent=existing.find(e=>e.id===r.id).expression+'\n'+r.definition+'\nExample: '+r.example;preview.appendChild(p);});
        const publish=document.createElement('button');publish.className='voc-button';publish.textContent='Publish '+rows.length+' reviewed entries';preview.appendChild(publish);status.textContent='Review the definitions below before publishing.';
        publish.onclick=async()=>{publish.disabled=true;let done=0;try{for(const r of rows){const d=await request(null,{kind:'vocab-review',key:TUTOR.key,id:r.id,definition:r.definition.trim(),example:r.example.trim()});if(!d.entry?.id)throw Error('No acknowledgement received.');cache(d.entry);done++;}open(true);}catch(e){status.textContent=done+' published; remaining entries were not confirmed. '+e.message;publish.disabled=false;}};
      }catch(e){status.textContent=e.message;}
    };
  }
  function homeCard(){const page=document.querySelector('#app .page');if(!page||page.querySelector('.voc-home'))return;const sec=document.createElement('section');sec.className='voc-home';sec.innerHTML='<h2>My vocabulary</h2><p>Study words and phrases saved from your review questions.</p><button class="voc-button">Open my vocabulary</button>';sec.querySelector('button').onclick=()=>open(false);page.querySelector('.page-hd')?.after(sec);}
  function tutorButton(){if(TUTOR.attempts==null)return;const page=document.querySelector('#app .page');if(!page||page.querySelector('.voc-tutor'))return;const b=document.createElement('button');b.className='voc-button voc-tutor';b.textContent='Student vocabulary';b.style.margin='12px 8px 12px 0';b.onclick=()=>open(true);page.querySelector('.page-hd')?.after(b);}
  const oldHome=renderHome,oldTutor=renderTutor;
  renderHome=function(){removeToolbar();oldHome();homeCard();};renderTutor=function(){removeToolbar();oldTutor();tutorButton();};
  window.StudentVocabulary={offer,bindSelection,open,flush,entries,request,originalContext,openList:()=>open(false,true),refresh:async()=>{await flush();const d=await request({kind:'vocab'});if(!Array.isArray(d.entries))throw Error('Vocabulary service needs an update.');put('entries',d.entries);return entries();}};
  window.addEventListener('online',flush);window.addEventListener('hashchange',()=>{removeToolbar();close();});setInterval(flush,30000);flush();
  if(location.hash==='#tutor')tutorButton();else if(UI.view==='home')homeCard();
})();

/* Parent owns submission and durable outbox; this adapter only attaches context. */
(function(){
  const E=window.ELOG;
  if(!E || E.mode==='tutor' || !parent.StudentFeedback)return;
  document.querySelectorAll('.qcard[data-set][data-qid]').forEach(card=>{
    const set=card.dataset.set,qid=card.dataset.qid,q=QMAP[set]?.[qid];
    if(!q)return;
    const b=document.createElement('button');b.type='button';b.textContent='Ask about this question';
    b.style.cssText='margin-top:16px;padding:9px 13px;border:1px solid #316487;border-radius:6px;background:white;color:#214f70;font:600 14px system-ui;cursor:pointer';
    b.onclick=()=>{
      const idx=state[set].selections[qid], choices={};
      const opts=q.options||q.choices||[];
      if(Array.isArray(opts))opts.forEach((text,i)=>choices[letterOf(i)]=text);else Object.assign(choices,opts);
      parent.StudentFeedback.open({source:'errorlog',setId:set,setTitle:DATASETS[set].title,qid,label:(/^o/.test(qid)?'Original Q':'Twin ')+q.number,num:q.number,origNum:q.origNum||q.number,answer:idx==null?'':letterOf(idx),passage:q.passage||'',prompt:q.prompt||q.question||'',choices,correctAnswer:letterOf(q.correct)});
    };
    card.querySelector('.qbody')?.appendChild(b);
  });
})();

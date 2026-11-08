(function(){
  const E=window.ELOG,V=parent.StudentVocabulary;
  if(!E||E.mode==='tutor'||!V)return;
  const plain=s=>{const t=document.createElement('template');t.innerHTML=String(s||'');return t.content.textContent||'';};
  V.bindSelection(document,(a,b)=>{
    const area=a?.closest('.qbody > .prompt,.choice-text');if(!area||area!==b?.closest('.qbody > .prompt,.choice-text'))return;
    const card=area.closest('.qcard'),set=card?.dataset.set,qid=card?.dataset.qid,q=QMAP[set]?.[qid];if(!q)return;
    const idx=area.closest('.choice')?.dataset.idx,choice=idx==null?null:letterOf(Number(idx));
    return {source:'errorlog',setId:set,setTitle:DATASETS[set].title,qid,label:(/^o/.test(qid)?'Original Q':'Twin ')+q.number,area:choice?'Choice '+choice:'Passage',excerpt:plain(choice?q.choices[Number(idx)]:q.prompt),passage:plain(q.prompt)};
  });
})();

/* ══════════════════ ERROR-LOG BRIDGE (injected by build.py) ══════════════════
   Runs inside the student's error-log page when it is opened from the practice
   site (iframe srcdoc, same origin). It relies on the error log's own globals:
   DATASETS, QMAP, state, selectChoice, toggleReveal, doResetAll, letterOf,
   formatTime, setTopTab, renderOverview.

   window.ELOG = { mode:'student'|'tutor', student, submitUrl, ns, key? }
     student: saves picks/reveals/timers on this device and sends one record
              to the Sheet the first time each card is revealed (per round).
     tutor:   records nothing; fetches the records and shows them on each card
              plus a progress table on the Patterns tab. */
(function(){
  const E = window.ELOG;
  if (!E || typeof DATASETS === 'undefined') return;
  const LET = i => (i == null || i < 0) ? '' : letterOf(i);
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmt = s => s == null ? '—' : formatTime(Math.round(s));
  const kind = q => /^o/.test(q.qid) ? 'original' : 'twin';

  const css = document.createElement('style');
  css.textContent = `
    .elog-t{font-family:Arial,Helvetica,sans-serif; font-size:0.82rem; margin:0 0 12px; padding:8px 12px; border-radius:8px; background:var(--lgray); border-left:4px solid var(--gray);}
    .elog-t.ok{background:var(--lteal); border-left-color:var(--teal);}
    .elog-t.bad{background:var(--lorange); border-left-color:var(--orange);}
    .elog-t .r{display:block; margin-top:2px; color:var(--gray);}
    .elog-sum{font-family:Arial,Helvetica,sans-serif; font-size:0.85rem; margin:0 0 14px; color:var(--navy);}
    .elog-ok{color:var(--teal); font-weight:bold;} .elog-bad{color:var(--orange); font-weight:bold;}
    .elog-banner{font-family:Arial,Helvetica,sans-serif; font-size:0.85rem; background:var(--lpurple); color:var(--purple); padding:8px 28px;}`;
  document.head.appendChild(css);

  /* ─────────── tutor view ─────────── */
  if (E.mode === 'tutor'){
    const banner = document.createElement('div');
    banner.className = 'elog-banner'; banner.id = 'elogBanner';
    banner.textContent = 'Tutor view: loading ' + E.student + "'s error-log activity…";
    document.body.insertBefore(banner, document.body.firstChild);
    // Reset All would only wipe the tutor's local view; hide it to avoid confusion
    document.querySelectorAll('.resetbtn').forEach(b => b.style.display = 'none');

    fetch(E.submitUrl + '?kind=review&key=' + encodeURIComponent(E.key))
      .then(r => r.json())
      .then(d => {
        if (!d.ok) throw new Error(d.error || 'error');
        if (!Array.isArray(d.reviews)) throw new Error('old-script');
        showTutor(d.reviews);
      })
      .catch(err => {
        banner.textContent = err.message === 'old-script'
          ? 'The Google Apps Script is still the old version, so error-log activity can’t be loaded yet. Paste the updated script and deploy a new version (see SETUP.md).'
          : 'Could not load error-log activity from the Google Sheet. Try again in a moment.';
      });

    function showTutor(recs){
      const by = {};   // set|qid -> records oldest first
      recs.sort((a,b) => String(a.at).localeCompare(String(b.at))).forEach(r => {
        (by[r.set + '|' + r.qid] = by[r.set + '|' + r.qid] || []).push(r);
      });
      const line = r => {
        const res = r.pick ? (r.ok ? '<span class="elog-ok">✓ right</span>' : '<span class="elog-bad">✗ wrong</span>') : '<span class="elog-bad">revealed without answering</span>';
        return `${res}${r.pick ? ` · picked <b>${r.pick}</b>${r.ok ? '' : ` (key ${r.key})`}` : ''}${r.first && r.first !== r.pick ? ` · first pick ${r.first}` : ''} · ${r.changes} change${r.changes===1?'':'s'} · timer ${r.sec ? fmt(r.sec) : 'not used'} · ${new Date(r.at).toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})}`;
      };
      let total = 0, done = 0, firstOk = 0;
      const rows = [];
      Object.keys(DATASETS).forEach(set => {
        const D = DATASETS[set];
        let sDone = 0, sOk = 0;
        D.twins.concat(D.originals).forEach(q => {
          const rs = by[set + '|' + q.qid] || [];
          const card = document.querySelector(`.qcard[data-set="${set}"][data-qid="${q.qid}"] .qbody`);
          if (kind(q) === 'twin'){ total++; if (rs.length){ done++; sDone++; if (rs[0].ok) { firstOk++; sOk++; } } }
          if (!card) return;
          const div = document.createElement('div');
          if (!rs.length){ div.className = 'elog-t'; div.innerHTML = `${esc(E.student)} hasn't checked this one yet.`; }
          else {
            div.className = 'elog-t ' + (rs[0].ok ? 'ok' : 'bad');
            div.innerHTML = `<b>${esc(E.student)}, first try:</b> ${line(rs[0])}` +
              (rs.length > 1 ? `<span class="r"><b>Latest (round ${rs.length}):</b> ${line(rs[rs.length-1])}</span>` : '');
          }
          card.insertBefore(div, card.firstChild);
          if (kind(q) === 'twin'){
            const r = rs[0];
            rows.push(`<tr><td>${esc(D.title)}</td><td>Twin ${q.number}</td><td>Q${q.origNum}</td><td>${q.skill}</td>
              <td>${r ? (r.pick ? (r.ok ? '<span class="elog-ok">✓</span> ' : '<span class="elog-bad">✗</span> ') + r.pick : '<span class="elog-bad">no answer</span>') : '—'}</td>
              <td>${r ? (r.sec ? fmt(r.sec) : '—') : ''}</td><td>${r ? r.changes : ''}</td>
              <td>${rs.length > 1 ? (rs[rs.length-1].ok ? '<span class="elog-ok">✓</span> ' : '<span class="elog-bad">✗</span> ') + (rs[rs.length-1].pick || '—') + ` (round ${rs.length})` : ''}</td></tr>`);
          }
        });
        const tw = D.twins.length;
        const bar = document.querySelector(`#topset-${set} .controlsbar`);
        if (bar){
          const p = document.createElement('div'); p.className = 'elog-sum';
          p.innerHTML = `<b>${esc(E.student)}'s twin practice:</b> ${sDone}/${tw} checked · ${sOk} right on the first try`;
          bar.parentNode.insertBefore(p, bar.nextSibling);
        }
      });
      const ov = document.getElementById('overviewSection');
      if (ov){
        const sec = document.createElement('div');
        sec.innerHTML = `<h2>${esc(E.student)}'s twin practice (live)</h2>
          <p class="note">${done}/${total} twins checked · ${firstOk} right on the first try. “First try” is the answer showing when ${esc(E.student)} first opened the explanation; later rounds come after Reset All.</p>
          <div class="tablewrap"><table class="ovtable"><thead><tr><th>Set</th><th>Twin</th><th>Original</th><th>Skill</th><th>First try</th><th>Timer</th><th>Changes</th><th>Latest</th></tr></thead>
          <tbody>${rows.join('') || '<tr><td colspan="8">Nothing checked yet.</td></tr>'}</tbody></table></div>`;
        ov.insertBefore(sec, ov.firstChild);
      }
      document.getElementById('elogBanner').textContent = `Tutor view: ${E.student}'s answers come from the Google Sheet, refreshed when this page opens. Nothing you click here is saved or sent.`;
    }
    return;
  }

  /* ─────────── student view ─────────── */
  const K = E.ns + '::elog::';
  const get = (k, d) => { try { const v = localStorage.getItem(K + k); return v ? JSON.parse(v) : d; } catch(e){ return d; } };
  const put = (k, v) => { try { localStorage.setItem(K + k, JSON.stringify(v)); } catch(e){} };
  // meta[set|qid] = { first, changes, revealedRound, round }  (round survives Reset All)
  const meta = get('meta', {});
  const M = (set, qid) => meta[set + '|' + qid] = meta[set + '|' + qid] || { first:null, changes:0, revealedRound:false, round:1 };

  function snapshot(){
    const s = {};
    Object.keys(DATASETS).forEach(set => {
      const st = state[set], t = {};
      Object.keys(st.timers).forEach(q => { if (st.timers[q].seconds) t[q] = st.timers[q].seconds; });
      s[set] = { sel: st.selections, rev: Object.keys(st.revealed).filter(q => st.revealed[q]), t };
    });
    put('state', s); put('meta', meta);
  }

  const origSelect = selectChoice, origReveal = toggleReveal, origReset = doResetAll;
  let restoring = false;

  selectChoice = function(set, qid, idx){
    const m = M(set, qid), prev = state[set].selections[qid];
    if (!restoring && !m.revealedRound){
      if (m.first == null) m.first = idx;
      else if (prev !== idx) m.changes++;
    }
    origSelect(set, qid, idx);
    if (!restoring) snapshot();
  };

  toggleReveal = function(set, qid){
    const opening = !state[set].revealed[qid];
    origReveal(set, qid);
    if (restoring) return;
    const m = M(set, qid);
    if (opening && !m.revealedRound){
      m.revealedRound = true;
      const q = QMAP[set][qid], sel = state[set].selections[qid];
      queue({
        kind:'review', id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7),
        student: E.student, at: new Date().toISOString(),
        set, setTitle: DATASETS[set].title, qid, card: kind(q) === 'twin' ? 'Twin ' + q.number : 'Q' + q.number,
        type: kind(q), origNum: q.origNum || q.number, skill: String(q.skill).replace(/<[^>]+>/g,''),
        pick: LET(sel), key: LET(q.correct), ok: sel === q.correct,
        first: LET(m.first), changes: m.changes, sec: state[set].timers[qid] ? state[set].timers[qid].seconds : 0,
        round: m.round
      });
    }
    snapshot();
  };

  doResetAll = function(){
    origReset();
    Object.keys(meta).forEach(k => {
      const m = meta[k];
      if (m.revealedRound) m.round++;
      m.first = null; m.changes = 0; m.revealedRound = false;
    });
    snapshot();
  };

  // restore this device's progress
  const saved = get('state', {});
  restoring = true;
  Object.keys(saved).forEach(set => {
    if (!DATASETS[set]) return;
    const s = saved[set];
    Object.keys(s.sel || {}).forEach(qid => { if (QMAP[set][qid]) selectChoice(set, qid, s.sel[qid]); });
    (s.rev || []).forEach(qid => { if (QMAP[set][qid]) toggleReveal(set, qid); });
    Object.keys(s.t || {}).forEach(qid => {
      const t = state[set].timers[qid]; if (!t) return;
      t.seconds = s.t[qid];
      const d = document.getElementById(`timerDisplay-${set}-${qid}`); if (d) d.textContent = formatTime(t.seconds);
    });
  });
  restoring = false;
  setInterval(snapshot, 5000);
  window.addEventListener('pagehide', snapshot);

  /* outbox: records wait here until the Sheet accepts them */
  function queue(rec){ put('outbox', get('outbox', []).concat([rec])); flush(); }
  let busy = false;
  async function flush(){
    if (busy || !/^https?:\/\//.test(E.submitUrl)) return;
    busy = true;
    let failed = false;
    try {
      for (const rec of get('outbox', [])){
        try {
          const res = await fetch(E.submitUrl, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(rec) });
          const d = await res.json();
          if (!d.ok) throw new Error(d.error || 'rejected');
          put('outbox', get('outbox', []).filter(r => r.id !== rec.id));
        } catch(e){ failed = true; break; }
      }
    } finally { busy = false; }
    // records queued while this loop was running go out now, not on the next 60s retry
    if (!failed && get('outbox', []).length) flush();
  }
  flush();
  setInterval(flush, 60000);
})();

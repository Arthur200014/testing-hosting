/* ОГЭ 18 · парный формат и микс. Использует существующий Firebase и генераторы гайда. */
(() => {
  'use strict';
  const originalInit = initialGeneratedState, originalApply = applyState, originalReplace = replaceGenerated, originalRender = renderAnswer;
  const pairRows = [], homes = new Map(), seenFeedback = new Map();
  const css = document.createElement('style');
  css.textContent = [
    '.pair18-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin-bottom:14px}',
    '.pair18-row>.practice-card{min-width:0;margin:0}',
    '.pair18-owner{font-size:11px;font-weight:900;color:#ffe47e;display:block;letter-spacing:.04em;margin:3px 0}',
    '.pair18-row .solution-field{min-height:160px;resize:vertical;background-color:#fffcf0;background-image:linear-gradient(#529bd026 1px,transparent 1px),linear-gradient(90deg,#529bd026 1px,transparent 1px);background-size:22px 22px;line-height:22px}',
    '.pair18-row .answer-input{width:95px;max-width:100%;font-size:15px}',
    '.board-toolbar:not(.hidden){position:fixed!important;left:8px!important;top:76px!important;right:auto!important;bottom:auto!important;width:64px!important;max-height:calc(100vh - 90px);overflow-y:auto;z-index:10010!important}',
    '.board-toolbar .board-head{display:flex;flex-direction:column;gap:4px;font-size:0;cursor:default!important}',
    '.board-toolbar .board-head>b{font-size:10px;writing-mode:horizontal-tb}',
    '.board-toolbar .board-tools{display:flex;flex-direction:column;align-items:center;gap:7px}',
    '.board-toolbar .board-tool{min-width:42px;max-width:54px;padding:7px 4px;font-size:15px}',
    '.board-toolbar #toolColor{width:34px;height:34px;padding:0}', '.board-toolbar #toolWidth{width:44px}',
    '.board-toolbar #toolClear{font-size:9px;white-space:normal}',
    '.lesson-mini:not(.hidden){position:fixed!important;left:8px!important;top:auto!important;bottom:8px!important;right:auto!important;z-index:10015;display:flex;flex-direction:column;align-items:center;width:64px;padding:6px;gap:4px}',
    '.lesson-mini #lessonWho{max-width:54px;overflow:hidden;text-overflow:ellipsis;font-size:10px}',
    '.lesson-mini #lessonOnline{font-size:9px;text-align:center}',
    '.lesson-mini button{font-size:10px;max-width:58px;padding:4px 2px}',
    '.pair18-row .show-solution.hidden{display:inline-flex!important}',
    '.pair18-flash{position:fixed;inset:0;z-index:30000;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:clamp(35px,7vw,72px);font-weight:1000;animation:pair18Fade .75s ease-out forwards}',
    '.pair18-flash.good{background:#27b55a96;color:#fff}.pair18-flash.bad{background:#d8333690;color:#fff}',
    '@keyframes pair18Fade{0%{opacity:0}15%{opacity:1}68%{opacity:1}100%{opacity:0}}',
    '.mix18-box{margin:35px auto;max-width:1180px;padding:18px;border:2px solid #398cbc;border-radius:18px;background:#0b2a48;color:#fff}',
    '.mix18-box h2{margin:0 0 8px;color:#fff}.mix18-buttons{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}',
    '.mix18-buttons button{border:0;border-radius:9px;padding:10px 16px;background:#ffe47e;color:#172d44;font-weight:900;cursor:pointer}',
    '.mix18-box .pair18-row{margin-top:16px}.mix18-status{font-weight:800}',
    '@media(max-width:780px){.pair18-row{grid-template-columns:minmax(0,1fr)}.board-toolbar:not(.hidden){left:2px!important;top:75px!important;width:52px!important}.lesson-mini:not(.hidden){left:2px!important;width:52px!important}}'
  ].join('\n');document.head.appendChild(css);
  function other(s) {
    const x=clone(s);
    switch(s.kind){
      case 'rhombus_diag': case 'rhombus_area': x.dx=s.dx===3?4:3;break;
      case 'right_leg': x.h=s.h===7?6:7;break;
      case 'segment_ab':x.crossY=s.crossY===3?4:3;break;
      case 'point_distance':x.a=[1,7];x.b=[5,4];break;
      case 'triangle_midline':x.c=[s.c[0]===9?7:9,s.c[1]];break;
      case 'trapezoid_midline': case 'trapezoid_area':x.top=s.top===2?4:2;break;
      case 'ratio_segment':x.t=s.mode==='am_longer'?4/5:1/4;break;
      case 'triangle_area':x.base=s.base===6?8:6;break;
      case 'parallelogram_area':x.base=s.base===6?7:6;break;
      case 'circle_ratio':x.r2=x.r1*(s.r2/s.r1===3?2:3);break;
    }
    return JSON.stringify(x)===JSON.stringify(s)?generateSpec('g'+(s.kind==='circle_ratio'?4:1)):x;
  }
  initialGeneratedState=function(){const v=originalInit();for(const [id,s] of Object.entries(v))v[id+'-b']=other(s);return v};
  function sameKind(ch,original,mate){
    let s=original||generateSpec(ch);
    for(let i=0;i<120;i++){const c=generateSpec(ch);if(c.kind===s.kind&&(!s.mode||c.mode===s.mode)&&(!s.use||c.use===s.use)&&JSON.stringify(c)!==JSON.stringify(s)&&JSON.stringify(c)!==JSON.stringify(mate)){return c}}
    return other(s);
  }
  replaceGenerated=function(id){
    const card=document.querySelector('[data-gen-id="'+id+'"]');if(!card)return;
    const ch=card.dataset.genChapter,mateId=id.endsWith('-b')?id.slice(0,-2):id+'-b';
    const s=sameKind(ch,localState.generated[id]||initialGeneratedState()[id],localState.generated[mateId]);
    localState.generated[id]=s;delete localState.answers[id];
    const inp=card.querySelector('.answer-input');if(inp)inp.value='';
    const sol=document.getElementById('solution-'+id);if(sol)sol.classList.add('hidden');
    renderGenerated(id);sharedPatch('generated/'+id,s);sharedPatch('answers/'+id,null);
  };
  const cards=[...document.querySelectorAll('.generated-card[data-gen-id]')];
  cards.forEach((card,i)=>{
    const id=card.dataset.genId,cloneCard=card.cloneNode(true);
    cloneCard.innerHTML=cloneCard.innerHTML.replaceAll(id,id+'-b');
    cloneCard.dataset.genId=id+'-b';
    const row=document.createElement('div');row.className='pair18-row';row.dataset.pairKind=id;
    const anchor=document.createComment('pair18-home-'+id);
    card.parentNode.insertBefore(anchor,card);card.parentNode.insertBefore(row,card);
    row.append(card,cloneCard);
    card.querySelector('.generated-top')?.insertAdjacentHTML('afterbegin','<small class="pair18-owner">УЧЕНИК 1</small>');
    cloneCard.querySelector('.generated-top')?.insertAdjacentHTML('afterbegin','<small class="pair18-owner">УЧЕНИК 2</small>');
    homes.set(id,{anchor,row});pairRows.push(row);
    const newId=id+'-b';
    cloneCard.querySelector('.regen-one')?.addEventListener('click',()=>replaceGenerated(newId));
    cloneCard.querySelector('.solution-field')?.addEventListener('input',e=>{localState.notes[newId]=e.target.value;clearTimeout(noteTimers[newId]);noteTimers[newId]=setTimeout(()=>sharedPatch('notes/'+newId,e.target.value),140)});
    cloneCard.querySelector('.answer-input')?.addEventListener('input',e=>{localState.answers[newId]={...(localState.answers[newId]||{}),value:e.target.value,checked:false};clearTimeout(noteTimers['a'+newId]);noteTimers['a'+newId]=setTimeout(()=>sharedPatch('answers/'+newId,localState.answers[newId]),140)});
    cloneCard.querySelector('.check-answer')?.addEventListener('click',()=>{
      const input=cloneCard.querySelector('.answer-input'),val=normAnswer(input.value),target=normAnswer(cloneCard.querySelector('.check-answer').dataset.correct);
      const ok=val!==''&&(val===target||(Number.isFinite(+val)&&Number.isFinite(+target)&&Math.abs(+val-(+target))<1e-5));
      localState.answers[newId]={value:input.value,checked:true,ok,checkedAt:Date.now()};
      renderAnswer(newId);sharedPatch('answers/'+newId,localState.answers[newId]);showFlash(ok);
    });
    cloneCard.querySelector('.show-solution')?.addEventListener('click',()=>{
      if(connected&&role!=='teacher')return;
      const b=document.getElementById('solution-'+newId);b?.classList.toggle('hidden');
    });
  });
  qsa('.check-answer').filter(b=>!b.dataset.answerId.endsWith('-b')).forEach(b=>b.addEventListener('click',()=>{
    const id=b.dataset.answerId,s=localState.answers[id];if(!s?.checked)return;
    s.checkedAt=Date.now();sharedPatch('answers/'+id,s);showFlash(s.ok);
  }));
  function showFlash(ok){const div=document.createElement('div');div.className='pair18-flash '+(ok?'good':'bad');div.textContent=ok?'✓ Верно!':'✕ Попробуй ещё';document.body.appendChild(div);setTimeout(()=>div.remove(),760)}
  function onSharedAnswers(){for(const [id,s] of Object.entries(localState.answers||{})){const at=Number(s?.checkedAt||0);if(at&&at!==seenFeedback.get(id)&&Math.abs(Date.now()-at)<2500){seenFeedback.set(id,at);showFlash(s.ok)}}}
  applyState=function(s){if(!s)return;const value={...s,generated:{...initialGeneratedState(),...(s.generated||{})}};originalApply(value);mixState=s.mix||null;renderMix();onSharedAnswers();renderSolutions()};
  function renderSolutions(){document.querySelectorAll('.generated-card .show-solution').forEach(b=>{b.classList.remove('hidden');b.disabled=!!connected&&role!=='teacher';b.title=b.disabled?'Решение открывает учитель':'Показать решение'})}
  document.addEventListener('click',e=>{const b=e.target.closest('.generated-card .show-solution');if(b&&connected&&role!=='teacher'){e.preventDefault();e.stopImmediatePropagation()}},true);
  const board=$('boardToolbar');if(board){
    board.querySelector('.board-tools')?.insertAdjacentHTML('beforeend','<button class="board-tool" type="button" id="pairPull18" title="Притянуть учеников к этому месту">⇣</button>');
    $('pairPull18').onclick=()=>{if(connected&&role==='teacher'&&FB)FB.set(FB.ref(db,rootPath()+'/messages/pull'),{top:Math.round(scrollY),at:Date.now()}).catch(()=>{})};
  }
  let seenPull=0;
  const origSubscribe=subscribeAll;subscribeAll=function(){origSubscribe();unsubs.push(FB.onValue(FB.ref(db,rootPath()+'/messages/pull'),snap=>{const v=snap.val();if(role==='student'&&v&&v.at!==seenPull&&Date.now()-v.at<2500){seenPull=v.at;window.scrollTo({top:v.top,behavior:'smooth'})}}))};
  const mix=document.createElement('section');mix.className='mix18-box';mix.id='mix18';mix.innerHTML='<h2>Микс · 12 станций</h2><p>Каждый вид задания встречается один раз, порядок случайный. На станции два разных варианта для учеников.</p><div class="mix18-buttons"><button id="mix18Start">Начать микс</button><button id="mix18Next">Следующая станция →</button><button id="mix18End">Завершить микс</button></div><div class="mix18-status" id="mix18Status">Готово к повторению</div><div id="mix18Host"></div>';
  (document.querySelector('main')||document.body).appendChild(mix);
  const kinds=[...new Map(cards.map(c=>[initialGeneratedState()[c.dataset.genId]?.kind,c.dataset.genId])).values()];
  let mixState=null;
  function ordered(seed){const a=[...kinds];let x=seed>>>0;for(let i=a.length-1;i>0;i--){x=(Math.imul(1664525,x)+1013904223)>>>0;const j=x%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
  function restoreRows(){for(const {anchor,row} of homes.values()){if(row.parentElement===$('mix18Host'))anchor.parentNode.insertBefore(row,anchor.nextSibling)}}
  function renderMix(){
    restoreRows();$('mix18Host').innerHTML='';
    if(!mixState?.active){$('mix18Status').textContent='Готово к повторению';return}
    const order=ordered(mixState.seed),index=Math.max(0,Math.min(order.length-1,+mixState.index||0)),id=order[index];
    $('mix18Status').textContent='Станция '+(index+1)+' из '+order.length+' · '+(taskInfo(localState.generated[id]||initialGeneratedState()[id]).type);
    const row=homes.get(id)?.row;if(row){$('mix18Host').appendChild(row);renderGenerated(id);renderGenerated(id+'-b')}
  }
  async function clearInk(){if(connected&&role==='teacher'&&FB)try{await FB.runTransaction(FB.ref(db,rootPath()+'/pads/boardEpoch'),v=>(+v||0)+1)}catch{}}
  function setMix(data){mixState=data;renderMix();sharedPatch('mix',data);$('mix18').scrollIntoView({behavior:'smooth',block:'start'})}
  $('mix18Start').onclick=()=>{if(connected&&role!=='teacher')return;clearInk();setMix({active:true,seed:(Date.now()>>>0),index:0})};
  $('mix18Next').onclick=()=>{if(!mixState?.active||(connected&&role!=='teacher'))return;if(mixState.index>=kinds.length-1){setMix({active:false});return}clearInk();setMix({...mixState,index:mixState.index+1})};
  $('mix18End').onclick=()=>{if(connected&&role!=='teacher')return;setMix({active:false})};
  for(const b of [$('mix18Start'),$('mix18Next'),$('mix18End')])b.addEventListener('click',renderSolutions);
  localState.generated={...initialGeneratedState(),...(localState.generated||{})};
  renderGeneratedAll();renderSolutions();renderMix();
})();
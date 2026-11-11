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
    '.board-toolbar .lesson-mini:not(.hidden){position:static!important;left:auto!important;bottom:auto!important;right:auto!important;top:auto!important;display:flex;flex-direction:column;align-items:center;width:100%;padding:5px 0;gap:4px;border:0;border-top:1px solid #457da0;box-shadow:none;background:transparent}',
    '.lesson-mini #lessonWho{max-width:54px;overflow:hidden;text-overflow:ellipsis;font-size:10px}',
    '.lesson-mini #lessonOnline{font-size:9px;text-align:center}',
    '.lesson-mini button{font-size:10px;max-width:58px;padding:4px 2px}',
    '.pair18-row .show-solution.hidden{display:inline-flex!important}',
    '.generated-card .show-solution{display:inline-flex!important;align-items:center;font-size:12px}',
    '.pair18-row .solution-step-list{padding-left:20px;margin:7px 0;font-size:13px;line-height:1.55}',
    '.pair18-row .solution-step-list li{margin:5px 0}',
    '.pair18-flash{position:fixed;inset:0;z-index:30000;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:clamp(35px,7vw,72px);font-weight:1000;animation:pair18Fade .75s ease-out forwards}',
    '.pair18-flash.good{background:#27b55a96;color:#fff}.pair18-flash.bad{background:#d8333690;color:#fff}',
    '@keyframes pair18Fade{0%{opacity:0}15%{opacity:1}68%{opacity:1}100%{opacity:0}}',
    '.mix18-box{margin:35px auto;max-width:1180px;padding:18px;border:2px solid #398cbc;border-radius:18px;background:#0b2a48;color:#fff}',
    '.mix18-box h2{margin:0 0 8px;color:#fff}.mix18-buttons{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}',
    '.mix18-buttons button{border:0;border-radius:9px;padding:10px 16px;background:#ffe47e;color:#172d44;font-weight:900;cursor:pointer}',
    '.mix18-box .pair18-row{margin-top:16px}.mix18-status{font-weight:800}',
    '.pair18-assignment{position:fixed;left:78px;top:90px;z-index:18000;max-width:300px;width:calc(100vw - 95px);background:#082942;border:2px solid #5cb8da;border-radius:15px;padding:13px;color:white;box-shadow:0 16px 40px #0008}',
    '.pair18-assignment[hidden]{display:none!important}.pair18-assignment label{display:grid;gap:5px;margin:12px 0;font-size:13px;font-weight:850}',
    '.pair18-assignment select{width:100%;padding:8px;border-radius:8px;background:white;color:#162d42}',
    '.pair18-assign-top{display:flex;justify-content:space-between;gap:6px}.pair18-assign-top button{background:transparent;border:0;color:white;font-size:23px}',
    '.pair18-row .pair18-owner{max-width:55%;white-space:normal}',
    '@media(max-width:780px){.pair18-row{grid-template-columns:minmax(0,1fr)}.board-toolbar:not(.hidden){left:2px!important;top:75px!important;width:52px!important}.lesson-mini:not(.hidden){left:2px!important;width:52px!important}}'
  ].join('\n');document.head.appendChild(css);
  function other(s) {
    const x=clone(s);
    switch(s.kind){
      case 'rhombus_diag': case 'rhombus_area': x.dx=[3,4,5].find(v=>v!==s.dx&&v!==s.dy)||s.dx+1;break;
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
    const s=original||generateSpec(ch),oldAnswer=taskInfo(s).answer;
    let alternate=null,answerChanged=null;
    for(let i=0;i<180;i++){
      const c=generateSpec(ch);
      if(c.kind!==s.kind||(s.mode&&c.mode!==s.mode)||(s.use&&c.use!==s.use)||
         JSON.stringify(c)===JSON.stringify(s)||JSON.stringify(c)===JSON.stringify(mate))continue;
      alternate=c;
      if(Math.abs(Number(taskInfo(c).answer)-Number(oldAnswer))>1e-8){
        answerChanged=c;
        if(!mate||Math.abs(Number(taskInfo(c).answer)-Number(taskInfo(mate).answer))>1e-8)return c;
      }
    }
    if(answerChanged)return answerChanged;
    const fallback=other(s);
    return JSON.stringify(fallback)===JSON.stringify(mate)?(alternate||fallback):fallback;
  }
  replaceGenerated=function(id){
    const card=document.querySelector('[data-gen-id="'+id+'"]');if(!card)return;
    const ch=card.dataset.genChapter,mateId=id.endsWith('-b')?id.slice(0,-2):id+'-b';
    const s=sameKind(ch,localState.generated[id]||initialGeneratedState()[id],localState.generated[mateId]);
    localState.generated[id]=s;delete localState.answers[id];
    localState.notes=localState.notes||{};localState.notes[id]='';
    const note=card.querySelector('.solution-field');if(note)note.value='';
    const inp=card.querySelector('.answer-input');if(inp)inp.value='';
    const sol=document.getElementById('solution-'+id);if(sol)sol.classList.add('hidden');
    localState.pairSolutions=localState.pairSolutions||{};localState.pairSolutions[id]=0;
    renderGenerated(id);renderSolutions();sharedPatch('generated/'+id,s);sharedPatch('answers/'+id,null);sharedPatch('pairSolutions/'+id,0);sharedPatch('notes/'+id,'');
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
      localState.answers[newId]={value:input.value,checked:true,ok,checkedAt:Date.now()};seenFeedback.set(newId,localState.answers[newId].checkedAt);
      renderAnswer(newId);sharedPatch('answers/'+newId,localState.answers[newId]);showFlash(ok);
    });
    // Solution buttons are handled once, in capture phase, for both participants.
  });
  qsa('.check-answer').filter(b=>!b.dataset.answerId.endsWith('-b')).forEach(b=>b.addEventListener('click',()=>{
    const id=b.dataset.answerId,s=localState.answers[id];if(!s?.checked)return;
    s.checkedAt=Date.now();seenFeedback.set(id,s.checkedAt);sharedPatch('answers/'+id,s);showFlash(s.ok);
  }));
  function showFlash(ok){const div=document.createElement('div');div.className='pair18-flash '+(ok?'good':'bad');div.textContent=ok?'✓ Верно!':'✕ Попробуй ещё';document.body.appendChild(div);setTimeout(()=>div.remove(),760)}
  function onSharedAnswers(){for(const [id,s] of Object.entries(localState.answers||{})){const at=Number(s?.checkedAt||0);if(at&&at!==seenFeedback.get(id)&&Math.abs(Date.now()-at)<2500){seenFeedback.set(id,at);showFlash(s.ok)}}}
  applyState=function(s){if(!s)return;const value={...s,generated:{...initialGeneratedState(),...(s.generated||{})}};originalApply(value);localState.pairSolutions=s.pairSolutions||{};localState.pairOwners=s.pairOwners||{};localState.pairOwnersLocked=!!s.pairOwnersLocked;mixState=s.mix||null;renderMix();onSharedAnswers();renderSolutions();renderOwnership()};
  function solutionSteps(spec) {
    const info=taskInfo(spec),f=fmtNum;
    let steps=[];
    switch(spec.kind){
      case 'rhombus_diag':steps=['Подсчитываем длины диагоналей по клеткам: '+2*spec.dx+' и '+2*spec.dy+'.','Сравниваем две длины.','Большая диагональ равна '+f(info.answer)+'.'];break;
      case 'right_leg':steps=['Катеты идут по горизонтали и вертикали сетки.','Длины катетов: '+spec.h+' и '+spec.v+' клеток.','Больший катет '+f(info.answer)+'.'];break;
      case 'segment_ab':steps=['По рисунку определяем подобные треугольники.','Доля оставшегося горизонтального отрезка: ('+spec.apexY+' − '+spec.crossY+') : ('+spec.apexY+' − '+spec.topY+').','AB = 2 · '+spec.halfTop+' · ('+(spec.apexY-spec.crossY)+' / '+(spec.apexY-spec.topY)+') = '+f(info.answer)+'.'];break;
      case 'point_distance':{
        const dx=Math.abs(spec.b[0]-spec.a[0]),dy=Math.abs(spec.b[1]-spec.a[1]);
        steps=['По клеткам находим горизонтальное смещение '+dx+' и вертикальное '+dy+'.','Используем теорему Пифагора: d² = '+dx+'² + '+dy+'² = '+(dx*dx+dy*dy)+'.','d = √'+(dx*dx+dy*dy)+' = '+f(info.answer)+'.'];break;}
      case 'triangle_midline':{const length=Math.abs(spec.c[0]-spec.a[0]);steps=['По клеткам находим AC = '+length+'.','Средняя линия треугольника вдвое короче AC.','m = '+length+' : 2 = '+f(info.answer)+'.'];break;}
      case 'trapezoid_midline':steps=['По клеткам основания равны '+spec.top+' и '+spec.bottom+'.','Средняя линия = (a + b) / 2.','m = ('+spec.top+' + '+spec.bottom+') : 2 = '+f(info.answer)+'.'];break;
      case 'ratio_segment':steps=['По рисунку находим, на какие доли M делит AC.','Большую часть делим на меньшую.','Искомое отношение равно '+f(info.answer)+'.'];break;
      case 'triangle_area':steps=['Основание треугольника равно '+spec.base+', высота '+spec.h+'.','Площадь треугольника S = a · h / 2.','S = '+spec.base+' · '+spec.h+' / 2 = '+f(info.answer)+'.'];break;
      case 'parallelogram_area':steps=['Основание параллелограмма равно '+spec.base+', высота '+spec.h+'.','Площадь S = a · h.','S = '+spec.base+' · '+spec.h+' = '+f(info.answer)+'.'];break;
      case 'rhombus_area':steps=['Диагонали ромба равны '+2*spec.dx+' и '+2*spec.dy+'.','Площадь ромба — половина произведения диагоналей.','S = '+2*spec.dx+' · '+2*spec.dy+' / 2 = '+f(info.answer)+'.'];break;
      case 'trapezoid_area':steps=['Основания трапеции '+spec.top+' и '+spec.bottom+', высота '+spec.h+'.','Площадь S = (a + b) · h / 2.','S = ('+spec.top+' + '+spec.bottom+') · '+spec.h+' / 2 = '+f(info.answer)+'.'];break;
      default:{const k=spec.r2/spec.r1;steps=[spec.use==='diameter'?'Сравниваем диаметры двух кругов.':'Сравниваем радиусы двух кругов.','Отношение радиусов равно '+f(k)+'. Площади относятся как квадраты радиусов.','S₂/S₁ = '+f(k)+'² = '+f(info.answer)+'.'];break;}
    }
    return steps;
  }
  function renderSolutions(){
    document.querySelectorAll('.generated-card .show-solution').forEach(b=>{
      const id=b.dataset.solutionFor,card=b.closest('[data-gen-id]'),spec=localState.generated[id]||initialGeneratedState()[id];
      if(!spec||!card)return;
      const steps=solutionSteps(spec),count=Math.min(steps.length,Math.max(0,+((localState.pairSolutions||{})[id]||0))),box=document.getElementById('solution-'+id);
      b.classList.remove('hidden');b.disabled=!!connected&&role!=='teacher';
      b.title=b.disabled?'Решение открывает учитель':'Открыть очередной шаг';
      b.textContent=count>=steps.length?'Решение раскрыто':'Шаг решения '+(count+1)+' из '+steps.length;
      if(box){box.innerHTML='<ol class="solution-step-list">'+steps.slice(0,count).map(s=>'<li>'+esc(s)+'</li>').join('')+'</ol>';box.classList.toggle('hidden',count===0)}
    });
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('.generated-card .show-solution');if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(connected&&role!=='teacher')return;
    const id=b.dataset.solutionFor,spec=localState.generated[id]||initialGeneratedState()[id],max=solutionSteps(spec).length;
    localState.pairSolutions=localState.pairSolutions||{};
    const next=Math.min(max,(+localState.pairSolutions[id]||0)+1);
    localState.pairSolutions[id]=next;renderSolutions();sharedPatch('pairSolutions/'+id,next);
  },true);
  const board=$('boardToolbar');if(board){
    const mini=$('lessonMini');if(mini)board.querySelector('.board-tools')?.appendChild(mini);
    board.querySelector('.board-tools')?.insertAdjacentHTML('beforeend','<button class="board-tool" type="button" id="pairPull18" title="Притянуть учеников к этому месту">⇣</button>');
    $('pairPull18').onclick=()=>{if(connected&&role==='teacher'&&FB)FB.set(FB.ref(db,rootPath()+'/messages/pull'),{top:Math.round(scrollY),at:Date.now()}).catch(()=>{})};
  }
  /* Assigned pupils: the teacher chooses who can edit left and right variants. */
  const ownerButton=document.createElement('button');ownerButton.type='button';ownerButton.id='pair18AssignButton';ownerButton.className='board-tool';ownerButton.textContent='♙';ownerButton.title='Назначить учеников';
  board?.querySelector('.board-tools')?.appendChild(ownerButton);
  const ownerPanel=document.createElement('aside');ownerPanel.id='pair18Assignment';ownerPanel.className='pair18-assignment';ownerPanel.hidden=true;
  ownerPanel.innerHTML='<div class="pair18-assign-top"><b>Кто решает задачи</b><button type="button" id="pair18CloseAssignment">×</button></div><label>Задача 1<select id="pair18OwnerA"></select></label><label>Задача 2<select id="pair18OwnerB"></select></label><p>Другие ученики наблюдают и видят проверку.</p>';
  document.body.append(ownerPanel);
  ownerButton.onclick=()=>{ownerPanel.hidden=!ownerPanel.hidden;renderOwnership()};
  $('pair18CloseAssignment').onclick=()=>ownerPanel.hidden=true;
  for(const slot of ['a','b'])$('pair18Owner'+slot.toUpperCase()).onchange=e=>assignPair(slot,e.target.value);
  function memberOptions(){
    return Object.entries(activeMembers).filter(([,m])=>m&&m.role==='student'&&m.online!==false)
      .map(([id,m])=>({id,name:String(m.name||'Ученик')})).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  }
  function canEditPair(slot){
    if(!connected||role==='teacher')return true;
    return role==='student'&&String((localState.pairOwners||{})[slot]||'')===String(clientId);
  }
  function renderOwnership(){
    const options=memberOptions(),owners=localState.pairOwners||{};
    ownerButton.hidden=!connected||role!=='teacher';
    if(!connected||role!=='teacher')ownerPanel.hidden=true;
    for(const slot of ['a','b']){
      const U=slot.toUpperCase(),sel=$('pair18Owner'+U),owner=owners[slot]||'';
      sel.innerHTML='<option value="">Не назначен</option>'+options.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
      if(owner&&!options.some(x=>x.id===owner))sel.innerHTML+='<option value="'+esc(owner)+'">Ученик не в сети</option>';
      sel.value=owner;
    }
    document.querySelectorAll('.generated-card[data-gen-id]').forEach(card=>{
      const slot=card.dataset.genId.endsWith('-b')?'b':'a',owner=owners[slot]||'',student=options.find(x=>x.id===owner);
      const label=card.querySelector('.pair18-owner');
      if(label)label.textContent=(slot==='a'?'УЧЕНИК 1':'УЧЕНИК 2')+(student?' · '+student.name:'');
      const edit=canEditPair(slot);
      card.querySelectorAll('.regen-one,.answer-input,.check-answer,.solution-field').forEach(el=>{el.disabled=!edit});
    });
    document.querySelectorAll('.regen-all').forEach(b=>{b.disabled=connected&&role!=='teacher'});
  }
  async function assignPair(slot,id){
    if(!connected||role!=='teacher'||!FB||!db)return;
    const owners=localState.pairOwners||{},other=slot==='a'?'b':'a';
    const values={['pairOwners/'+slot]:id||'',pairOwnersLocked:true};
    if(id&&owners[other]===id)values['pairOwners/'+other]='';
    try{await FB.update(FB.ref(db,rootPath()+'/state'),values)}catch(e){console.warn('Не удалось назначить ученика',e)}
  }
  async function autoAssignPair(){
    if(!connected||role!=='teacher'||localState.pairOwnersLocked||!FB)return;
    const available=memberOptions().map(x=>x.id);if(!available.length)return;
    try{
      await FB.runTransaction(FB.ref(db,rootPath()+'/state/pairOwners'),value=>{
        const owners={...(value||{})},taken=new Set(Object.values(owners).filter(Boolean));let changed=false;
        for(const slot of ['a','b'])if(!owners[slot]){
          const next=available.find(x=>!taken.has(x));if(next){owners[slot]=next;taken.add(next);changed=true}
        }
        return changed?owners:undefined;
      },{applyLocally:false});
    }catch(e){console.warn('Ошибка назначения учеников',e)}
  }
  document.addEventListener('click',e=>{
    if(!connected||role==='teacher')return;
    const card=e.target.closest?.('.generated-card[data-gen-id]');if(!card)return;
    const slot=card.dataset.genId.endsWith('-b')?'b':'a';
    if(!canEditPair(slot)&&e.target.closest?.('.regen-one,.check-answer')){
      e.preventDefault();e.stopImmediatePropagation();
    }
  },true);
  let seenPull=0;
  let metaAt=null;
  const origSubscribe=subscribeAll;subscribeAll=function(){
    metaAt=null;origSubscribe();
    unsubs.push(FB.onValue(FB.ref(db,rootPath()+'/messages/pull'),snap=>{const v=snap.val();if(role==='student'&&v&&v.at!==seenPull&&Date.now()-v.at<2500){seenPull=v.at;window.scrollTo({top:v.top,behavior:'smooth'})}}));
    unsubs.push(FB.onValue(FB.ref(db,rootPath()+'/members'),snap=>{activeMembers=snap.val()||{};renderOwnership();autoAssignPair()}));
    unsubs.push(FB.onValue(FB.ref(db,rootPath()+'/meta/createdAt'),snap=>{const newAt=snap.val();if(!newAt)return;if(metaAt===null){metaAt=newAt;return}if(metaAt!==newAt){metaAt=newAt;if(role==='student')disconnect().catch(console.warn)}}));
  };
  const mix=document.createElement('section');mix.className='mix18-box';mix.id='mix18';mix.innerHTML='<h2>Микс · 12 станций</h2><p>Каждый вид задания встречается один раз, порядок случайный. На станции два разных варианта для учеников.</p><div class="mix18-buttons"><button id="mix18Start">Начать микс</button><button id="mix18Next">Следующая станция →</button><button id="mix18End">Завершить микс</button></div><div class="mix18-status" id="mix18Status">Готово к повторению</div><div id="mix18Host"></div>';
  (document.querySelector('main')||document.body).appendChild(mix);
  const kinds=[...new Map(cards.map(c=>[initialGeneratedState()[c.dataset.genId]?.kind,c.dataset.genId])).values()];
  let mixState=null;
  function ordered(seed){const a=[...kinds];let x=seed>>>0;for(let i=a.length-1;i>0;i--){x=(Math.imul(1664525,x)+1013904223)>>>0;const j=x%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
  function restoreRows(){for(const {anchor,row} of homes.values()){if(row.parentElement===$('mix18Host'))anchor.parentNode.insertBefore(row,anchor.nextSibling)}}
  function renderMix(){
    restoreRows();$('mix18Host').innerHTML='';
    if(!mixState?.active){$('mix18Status').textContent='Готово к повторению';updateMixPermissions();return}
    const order=ordered(mixState.seed),index=Math.max(0,Math.min(order.length-1,+mixState.index||0)),id=order[index];
    $('mix18Status').textContent='Станция '+(index+1)+' из '+order.length+' · '+(taskInfo(localState.generated[id]||initialGeneratedState()[id]).type);
    const row=homes.get(id)?.row;if(row){$('mix18Host').appendChild(row);renderGenerated(id);renderGenerated(id+'-b')}
    updateMixPermissions();
  }
  function updateMixPermissions(){for(const id of ['mix18Start','mix18Next','mix18End'])$(id).disabled=!!connected&&role!=='teacher'}
  async function clearInk(){if(connected&&role==='teacher'&&FB)try{await FB.runTransaction(FB.ref(db,rootPath()+'/pads/boardEpoch'),v=>(+v||0)+1)}catch{}}
  // One atomic payload for the station and both refreshed tasks.
  let mixChanging=false;
  async function setMix(data){
    if(mixChanging)return;
    mixChanging=true;
    try{
      const old=mixState,changed=!!data.active&&(!old?.active||old.index!==data.index||old.seed!==data.seed);
      const payload={mix:data};
      if(changed){
        const id=ordered(data.seed)[Math.min(kinds.length-1,Number(data.index)||0)];
        if(id){
          const second=id+'-b',card=document.querySelector('[data-gen-id="'+id+'"]');
          const chapter=card?.dataset.genChapter||id.split('-')[0];
          const oldA=localState.generated[id]||initialGeneratedState()[id];
          const oldB=localState.generated[second]||initialGeneratedState()[second];
          const a=sameKind(chapter,oldA,oldB),b=sameKind(chapter,oldB,a);
          localState.generated[id]=a;localState.generated[second]=b;
          localState.notes=localState.notes||{};localState.answers=localState.answers||{};
          localState.pairSolutions=localState.pairSolutions||{};
          for(const slotId of [id,second]){
            delete localState.answers[slotId];localState.notes[slotId]='';
            localState.pairSolutions[slotId]=0;
            const el=document.querySelector('[data-gen-id="'+slotId+'"]');
            const input=el?.querySelector('.answer-input');if(input)input.value='';
            const pad=el?.querySelector('.solution-field');if(pad)pad.value='';
            payload['answers/'+slotId]=null;payload['notes/'+slotId]='';
            payload['pairSolutions/'+slotId]=0;
          }
          payload['generated/'+id]=a;payload['generated/'+second]=b;
          renderGenerated(id);renderGenerated(second);
        }
      }
      mixState=data;renderMix();renderSolutions();
      if(connected&&FB&&role==='teacher'){
        await FB.update(FB.ref(db,rootPath()+'/state'),payload);
      }
      $('mix18').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){console.warn('Не удалось переключить станцию микса',e)}
    finally{mixChanging=false}
  }
  // Protect against rapid repeated clicks while the shared board is clearing.
  let stationNavigationBusy=false;
  async function navigateMix(action){
    if(stationNavigationBusy||mixChanging||(connected&&role!=='teacher'))return;
    stationNavigationBusy=true;
    try{await clearInk();await setMix(action())}
    finally{stationNavigationBusy=false}
  }
  $('mix18Start').onclick=()=>navigateMix(()=>({active:true,seed:(Date.now()>>>0),index:0}));
  $('mix18Next').onclick=()=>navigateMix(()=>{
    if(!mixState?.active)return {active:false};
    if(mixState.index>=kinds.length-1)return {active:false};
    return {...mixState,index:mixState.index+1};
  });
  $('mix18End').onclick=()=>navigateMix(()=>({active:false}));
  for(const b of [$('mix18Start'),$('mix18Next'),$('mix18End')])b.addEventListener('click',renderSolutions);
  localState.generated={...initialGeneratedState(),...(localState.generated||{})};localState.pairSolutions=localState.pairSolutions||{};
  renderGeneratedAll();renderSolutions();renderMix();renderOwnership();
})();
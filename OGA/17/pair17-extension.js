/* Pair practice extension for the existing OGE17 guide. Uses its real 40-type bank and Firebase room. */
(()=>{
'use strict';
const bank=window.OGE17PairBank;
if(!bank||bank.size!==40){console.error('ОГЭ №17: не найден банк парных задач');return}
const root='sharedGuides/oge17-quadrilaterals-dragon-guide-v1/currentSession', $=id=>document.getElementById(id);
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const upper=s=>s.toUpperCase(),slots=['a','b'],uid=()=>crypto.randomUUID?.()||Date.now()+'-'+Math.random();
let bridge=null,fb=null,db=null,metaId='',connected=false,pair=null,memberData={},unsubs=[],mounted=null,activeProto=-1,modeRender='',seenCheck={a:'',b:''};
let inputTimers={a:null,b:null},padTimers={a:null,b:null},lastEdit={a:0,b:0},lastPadEdit={a:0,b:0},lastPull='',impactTimer=0,initPending=false;
const $s=(slot,selector)=>$(selector+upper(slot));
function taskNumber(state){return state.mode==='mix'?state.order[Math.min(39,state.mixIndex)]:state.proto}
function makeState(sessionId,proto){return {schema:1,sessionId,mode:'main',proto,order:bank.shuffle([...Array(40)].map((_,i)=>i+1)),mixIndex:0,seq:1,slots:bank.pair(proto),inputs:{},checks:{},pads:{},reveals:{a:0,b:0},owners:{a:'',b:''},locked:false,boardEpoch:0}}
function currentRole(){return bridge?.connected?bridge.role:''}
function myId(){return bridge?.me?.id||''}
function canEdit(slot){return !currentRole()||currentRole()==='teacher'||pair?.owners?.[slot]===myId()}
function canTeach(){return !currentRole()||currentRole()==='teacher'}
function slug(s){return String(s).replace(/[^a-zA-Z0-9_-]/g,'')}
function ensureCss(){if(document.querySelector('link[data-oge17-pair]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='./pair17.css';link.dataset.oge17Pair='';document.head.appendChild(link)}
function participantName(id){
 if(!id)return '';
 return Object.values(memberData).find(x=>x&&x.online!==false&&x.userId===id)?.name||id.replace(/^student_/,'Ученик ');
}
function participants(){
 const active=Object.values(memberData).filter(x=>x?.role==='student'&&x.online!==false);
 return [...new Map(active.map(x=>[x.userId,x])).values()].sort((a,b)=>(Number(a.joinedAt||0)-Number(b.joinedAt||0)));
}
function ensureSidebar(){
 const bar=$('cbToolbar');if(!bar||$('pair17Pull'))return;
 const tools=bar.querySelector('.cb-tools');
 if(!tools)return;
 const sep=document.createElement('div');sep.className='pair17-side-sep';
 const people=document.createElement('button');people.id='pair17People';people.className='cb-tool pair17-side-btn';people.textContent='♙';people.title='Участники занятия';people.setAttribute('aria-label','Участники');people.onclick=()=>{$('pair17MemberBox').hidden=!$('pair17MemberBox').hidden};
 const pull=document.createElement('button');pull.id='pair17Pull';pull.className='cb-tool pair17-side-btn';pull.textContent='⇣';pull.title='Притянуть учеников к позиции учителя';pull.setAttribute('aria-label','Притянуть учеников');pull.onclick=pullStudents;
 tools.append(sep,people,pull);
 const panel=document.createElement('aside');panel.id='pair17MemberBox';panel.className='pair17-members';panel.hidden=true;
 panel.innerHTML='<div class="pair17-members-top"><b>Участники</b><button type="button" id="pair17MembersClose">×</button></div><div id="pair17Roster"></div><div id="pair17Assignment"><label>Левая задача<select id="pair17AssignA"></select></label><label>Правая задача<select id="pair17AssignB"></select></label></div><p>Число подключённых учеников не ограничено парой. Учитель назначает исполнителей.</p>';
 document.body.append(panel);
 $('pair17MembersClose').onclick=()=>panel.hidden=true;
 for(const sl of slots){$('pair17Assign'+upper(sl)).onchange=e=>assign(sl,e.target.value)}
 updateSidebar();
}
function updateSidebar(){
 const pull=$('pair17Pull');if(pull)pull.hidden=currentRole()!=='teacher';
 const assign=$('pair17Assignment');if(assign)assign.hidden=currentRole()!=='teacher';
 const list=$('pair17Roster');
 if(!list)return;
 const all=Object.values(memberData).filter(x=>x&&x.online!==false);
 list.innerHTML=all.length?all.map(m=>'<div class="pair17-member">● '+safe(m.name||'Участник')+' '+(m.role==='teacher'?'(учитель)':'')+'</div>').join(''):'<p>Участники пока не подключились.</p>';
 const pp=participants();
 for(const slot of slots){
   const sel=$('pair17Assign'+upper(slot));const value=pair?.owners?.[slot]||'';
   sel.innerHTML='<option value="">Не назначен</option>'+pp.map(p=>'<option value="'+safe(p.userId)+'">'+safe(p.name)+'</option>').join('');
   if(value&&!pp.some(x=>x.userId===value))sel.innerHTML+='<option value="'+safe(value)+'">'+safe(participantName(value))+' (не в сети)</option>';
   sel.value=value;
 }
}
function mount(){
 const host=$('prototypeMount');if(!host)return;
 if(mounted&&mounted.isConnected)return;
 const existing=document.getElementById('pair17Work');if(existing&&host.contains(existing)){mounted=existing;return}
 const source=host.querySelector('.prototype-main');
 if(source){
   const original=document.createElement('details');original.className='pair17-original';
   original.innerHTML='<summary>Оригинальная задача, чертёж, теория и полный разбор (эталон)</summary>';
   source.replaceWith(original);original.append(source);
 }
 mounted=document.createElement('div');mounted.id='pair17Work';
 mounted.innerHTML='<div class="pair17-heading"><div><small id="pair17Stage">ПАРНАЯ ПРАКТИКА</small><h3 id="pair17Title">Два варианта по прототипу</h3><p id="pair17Explanation">Числа, ответы и решение меняются одновременно.</p></div><button id="pair17BeginMix" type="button">Начать станции-микс</button></div>'+
 '<div class="pair17-progress"><div id="pair17Fill"></div></div>'+
 '<div class="pair17-grid">'+slots.map((sl,i)=>'<article class="pair17-card" data-slot="'+sl+'"><div class="pair17-card-head"><b>Задача '+(i+1)+'</b><span id="pair17Owner'+upper(sl)+'">Ученик '+(i+1)+'</span></div><p id="pair17Question'+upper(sl)+'"></p><button type="button" class="pair17-numbers" id="pair17Numbers'+upper(sl)+'">⟳ Другие числа</button><label class="pair17-label" for="pair17Pad'+upper(sl)+'">Поле для решения</label><textarea id="pair17Pad'+upper(sl)+'" class="pair17-pad" rows="9" placeholder="Можно записывать формулы и вычисления…"></textarea><div class="pair17-answer"><label for="pair17Answer'+upper(sl)+'">Ответ</label><input id="pair17Answer'+upper(sl)+'" type="text" inputmode="decimal" spellcheck="false" placeholder="Число"><button id="pair17Check'+upper(sl)+'" type="button">Проверить</button></div><div id="pair17Feedback'+upper(sl)+'" class="pair17-feedback" aria-live="polite"></div><button id="pair17Step'+upper(sl)+'" class="pair17-step" type="button">Показать шаг решения</button><ol id="pair17Steps'+upper(sl)+'"></ol></article>').join('')+
 '</div><div class="pair17-control"><button id="pair17MixPrev" type="button">← Предыдущая станция</button><span id="pair17MixCounter"></span><button id="pair17MixNext" type="button">Следующая станция →</button><button id="pair17ExitMix" type="button">Завершить микс</button></div>';
 host.append(mounted);
 for(const sl of slots){
   const U=upper(sl);
   $('pair17Numbers'+U).onclick=()=>numbers(sl);
   $('pair17Check'+U).onclick=()=>verify(sl);
   $('pair17Answer'+U).oninput=()=>onInput(sl);
   $('pair17Answer'+U).onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();verify(sl)}};
   $('pair17Pad'+U).oninput=()=>onPad(sl);
   $('pair17Step'+U).onclick=()=>reveal(sl);
 }
 $('pair17BeginMix').onclick=beginMix;
 $('pair17MixPrev').onclick=()=>mixMove(-1);
 $('pair17MixNext').onclick=()=>mixMove(1);
 $('pair17ExitMix').onclick=endMix;
}
function render(){
 mount();
 if(!mounted||!pair)return;
 const proto=taskNumber(pair);
 const originalTask=(typeof flatTasks!=='undefined'&&flatTasks[proto-1])||null;
 const isMix=pair.mode==='mix';
 $('pair17Stage').textContent=isMix?'СТАНЦИЯ-МИКС '+(pair.mixIndex+1)+' / 40':'ПРОТОТИП '+proto+' / 40';
 $('pair17Title').textContent=(originalTask?.title||'Задание №17')+' · два ученика';
 $('pair17Explanation').textContent=isMix?'Все 40 прототипов встречаются по одному разу, порядок перемешан.':'Поменяй числа отдельно у нужного ученика. Чертёж эталона приведён в свёрнутом разделе выше.';
 $('pair17Fill').style.width=((isMix?40+pair.mixIndex+1:proto)/80*100)+'%';
 $('pair17BeginMix').hidden=isMix||proto!==40||!canTeach();
 for(const sl of slots){
   const U=upper(sl),task=pair.slots[sl];
   const changed=$('pair17Question'+U).dataset.nonce!==task.nonce;
   if(changed){
     $('pair17Question'+U).textContent=task.q;$('pair17Question'+U).dataset.nonce=task.nonce;
     $('pair17Answer'+U).value='';$('pair17Pad'+U).value='';seenCheck[sl]='';
     setFeedback(sl,'');
   }
   $('pair17Owner'+U).textContent=pair.owners?.[sl]?participantName(pair.owners[sl]):'Ученик '+(sl==='a'?'1':'2');
   $('pair17Answer'+U).disabled=!canEdit(sl);$('pair17Pad'+U).disabled=!canEdit(sl);
   $('pair17Numbers'+U).disabled=!canEdit(sl);$('pair17Check'+U).disabled=!canEdit(sl);
   $('pair17Step'+U).disabled=!canTeach();
   const steps=task.steps.slice(0,Math.min(task.steps.length,pair.reveals?.[sl]||0));
   $('pair17Steps'+U).innerHTML=steps.map(x=>'<li>'+safe(x)+'</li>').join('');
   $('pair17Step'+U).textContent=steps.length>=task.steps.length?'Все шаги показаны':steps.length?'Следующий шаг':'Показать шаг решения';
   const input=pair.inputs?.[sl];if(input?.nonce===task.nonce&&Date.now()-lastEdit[sl]>330&&document.activeElement!==$('pair17Answer'+U)){
     if($('pair17Answer'+U).value!==input.text)$('pair17Answer'+U).value=input.text||'';
   }
   const pad=pair.pads?.[sl];if(pad?.nonce===task.nonce&&Date.now()-lastPadEdit[sl]>500&&document.activeElement!==$('pair17Pad'+U)){
     if($('pair17Pad'+U).value!==pad.text)$('pair17Pad'+U).value=pad.text||'';
   }
   const result=pair.checks?.[sl];if(result?.nonce===task.nonce&&result.id!==seenCheck[sl])applyCheck(sl,result);
 }
 $('pair17MixPrev').hidden=!isMix;$('pair17MixNext').hidden=!isMix;$('pair17ExitMix').hidden=!isMix;$('pair17MixCounter').hidden=!isMix;
 $('pair17MixPrev').disabled=!canTeach()||pair.mixIndex<=0;
 $('pair17MixNext').disabled=!canTeach()||pair.mixIndex>=39;
 $('pair17MixCounter').textContent=isMix?(pair.mixIndex+1)+' / 40':'';
 updateSidebar();
}
function setFeedback(sl,message,good=null){
 const el=$('pair17Feedback'+upper(sl));if(!el)return;
 el.textContent=message;el.className='pair17-feedback '+(good===null?'':good?'good':'bad');
}
function impact(ok){
 const el=$('pair17Impact')||document.createElement('div');
 if(!el.id){el.id='pair17Impact';document.body.append(el)}
 el.className='pair17-impact '+(ok?'good':'bad');
 el.textContent=ok?'✓ Верно!':'✕ Ошибка';
 clearTimeout(impactTimer);impactTimer=setTimeout(()=>el.className='pair17-impact',750);
 try{
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  const ac=impact.ctx||(impact.ctx=new AC());ac.resume?.();
  (ok?[523,659,784]:[280,195]).forEach((hz,i)=>{const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=hz;g.gain.setValueAtTime(.0001,ac.currentTime+i*.1);g.gain.exponentialRampToValueAtTime(.08,ac.currentTime+i*.1+.01);g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+i*.1+.15);o.connect(g);g.connect(ac.destination);o.start(ac.currentTime+i*.1);o.stop(ac.currentTime+i*.1+.16)});
 }catch(_){}
}
function applyCheck(sl,data){
 seenCheck[sl]=data.id;
 setFeedback(sl,!data.valid?'Введите число, например 12 или 12,5.':data.ok?'✓ Правильно!':'✕ Пока неверно — проверь вычисления.',data.valid?data.ok:false);
 if(data.valid&&Math.abs(Date.now()-Number(data.at||0))<3000)impact(data.ok);
}
function parseAnswer(raw){
 const s=String(raw).trim().replace(/\s/g,'').replace(/[−–]/g,'-').replace(',','.');
 return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)?Number(s):NaN;
}
async function update(mutator){
 if(!currentRole()){const answer=mutator(pair);if(answer===false)return false;pair.seq++;render();return true}
 if(!connected||!db)return false;
 const sid=metaId;
 const result=await fb.runTransaction(fb.ref(db,root+'/pair17'),s=>{
   if(!s||s.sessionId!==sid||s.schema!==1)return;
   if(mutator(s)===false)return;
   s.seq=(s.seq||0)+1;return s;
 },{applyLocally:false});
 return result.committed;
}
async function onInput(sl){
 if(!canEdit(sl)||!pair)return;
 lastEdit[sl]=Date.now();setFeedback(sl,'');
 clearTimeout(inputTimers[sl]);const task=pair.slots[sl],text=$('pair17Answer'+upper(sl)).value.slice(0,80);
 if(!currentRole()){pair.inputs[sl]={nonce:task.nonce,text};return}
 inputTimers[sl]=setTimeout(()=>update(s=>{if(s.slots[sl].nonce!==task.nonce)return false;s.inputs[sl]={nonce:task.nonce,text,by:myId()};}),140);
}
async function onPad(sl){
 if(!canEdit(sl)||!pair)return;
 lastPadEdit[sl]=Date.now();clearTimeout(padTimers[sl]);
 const task=pair.slots[sl],text=$('pair17Pad'+upper(sl)).value.slice(0,10000);
 if(!currentRole()){pair.pads[sl]={nonce:task.nonce,text};return}
 padTimers[sl]=setTimeout(()=>update(s=>{if(s.slots[sl].nonce!==task.nonce)return false;s.pads[sl]={nonce:task.nonce,text,by:myId()};}),230);
}
async function verify(sl){
 if(!canEdit(sl)||!pair)return;
 const task=pair.slots[sl],value=parseAnswer($('pair17Answer'+upper(sl)).value);
 const valid=Number.isFinite(value),ok=valid&&Math.abs(value-task.answer)<1e-7;
 const check={nonce:task.nonce,valid,ok,at:Date.now(),id:uid(),by:myId()};
 if(!currentRole()){applyCheck(sl,check);return}
 try{await update(s=>{if(s.slots[sl].nonce!==task.nonce)return false;s.checks[sl]=check;})}catch(e){console.warn(e)}
}
async function reveal(sl){
 if(!canTeach()||!pair)return;
 const nonce=pair.slots[sl].nonce;
 try{await update(s=>{if(s.slots[sl].nonce!==nonce)return false;s.reveals[sl]=Math.min(s.slots[sl].steps.length,(s.reveals[sl]||0)+1)})}catch(e){console.warn(e)}
}
async function numbers(sl){
 if(!canEdit(sl)||!pair)return;
 const origin=pair.slots[sl].nonce,proto=taskNumber(pair),other=sl==='a'?'b':'a';
 const candidate=bank.next(proto,[pair.slots[sl],pair.slots[other]]);
 try{await update(s=>{
   if(s.slots[sl].nonce!==origin||taskNumber(s)!==proto)return false;
   s.slots[sl]=candidate;s.inputs[sl]=null;s.checks[sl]=null;s.pads[sl]=null;s.reveals[sl]=0;
 })}catch(e){console.warn(e)}
}
async function clearBoard(){
 if(!currentRole()||!connected||!db||!fb)return;
 try{await fb.runTransaction(fb.ref(db,root+'/state'),s=>{
   if(!s)return;s.boardEpoch=(+s.boardEpoch||0)+1;s.strokes={};s.version=(+s.version||0)+1;return s;
 },{applyLocally:false})}catch(e){console.warn('Ошибка очистки доски',e)}
}
function assign(sl,id){
 if(currentRole()!=='teacher'||!pair)return;
 update(s=>{
   s.owners[sl]=String(id||'');s.locked=true;
   const other=sl==='a'?'b':'a';if(id&&s.owners[other]===id)s.owners[other]='';
 }).catch(console.warn);
}
function autoAssign(){
 if(currentRole()!=='teacher'||!pair||pair.locked)return;
 const active=participants().map(x=>x.userId),owners=pair.owners||{};
 if(owners.a&&owners.b||!active.length)return;
 update(s=>{
   if(s.locked)return false;
   const occupied=new Set(Object.values(s.owners||{}));
   for(const sl of slots)if(!s.owners[sl]){
     const free=active.find(x=>!occupied.has(x));
     if(free){s.owners[sl]=free;occupied.add(free)}
   }
 }).catch(()=>{});
}
async function changeStation(proto,mode,mixIndex,order){
 if(!canTeach()||!pair)return;
 const before=pair.seq;
 const created=bank.pair(proto);
 const done=await update(s=>{
  if(s.seq!==before)return false;
  s.mode=mode;s.proto=proto;s.mixIndex=mixIndex;s.order=order||s.order;s.slots=created;
  s.inputs={};s.pads={};s.checks={};s.reveals={a:0,b:0};s.boardEpoch=(s.boardEpoch||0)+1;
 });
 if(done){await clearBoard();render();document.getElementById('trainer')?.scrollIntoView({block:'start',behavior:'smooth'})}
}
async function syncMain(proto){
 if(!pair||pair.mode!=='main'||!canTeach())return;
 if(pair.proto===proto)return;
 await changeStation(proto,'main',0);
}
async function beginMix(){
 if(!canTeach()||!pair)return;
 const order=bank.shuffle([...Array(40)].map((_,i)=>i+1));
 await changeStation(order[0],'mix',0,order);
}
async function mixMove(delta){
 if(!canTeach()||pair?.mode!=='mix')return;
 const index=Math.max(0,Math.min(39,pair.mixIndex+delta));if(index===pair.mixIndex)return;
 await changeStation(pair.order[index],'mix',index);
}
async function endMix(){
 if(!canTeach()||pair?.mode!=='mix')return;
 await changeStation(Math.max(1,window.getStereoPrototypeIndex?.()+1||40),'main',0);
}
async function pullStudents(){
 if(currentRole()!=='teacher'||!fb||!db)return;
 const max=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
 try{await fb.set(fb.ref(db,root+'/pair17Pull'),{sessionId:metaId,ratio:scrollY/max,id:uid(),at:Date.now()})}catch(e){console.warn(e)}
}
async function connectFirebase(){
 if(initPending||!bridge?.connected)return;
 initPending=true;
 try{
   if(!fb){const [api,app]=await Promise.all([
     import('https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js'),
     import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js')
   ]);
   fb=api;
   const name='oge17PairExtension';
   const existing=app.getApps().find(x=>x.name===name);
   const config={apiKey:'AIzaSyBkY5utRlEfGIT_wEW6Dq7TSLr3RqBWJxo',authDomain:'ega-mathematica.firebaseapp.com',databaseURL:'https://ega-mathematica-default-rtdb.europe-west1.firebasedatabase.app',projectId:'ega-mathematica',appId:'1:177632223541:web:fbc532216359e34665ec7c'};
   db=api.getDatabase(existing||app.initializeApp(config,name));
   }
   unsubs.forEach(u=>u?.());unsubs=[];
   const meta=await fb.get(fb.ref(db,root+'/meta'));
   if(!meta.exists())return;
   metaId=meta.val()?.sessionId||'';
   if(!metaId)return;
   connected=true;
   unsubs.push(fb.onValue(fb.ref(db,root+'/meta/sessionId'),snap=>{
     const id=snap.val()||'';if(id&&id!==metaId){const wasStudent=currentRole()==='student';connected=false;pair=null;metaId=id;unsubs.forEach(u=>u?.());unsubs=[];initPending=false;if(wasStudent){bridge?.leave?.().catch(console.warn);return}start();}
   }));
   unsubs.push(fb.onValue(fb.ref(db,root+'/pair17'),snap=>{
     const p=snap.val();
     if(p?.schema===1&&p.sessionId===metaId){pair=p;render();}
     else if(currentRole()==='teacher')createSessionPair().catch(console.warn);
   }));
   unsubs.push(fb.onValue(fb.ref(db,root+'/members'),snap=>{
     memberData=snap.val()||{};updateSidebar();render();
     autoAssign();
   }));
   unsubs.push(fb.onValue(fb.ref(db,root+'/pair17Pull'),snap=>{
     const d=snap.val();if(currentRole()!=='student'||!d||d.sessionId!==metaId||d.id===lastPull||Date.now()-d.at>3500)return;
     lastPull=d.id;const max=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
     window.scrollTo({top:Math.max(0,Math.min(max,Number(d.ratio||0)*max)),behavior:'smooth'});
   }));
 }catch(e){console.warn('ОГЭ17 Firebase pair:',e)}
 finally{initPending=false}
}
let startingPair=false;
async function createSessionPair(){
 if(startingPair||currentRole()!=='teacher'||!metaId)return;
 startingPair=true;
 try{
 const index=Number(window.getStereoPrototypeIndex?.()||0)+1;
 await fb.runTransaction(fb.ref(db,root+'/pair17'),old=>old?.sessionId===metaId?undefined:makeState(metaId,index),{applyLocally:false});
 }finally{startingPair=false}
}
function localPractice(){
 if(!pair||currentRole())return;
 render();
}
function patchPrototypeNavigation(){
 const original=window.setStereoPrototype;
 if(typeof original!=='function'||original._pair17Wrapped)return;
 function proxy(index,options={}){
   if(bridge?.connected&&bridge.role==='student'&&!options.silent)return;
   const result=original(index,options);
   mounted=null;
   if(pair?.mode!=='mix'){
     if(!currentRole()){
       const p=Math.max(1,Math.min(40,Number(index)+1));
       pair=makeState('',p);render();
     }else if(bridge?.role==='teacher'&&!options.silent)syncMain(Math.max(1,Math.min(40,Number(index)+1))).catch(console.warn);
     else render();
   }else render();
   return result;
 }
 proxy._pair17Wrapped=true;window.setStereoPrototype=proxy;
}
function start(){
 bridge=window.OGE17PairBridge||null;
 ensureCss();ensureSidebar();patchPrototypeNavigation();
 if(!pair){pair=makeState('',Number(window.getStereoPrototypeIndex?.()||0)+1)}
 render();
 if(bridge?.connected&&!connected)connectFirebase().catch(console.warn);
 if(!bridge?.connected){connected=false;metaId='';unsubs.forEach(fn=>fn?.());unsubs=[]}
}
function init(){
 ensureCss();start();
 // Existing guide uses Firebase only after choosing a role. Detect that transition without polling the network.
 const bar=$('cbToolbar');
 if(bar&&typeof MutationObserver==='function')new MutationObserver(()=>{start();setTimeout(start,350)}).observe(bar,{attributes:true,attributeFilter:['class']});
 window.addEventListener('stereometry:prototype-change',()=>{if(bridge?.role==='teacher')syncMain(Number(window.getStereoPrototypeIndex?.()||0)+1).catch(()=>{})});
 document.addEventListener('click',e=>{
   const summary=e.target.closest?.('details.answer-details > summary');
   if(summary&&currentRole()==='student'){e.preventDefault();e.stopImmediatePropagation()}
 },true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape')$('pair17MemberBox').hidden=true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
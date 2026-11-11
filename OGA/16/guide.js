import {PROTOTYPES,shuffle,getPrototype,makePair,randomId} from './guide-bank.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {getDatabase,ref,get,set,remove,onValue,onDisconnect,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js';

// Изолированная комната задания №16; не затрагивает другие гайды.
const firebaseConfig={apiKey:'AIzaSyBkY5utRlEfGIT_wEW6Dq7TSLr3RqBWJxo',authDomain:'ega-mathematica.firebaseapp.com',databaseURL:'https://ega-mathematica-default-rtdb.europe-west1.firebasedatabase.app',projectId:'ega-mathematica',storageBucket:'ega-mathematica.firebasestorage.app',messagingSenderId:'177632223541',appId:'1:177632223541:web:fbc532216359e34665ec7c'};
const db=getDatabase(initializeApp(firebaseConfig));
const ROOT='sharedGuides/oge16-circle-pair-v1/currentSession', COUNT=PROTOTYPES.length;
const CODE_HASH='b0a83a3919eba1d2a99034f2d94e5a47590f1710595c04bd64b5c8f21456a7c6';
const API_URL='https://script.google.com/macros/s/AKfycbw6iYfojO8VgkHU63peD2vWLybGyDm9AsYZ6TaLA_EFD4j56nQlY5SqpRANPVeTwVsj/exec';
const $=id=>document.getElementById(id), path=s=>ref(db,ROOT+(s?'/'+s:''));
const stateRef=()=>path('state'),strokesRef=()=>path('strokes'),membersRef=()=>path('members');
const slots=['a','b'],upper=s=>s.toUpperCase();
const copy=x=>JSON.parse(JSON.stringify(x));
const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,role='',me=null,sessionId='',members={},remoteInputs={},remoteChecks={},remoteStrokes={};
let joined=false,connected=false,subscriptions=[],drawingTool='pointer',activeInk=null,inkJobs=new Map();
let lastNonce={a:'',b:''},lastFlash={a:'',b:''},lastPull='',flashTimer=0,inputTimers={a:0,b:0},localEdits={a:0,b:0};
const tabKey='oge16-pair-client',tabId=sessionStorage.getItem(tabKey)||randomId();
sessionStorage.setItem(tabKey,tabId);
const savedRoleKey='oge16-pair-role',teacherOkKey='oge16-pair-teacher',studentSavedKey='oge16-pair-student';

function stationId(index,order){return index<COUNT?PROTOTYPES[index].id:(order||[])[index-COUNT]||PROTOTYPES[0].id}
function freshState(){
 const order=shuffle(PROTOTYPES.map(p=>p.id));
 return {schema:1,sessionId:randomId(),index:0,order,slots:makePair(PROTOTYPES[0].id),
  owners:{a:'',b:''},reveals:{a:0,b:0},boardEpoch:0,slotEpoch:{a:0,b:0},version:1};
}
state=freshState();
function stageName(i=state.index){return i<COUNT?'ПРОТОТИП '+(i+1)+' ИЗ '+COUNT:'СТАНЦИЯ-МИКС '+(i-COUNT+1)+' ИЗ '+COUNT}
function canEdit(slot){
 if(!joined)return true;
 if(role==='teacher')return true;
 return role==='student'&&state.owners[slot]===String(me?.studentId||'');
}
function canTeach(){return !joined||role==='teacher'}
function setStatus(msg,kind='local'){
 $('sessionStatus').textContent=msg;$('connectionText').textContent=msg;
 $('connectionDot').className='connection-dot '+(kind==='online'?'online':kind==='offline'?'offline':'');
}
function showError(e){console.warn('ОГЭ 16:',e);setStatus('Ошибка синхронизации — '+String(e?.message||e),'offline')}
function showModal(page='roles'){
 $('authModal').hidden=false;
 $('roleChoice').hidden=page!=='roles';
 $('teacherForm').hidden=page!=='teacher';
 $('studentForm').hidden=page!=='student';
 $('teacherContinue').hidden=page!=='continue';
 $('modalMessage').textContent='';
 $('modalMessage').className='modal-message';
 $('modalTitle').textContent=page==='teacher'?'Вход учителя':page==='student'?'Вход ученика':page==='continue'?'Текущий урок':'Совместный урок';
 $('modalNote').textContent=page==='continue'?'Продолжить текущую комнату или начать новый урок (старые подключения сбросятся).':
  page==='student'?'Введите личный код, который используете в остальных гайдах.':
  page==='teacher'?'Введите тот же код учителя, что и в других гайдах.':'Общая комната с Firebase. Вне урока задания работают самостоятельно.';
 if(page==='student'){
   const saved=readStudent();if(saved?.code)$('studentCode').value=saved.code;
 }
}
function modalMessage(text,bad=false){$('modalMessage').textContent=text;$('modalMessage').className='modal-message'+(bad?' bad':'')}
function closeModal(){$('authModal').hidden=true}
async function hash(text){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(buf)].map(n=>n.toString(16).padStart(2,'0')).join('')}
function readStudent(){try{return JSON.parse(localStorage.getItem(studentSavedKey)||'null')}catch{return null}}
function parseStudent(data,code){
 const d=(data&&(data.student||data.data||data.result))||data||{};
 const id=d.studentId??d.id??data?.studentId,name=d.studentName??d.name??d.fullName??data?.studentName??data?.name;
 if(data?.success===false||data?.valid===false||data?.ok===false||id===undefined||id===null||id==='')throw Error(data?.message||'Личный код не найден');
 return {studentId:String(id),name:String(name||'Ученик'),code:String(code)};
}
function validateStudent(code){return new Promise((resolve,reject)=>{
 const cb='oge16_'+Date.now()+'_'+Math.random().toString(36).slice(2),el=document.createElement('script');
 let done=false;const timer=setTimeout(()=>finish(new Error('Сервер учеников не ответил')),15000);
 function finish(err,value){if(done)return;done=true;clearTimeout(timer);try{delete window[cb]}catch{window[cb]=undefined}el.remove();err?reject(err):resolve(value)}
 window[cb]=data=>{try{finish(null,parseStudent(data,code))}catch(e){finish(e)}};
 el.onerror=()=>finish(Error('Не удалось проверить личный код'));el.src=API_URL+'?'+new URLSearchParams({action:'validateStudent',code,callback:cb});document.head.appendChild(el);
})}
async function teacherLogin(){
 const code=$('teacherCode').value.trim();if(!code)return modalMessage('Введите код учителя',true);
 try{
   if(await hash(code)!==CODE_HASH)return modalMessage('Неверный код учителя',true);
   role='teacher';me={id:'teacher',name:'Учитель',role};sessionStorage.setItem(teacherOkKey,'1');
   sessionStorage.setItem(savedRoleKey,'teacher');
   const snap=await get(stateRef());
   if(snap.exists())showModal('continue');else await newLesson();
 }catch(e){modalMessage(e.message||'Ошибка входа',true)}
}
async function studentLogin(){
 const code=$('studentCode').value.trim();
 if(!code)return modalMessage('Введите личный код',true);
 try{
   if(await hash(code)===CODE_HASH)return modalMessage('Это код учителя',true);
   modalMessage('Проверяем личный код…');
   const person=await validateStudent(code);
   localStorage.setItem(studentSavedKey,JSON.stringify(person));
   await joinStudent(person);
 }catch(e){modalMessage(e.message||'Не удалось войти',true)}
}
function localPractice(){
 if(!joined){renderState();return}
 subscriptions.forEach(f=>f?.());subscriptions=[];
 joined=false;connected=false;role='';me=null;sessionId='';
 sessionStorage.removeItem(savedRoleKey);sessionStorage.removeItem(teacherOkKey);
 state=freshState();members={};remoteInputs={};remoteChecks={};remoteStrokes={};
 lastNonce={a:'',b:''};lastFlash={a:'',b:''};lastPull='';renderMembers();setStatus('Самостоятельная практика');renderState();drawBoard();
}
async function newLesson(){
 if(role!=='teacher')return;
 subscriptions.forEach(f=>f?.());subscriptions=[];
 const next=freshState();const initial={meta:{openedAt:serverTimestamp(),schema:1,sessionId:next.sessionId},state:next,members:{},inputs:{},checks:{},strokes:{},pull:{}};
 try{await set(path(''),initial);await connectSession(next.sessionId);closeModal()}
 catch(e){modalMessage(e.message||'Не удалось начать урок',true);showError(e)}
}
async function continueLesson(){
 try{const snap=await get(stateRef());const s=snap.val();if(!s||s.schema!==1)throw Error('Нет совместимого урока');
 await connectSession(s.sessionId);closeModal();
 }catch(e){modalMessage(e.message||'Нельзя продолжить урок',true);showError(e)}
}
async function joinStudent(person){
 const snap=await get(stateRef());const s=snap.val();
 if(!s||s.schema!==1)throw Error('Учитель ещё не начал совместный урок');
 role='student';me={id:'student-'+person.studentId,studentId:person.studentId,name:person.name,role};
 sessionStorage.setItem(savedRoleKey,'student');
 // Не ограничиваем подключение двумя участниками. Заполняем только свободные рабочие места.
 await runTransaction(stateRef(),current=>{
   if(!current||current.sessionId!==s.sessionId)return;
   current.owners=current.owners||{a:'',b:''};
   const id=String(person.studentId);
   if(!Object.values(current.owners).includes(id)){if(!current.owners.a)current.owners.a=id;else if(!current.owners.b)current.owners.b=id}
   current.version=(current.version||0)+1;
   return current;
 });
 await connectSession(s.sessionId);closeModal();
}
function joinName(id){const online=Object.values(members).find(x=>x?.studentId===id&&x.online);return online?.name||'Ученик'}
function updateSessionButtons(){
 const teacher=joined&&role==='teacher';
 $('toolPull').hidden=!teacher;
 $('assignPanel').hidden=!teacher;$('newSession').hidden=!teacher;
 $('sessionButton').textContent=joined?(teacher?'Урок · учитель':'Урок · '+(me?.name||'ученик')):'Совместный урок';
 $('toolLesson').title=joined?'Управление подключением':'Совместный урок';
 $('toolMembers').disabled=!joined;
}
function renderMembers(){
 const list=Object.values(members).filter(m=>m&&m.sessionId===sessionId&&m.online);
 const distinct=[];for(const m of list)if(!distinct.some(x=>x.id===m.id))distinct.push(m);
 $('memberCount').textContent=String(distinct.filter(m=>m.role==='student').length);
 $('memberList').innerHTML=distinct.length?distinct.map(m=>'<div class="member">'+escapeHTML(m.name)+(m.role==='teacher'?' · учитель':' · ученик')+'</div>').join(''):'<p class="panel-note">Никто ещё не подключился.</p>';
 const students=distinct.filter(m=>m.role==='student');
 for(const slot of slots){
   const sel=$('assign'+upper(slot)),old=state.owners?.[slot]||'';
   sel.innerHTML='<option value="">Не назначен</option>'+students.map(m=>'<option value="'+escapeHTML(m.studentId)+'">'+escapeHTML(m.name)+'</option>').join('');
   if(old&&!students.some(s=>s.studentId===old))sel.innerHTML+='<option value="'+escapeHTML(old)+'">'+escapeHTML(joinName(old))+' (не в сети)</option>';
   sel.value=old;
 }
 updateSessionButtons();
}
async function connectSession(expected){
 subscriptions.forEach(f=>f?.());subscriptions=[];
 sessionId=expected;joined=true;lastFlash={a:'',b:''};
 let first=true;
 subscriptions.push(onValue(stateRef(),snap=>{
   const s=snap.val();if(!s)return;
   if(s.schema!==1){setStatus('Версия урока не поддерживается','offline');return}
   if(s.sessionId!==sessionId){if(role==='student'){localPractice();setStatus('Учитель начал новый урок. Подключитесь снова.','offline')}else setStatus('Комната была перезапущена','offline');return}
   state=s;renderState();drawBoard();renderMembers();
   if(first){first=false;setStatus('Firebase · совместный урок','online')}
 },showError));
 subscriptions.push(onValue(membersRef(),snap=>{members=snap.val()||{};renderMembers()},showError));
 subscriptions.push(onValue(path('inputs'),snap=>{remoteInputs=snap.val()||{};applyInputs()},showError));
 subscriptions.push(onValue(path('checks'),snap=>{remoteChecks=snap.val()||{};applyChecks()},showError));
 subscriptions.push(onValue(strokesRef(),snap=>{remoteStrokes=snap.val()||{};drawBoard()},showError));
 subscriptions.push(onValue(path('pull'),snap=>{
   if(role!=='student')return;const d=snap.val();
   if(!d||d.sessionId!==sessionId||d.id===lastPull||Date.now()-d.at>6000)return;
   lastPull=d.id;const max=Math.max(0,document.documentElement.scrollHeight-innerHeight);
   window.scrollTo({top:Math.max(0,Math.min(max,(Number(d.ratio)||0)*max)),behavior:'smooth'});
 }));
 subscriptions.push(onValue(ref(db,'.info/connected'),snap=>{
   connected=!!snap.val();if(joined)setStatus(connected?'Firebase · совместный урок':'Нет сети · повторите действие после подключения',connected?'online':'offline');
 }));
 const memberNode=path('members/'+tabId);
 try{
   await onDisconnect(memberNode).update({online:false,lastSeen:serverTimestamp()});
   await set(memberNode,{id:me.id,name:me.name,role,studentId:me.studentId||'',online:true,sessionId,joinedAt:serverTimestamp()});
 }catch(e){showError(e)}
 updateSessionButtons();renderState();renderMembers();
}
async function mutateState(callback){
 if(!joined){callback(state);state.version++;renderState();drawBoard();return true}
 const currentId=sessionId;
 const result=await runTransaction(stateRef(),previous=>{
   if(!previous||previous.sessionId!==currentId||previous.schema!==1)return;
   callback(previous);previous.version=(previous.version||0)+1;return previous;
 });
 return result.committed;
}
function resetInput(slot){remoteInputs[slot]=null;remoteChecks[slot]=null;lastFlash[slot]='';$('answer'+upper(slot)).value='';setFeedback(slot,'');}
function resetBoth(){slots.forEach(resetInput)}
function syncClears(slot){
 if(!joined)return;
 remove(path('inputs/'+slot)).catch(showError);
 remove(path('checks/'+slot)).catch(showError);
}
async function numbersFor(slot){
 if(!canEdit(slot))return;
 const next=getPrototype(stationId(state.index,state.order)).make();
 next.proto=stationId(state.index,state.order);next.nonce=randomId();
 if(next.q===state.slots[slot].q){return numbersFor(slot)}
 try{
   const committed=await mutateState(s=>{
     s.slots[slot]=next;s.slotEpoch[slot]=(s.slotEpoch[slot]||0)+1;s.reveals[slot]=0;
   });
   if(committed){resetInput(slot);syncClears(slot);if(joined)pruneStrokes(slot)}
 }catch(e){showError(e)}
}
async function changeStage(delta){
 if(!canTeach())return;
 const index=Math.max(0,Math.min(2*COUNT-1,state.index+delta));
 if(index===state.index)return;
 const pair=makePair(stationId(index,state.order));
 try{
   const committed=await mutateState(s=>{
     s.index=index;s.slots=pair;s.reveals={a:0,b:0};
     s.boardEpoch=(s.boardEpoch||0)+1;s.slotEpoch={a:0,b:0};
   });
   if(committed){
     resetBoth();
     if(joined){await Promise.all([remove(path('inputs')),remove(path('checks')),remove(strokesRef())].map(x=>x.catch(showError)))}
     remoteStrokes={};drawBoard();
     $('stageKicker').scrollIntoView({behavior:'smooth',block:'start'});
   }
 }catch(e){showError(e)}
}
async function showStep(slot){
 if(!canTeach())return;
 try{await mutateState(s=>{s.reveals[slot]=Math.min(s.slots[slot].steps.length,(s.reveals[slot]||0)+1)})}
 catch(e){showError(e)}
}
function formatAnswer(text){
 const raw=String(text).trim().replace(/\s/g,'').replace(/[−–]/g,'-').replace(',','.');
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw))return NaN;
 return Number(raw);
}
function setFeedback(slot,text,kind=''){
 const el=$('feedback'+upper(slot));el.textContent=text;el.className='feedback '+kind;
}
function impact(ok){
 clearTimeout(flashTimer);
 const el=$('impact');el.className='impact active '+(ok?'good':'bad');$('impactText').textContent=ok?'✓ Верно!':'✕ Ошибка';
 flashTimer=setTimeout(()=>el.className='impact',650);
}
function playSound(ok){
 try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
   const ctx=playSound.ctx||(playSound.ctx=new AC());ctx.resume?.();
   (ok?[523,659,784]:[260,185]).forEach((hz,i)=>{
     const osc=ctx.createOscillator(),vol=ctx.createGain();osc.type=ok?'sine':'triangle';osc.frequency.value=hz;
     vol.gain.setValueAtTime(.0001,ctx.currentTime+i*.09);
     vol.gain.exponentialRampToValueAtTime(.08,ctx.currentTime+i*.09+.008);
     vol.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+i*.09+.16);
     osc.connect(vol);vol.connect(ctx.destination);osc.start(ctx.currentTime+i*.09);osc.stop(ctx.currentTime+i*.09+.17);
   });
 }catch(_){}
}
async function checkAnswer(slot){
 if(!canEdit(slot))return;
 const task=state.slots[slot],str=$('answer'+upper(slot)).value,number=formatAnswer(str),valid=Number.isFinite(number);
 const ok=valid&&Math.abs(number-Number(task.answer))<1e-8;
 const result={nonce:task.nonce,by:me?.name||'Самостоятельно',ok,valid,id:randomId(),at:Date.now()};
 if(!joined){applySingleCheck(slot,result);return}
 try{await set(path('checks/'+slot),result)}catch(e){showError(e)}
}
function applySingleCheck(slot,data){
 setFeedback(slot,!data.valid?'Введите число (например, 12 или 12,5).':data.ok?'✓ Правильно!':'✕ Пока неверно. Проверь вычисления.',data.valid?(data.ok?'good':'bad'):'bad');
 if(data.valid&&Date.now()-data.at<3500){impact(data.ok);playSound(data.ok)}
}
function applyInputs(){
 if(!joined)return;
 for(const slot of slots){
   const data=remoteInputs?.[slot];
   if(!data||data.nonce!==state.slots?.[slot]?.nonce)continue;
   const el=$('answer'+upper(slot));
   if(Date.now()-localEdits[slot]<350&&document.activeElement===el)continue;
   if(el.value!==String(data.text??''))el.value=String(data.text??'');
 }
}
function applyChecks(){
 if(!joined)return;
 for(const slot of slots){
   const data=remoteChecks?.[slot];if(!data||data.nonce!==state.slots?.[slot]?.nonce)continue;
   if(lastFlash[slot]===data.id)continue;
   lastFlash[slot]=data.id;applySingleCheck(slot,data);
 }
}
function scheduleInput(slot){
 if(!canEdit(slot))return;
 localEdits[slot]=Date.now();setFeedback(slot,'');clearTimeout(inputTimers[slot]);
 if(!joined)return;
 const task=state.slots[slot],value=$('answer'+upper(slot)).value;
 inputTimers[slot]=setTimeout(()=>{
   set(path('inputs/'+slot),{nonce:task.nonce,text:value.slice(0,80),by:me?.name||'',at:Date.now()}).catch(showError);
 },130);
}
// Простая, воспроизводимая схема окружности — без предположения, что длины на рисунке даны в масштабе.
function svgDiagram(proto){
 const lines=[];const circle='<circle cx="150" cy="85" r="68" fill="none" stroke="#4e8db7" stroke-width="3"/>';
 const line=(x1,y1,x2,y2)=>'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="#2675b5" stroke-width="2.5" stroke-linecap="round"/>';
 const point=(x,y,name)=>'<circle cx="'+x+'" cy="'+y+'" r="3.5" fill="#174e84"/><text x="'+(x+7)+'" y="'+(y-6)+'" font-size="13" fill="#173d69" font-weight="700">'+name+'</text>';
 let mark='';
 if(['central'].includes(proto)){mark=line(150,85,91,51)+line(150,85,207,51)+point(150,85,'O')+point(91,51,'A')+point(207,51,'B')}
 else if(['inscribed','arc'].includes(proto)){mark=line(91,51,150,152)+line(207,51,150,152)+point(91,51,'A')+point(207,51,'B')+point(150,152,'C')}
 else if(proto==='tangentChord'){mark=line(82,18,82,155)+line(82,85,194,40)+point(82,85,'A')+point(194,40,'B')}
 else if(proto==='twoTangents'){mark=line(245,85,179,35)+line(245,85,179,135)+point(245,85,'P')+point(179,35,'A')+point(179,135,'B')}
 else if(proto==='cyclic'){mark=line(109,30,204,61)+line(204,61,178,147)+line(178,147,84,112)+line(84,112,109,30)+point(109,30,'A')+point(204,61,'B')+point(178,147,'C')+point(84,112,'D')}
 else if(['chords','intersectionAngle'].includes(proto)){mark=line(93,43,207,127)+line(93,127,207,43)+point(150,85,'P')+point(93,43,'A')+point(207,127,'B')+point(93,127,'C')+point(207,43,'D')}
 else if(proto==='tangentSecant'){mark=line(250,85,179,35)+line(250,85,85,85)+point(250,85,'P')+point(179,35,'A')+point(218,85,'B')+point(82,85,'C')}
 else if(proto==='twoSecants'||proto==='outsideAngle'){mark=line(266,85,85,40)+line(266,85,85,131)+point(266,85,'P')+point(208,71,'A')+point(85,40,'B')+point(207,100,'C')+point(85,131,'D')}
 else if(proto==='chordDistance'){mark=line(93,49,93,121)+line(150,85,93,85)+line(150,85,93,49)+point(150,85,'O')+point(93,49,'A')+point(93,121,'B')+point(93,85,'M')}
 return '<svg viewBox="0 0 305 170" role="presentation" xmlns="http://www.w3.org/2000/svg">'+circle+mark+'</svg>';
}
function renderState(){
 const p=getPrototype(stationId(state.index,state.order));
 $('stageKicker').textContent=stageName();
 $('stageTitle').textContent=p.title;
 $('stageRule').textContent=p.rule+(state.index>=COUNT?' · Порядок прототипов перемешан; повторов нет.':'');
 $('progressFill').style.width=((state.index+1)/(COUNT*2)*100)+'%';
 $('prevStage').disabled=state.index<=0||!canTeach();
 $('nextStage').disabled=state.index>=COUNT*2-1||!canTeach();
 $('nextStage').textContent=state.index===COUNT*2-1?'Все станции пройдены ✓':state.index===COUNT-1?'К станциям-микс →':'Следующая станция →';
 for(const slot of slots){
   const task=state.slots?.[slot];if(!task)continue;
   const cap=upper(slot),nonceChanged=lastNonce[slot]!==task.nonce;
   $('owner'+cap).textContent=state.owners?.[slot]?joinName(state.owners[slot]):'Ученик '+(slot==='a'?'1':'2');
   $('question'+cap).textContent=task.q;
   if(nonceChanged){
     $('diagram'+cap).innerHTML=svgDiagram(task.proto);
     lastNonce[slot]=task.nonce;resetInput(slot);
   }
   $('other'+cap).disabled=!canEdit(slot);
   $('answer'+cap).disabled=!canEdit(slot);$('check'+cap).disabled=!canEdit(slot);
   $('step'+cap).disabled=!canTeach();
   const step=Math.min(task.steps.length,Number(state.reveals?.[slot]||0));
   $('steps'+cap).innerHTML=task.steps.slice(0,step).map(t=>'<li>'+escapeHTML(t)+'</li>').join('');
   $('step'+cap).textContent=step>=task.steps.length?'Решение раскрыто полностью':step?'Показать следующий шаг':'Показать первый шаг решения';
 }
 applyInputs();applyChecks();updateSessionButtons();
}
function onBoardTool(tool){
 drawingTool=tool;
 for(const [key,id] of [['pointer','toolPointer'],['pen','toolPen'],['eraser','toolEraser']])$(id).classList.toggle('active',tool===key);
 for(const slot of slots){const el=$('ink'+upper(slot));el.classList.toggle('drawing',tool==='pen');el.classList.toggle('erasing',tool==='eraser')}
}
function pathData(points){
 if(!points||!points.length)return '';
 const pt=p=>[Math.round(p[0]*1000),Math.round(p[1]*420)];
 let d='M'+pt(points[0]).join(' ');
 for(let i=1;i<points.length;i++)d+=' L'+pt(points[i]).join(' ');
 return d;
}
function validStroke(s){
 return s&&s.boardEpoch===state.boardEpoch&&s.slotEpoch===state.slotEpoch?.[s.slot]&&slots.includes(s.slot)&&Array.isArray(s.points);
}
function drawBoard(){
 for(const slot of slots){
   const svg=$('ink'+upper(slot));svg.replaceChildren();
   const records=Object.values(remoteStrokes).filter(s=>s?.slot===slot&&validStroke(s));
   if(activeInk?.slot===slot&&validStroke(activeInk.stroke))records.push(activeInk.stroke);
   for(const stroke of records){
     const e=document.createElementNS('http://www.w3.org/2000/svg','path');
     e.setAttribute('d',pathData(stroke.points));e.setAttribute('fill','none');e.setAttribute('stroke',stroke.color||'#245d9e');
     e.setAttribute('stroke-width',String(stroke.width||3));e.setAttribute('stroke-linecap','round');e.setAttribute('stroke-linejoin','round');svg.appendChild(e);
   }
 }
}
function currentPoint(e,svg){
 const rect=svg.getBoundingClientRect();
 return [Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))];
}
function queueInk(id,stroke){
 if(!joined)return;
 let job=inkJobs.get(id);
 if(!job){job={pending:null,busy:false};inkJobs.set(id,job)}
 job.pending=copy(stroke);
 if(job.busy)return;
 job.busy=true;
 (async()=>{
   while(job.pending){
     const next=job.pending;job.pending=null;
     try{await set(path('strokes/'+id),next)}
     catch(e){showError(e);break}
   }
 })().finally(()=>{job.busy=false;if(job.pending)queueInk(id,job.pending);else inkJobs.delete(id)});
}
function eraseNear(slot,point){
 const candidates=Object.entries(remoteStrokes).filter(([,s])=>s?.slot===slot&&validStroke(s));
 let found='',best=.035;
 for(const [id,stroke] of candidates)for(const p of stroke.points||[]){
   const dist=Math.hypot((p[0]-point[0]),(p[1]-point[1])*.6);
   if(dist<best){found=id;best=dist}
 }
 if(!found)return;
 delete remoteStrokes[found];drawBoard();
 if(joined)remove(path('strokes/'+found)).catch(showError);
}
function inkStart(e,slot){
 if(drawingTool==='pointer'||!canEdit(slot))return;
 const svg=e.currentTarget; e.preventDefault();svg.setPointerCapture(e.pointerId);
 const pt=currentPoint(e,svg);
 if(drawingTool==='eraser'){eraseNear(slot,pt);activeInk={slot,mode:'erase',pointer:e.pointerId};return}
 const stroke={slot,points:[pt],boardEpoch:state.boardEpoch,slotEpoch:state.slotEpoch[slot],width:3.2,color:slot==='a'?'#236baf':'#7b52ba',owner:me?.id||'local',at:Date.now()};
 activeInk={slot,mode:'pen',pointer:e.pointerId,id:randomId(),stroke,lastWrite:0};
 drawBoard();
}
function inkMove(e,slot){
 if(!activeInk||activeInk.pointer!==e.pointerId||activeInk.slot!==slot)return;
 e.preventDefault();const pt=currentPoint(e,e.currentTarget);
 if(activeInk.mode==='erase'){eraseNear(slot,pt);return}
 const points=activeInk.stroke.points,old=points[points.length-1];
 if(Math.hypot(old[0]-pt[0],old[1]-pt[1])<.002)return;
 points.push(pt);drawBoard();
 if(performance.now()-activeInk.lastWrite>85){activeInk.lastWrite=performance.now();queueInk(activeInk.id,activeInk.stroke)}
}
function inkEnd(e,slot){
 if(!activeInk||activeInk.pointer!==e.pointerId||activeInk.slot!==slot)return;
 try{e.currentTarget.releasePointerCapture(e.pointerId)}catch(_){}
 if(activeInk.mode==='pen'){
   const {id,stroke}=activeInk;remoteStrokes[id]=copy(stroke);
   queueInk(id,stroke);
 }
 activeInk=null;drawBoard();
}
async function pruneStrokes(slot){
 for(const [id,s] of Object.entries(remoteStrokes))if(s?.slot===slot&&!validStroke(s)){
   delete remoteStrokes[id];remove(path('strokes/'+id)).catch(showError);
 }
 drawBoard();
}
async function clearInk(){
 if(!joined){
   remoteStrokes={};state.boardEpoch++;state.slotEpoch={a:0,b:0};drawBoard();return;
 }
 if(role==='teacher'){
   try{
     if(await mutateState(s=>{s.boardEpoch++;s.slotEpoch={a:0,b:0}})){
       remoteStrokes={};drawBoard();await remove(strokesRef());
     }
   }catch(e){showError(e)}return;
 }
 const owned=slots.filter(canEdit);if(!owned.length)return;
 try{
   if(await mutateState(s=>owned.forEach(x=>s.slotEpoch[x]++))){
     for(const x of owned)await pruneStrokes(x);
   }
 }catch(e){showError(e)}
}
async function pullStudents(){
 if(!joined||role!=='teacher')return;
 const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);
 try{await set(path('pull'),{id:randomId(),sessionId,ratio:scrollY/max,at:Date.now()})}catch(e){showError(e)}
}
async function changeOwner(slot,id){
 if(role!=='teacher'||!joined)return;
 const chosen=String(id||'');
 try{await mutateState(s=>{
   s.owners[slot]=chosen;
   const other=slot==='a'?'b':'a';
   if(chosen&&s.owners[other]===chosen)s.owners[other]='';
 })}catch(e){showError(e)}
}
function bindUI(){
 $('toolPointer').onclick=()=>onBoardTool('pointer');
 $('toolPen').onclick=()=>onBoardTool('pen');
 $('toolEraser').onclick=()=>onBoardTool('eraser');
 $('toolClear').onclick=clearInk;
 $('toolMembers').onclick=()=>{$('membersPanel').hidden=!$('membersPanel').hidden};
 $('closeMembers').onclick=()=>{$('membersPanel').hidden=true};
 $('toolPull').onclick=pullStudents;
 $('toolLesson').onclick=()=>showModal(joined&&role==='teacher'?'continue':'roles');
 $('sessionButton').onclick=()=>showModal(joined&&role==='teacher'?'continue':'roles');
 $('closeModal').onclick=closeModal;
 $('authModal').addEventListener('click',e=>{if(e.target===$('authModal'))closeModal()});
 $('chooseTeacher').onclick=()=>showModal('teacher');$('chooseStudent').onclick=()=>showModal('student');
 $('teacherLogin').onclick=teacherLogin;$('studentLogin').onclick=studentLogin;
 $('teacherCode').addEventListener('keydown',e=>{if(e.key==='Enter')teacherLogin()});
 $('studentCode').addEventListener('keydown',e=>{if(e.key==='Enter')studentLogin()});
 $('continueSession').onclick=continueLesson;$('freshSession').onclick=newLesson;
 $('newSession').onclick=()=>{if(confirm('Начать новый совместный урок? Подключения и рисунки предыдущего урока сбросятся.'))newLesson()};
 $('prevStage').onclick=()=>changeStage(-1);$('nextStage').onclick=()=>changeStage(1);
 for(const slot of slots){
   const cap=upper(slot);
   $('other'+cap).onclick=()=>numbersFor(slot);
   $('check'+cap).onclick=()=>checkAnswer(slot);
   $('step'+cap).onclick=()=>showStep(slot);
   $('answer'+cap).addEventListener('input',()=>scheduleInput(slot));
   $('answer'+cap).addEventListener('keydown',e=>{if(e.key==='Enter')checkAnswer(slot)});
   $('assign'+cap).addEventListener('change',e=>changeOwner(slot,e.target.value));
   const svg=$('ink'+cap);
   svg.addEventListener('pointerdown',e=>inkStart(e,slot));
   svg.addEventListener('pointermove',e=>inkMove(e,slot));
   svg.addEventListener('pointerup',e=>inkEnd(e,slot));
   svg.addEventListener('pointercancel',e=>inkEnd(e,slot));
 }
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('authModal').hidden=true;$('membersPanel').hidden=true}});
}
async function restore(){
 const roleSaved=sessionStorage.getItem(savedRoleKey);
 if(roleSaved==='teacher'&&sessionStorage.getItem(teacherOkKey)==='1'){
   role='teacher';me={id:'teacher',name:'Учитель',role};
   try{const snap=await get(stateRef());const s=snap.val();if(s?.schema===1)await connectSession(s.sessionId)}catch(e){showError(e)}
 }else if(roleSaved==='student'){
   const person=readStudent();
   if(person){try{const snap=await get(stateRef());const s=snap.val();if(s?.schema===1)await joinStudent(person)}catch(e){showError(e)}}
 }
}
bindUI();renderState();drawBoard();updateSessionButtons();restore();

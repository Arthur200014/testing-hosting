function variant(id,n){
 const i=Math.floor(n),mod=(k,c)=>Math.floor(i/k)%c;
 if(id==='line-line'){
  const k1=[-2,-1.5,-1,-.5,.5,1,1.5,2][mod(1,8)],k2=k1+[-.5,.5][mod(8,2)],x=[-6,-5,5,6][mod(16,4)],b1=mod(64,5)-2,b2=b1+(k1-k2)*x,p={k1,k2,b1,b2};
  return{kind:id,p,mode:'findX',answer:x,view:{x:4,y:6},readPoints:[{which:1,x:0,y:b1},{which:1,x:1,y:k1+b1},{which:2,x:0,y:b2},{which:2,x:1,y:k2+b2}].filter(v=>Math.abs(v.y)<=6),q:'Две прямые пересекаются за пределами показанного фрагмента в точке A. Найдите абсциссу A.'};
 }
 if(id==='parabola-line'){
  const a=[-1,1][mod(1,2)],r=[-1,1][mod(2,2)],R=[-6,-5,5,6][mod(4,4)],b=mod(16,5)-2,c=mod(80,5)-2,k=b+a*(r+R),d=c-a*r*R,p={a,b,c,k,d};
  return{kind:id,p,roots:[r,R].sort((x,y)=>x-y),mode:'findX',answer:R,visibleIntersection:[r,a*r*r+b*r+c],visibleLabel:'A',view:{x:4,y:7},readPoints:[{which:1,x:0,y:c},{which:1,x:-b/(2*a),y:c-b*b/(4*a)},{which:2,x:0,y:d},{which:2,x:1,y:k+d}].filter(v=>Math.abs(v.x)<=4&&Math.abs(v.y)<=7),q:'Парабола и прямая пересекаются в A и B. Точка A отмечена, B находится вне рисунка. Найдите абсциссу B.'};
 }
 if(id==='hyperbola-line'){
  const r=[-4,-3,-2,-1,1,2,3,4][mod(1,8)],R=[-6,-5,5,6][mod(8,4)],m=[-.5,.5,-1,1][mod(32,4)],k=-m*r*R,b=-m*(r+R),p={k,m,b},readPoints=[];
  for(const x of [-4,-3,-2,-1,1,2,3,4])if(Math.abs(k/x)<=6){readPoints.push({which:1,x,y:k/x});if(readPoints.length===2)break}
  for(const x of [-1,0,1,2])if(Math.abs(m*x+b)<=6){readPoints.push({which:2,x,y:m*x+b});if(readPoints.length===4)break}
  return{kind:id,p,roots:[r,R].sort((x,y)=>x-y),mode:'findX',answer:R,visibleIntersection:[r,k/r],visibleLabel:'A',view:{x:4,y:7},readPoints,q:'Гипербола и прямая пересекаются в A и B. Точка A показана, B вне рисунка. Найдите абсциссу B.'};
 }
 if(id==='mixed'){
  const a1=[-1,1][mod(1,2)],D=a1,b1=mod(2,5)-2,c1=mod(10,5)-2,r=[-1,1][mod(50,2)],R=[-6,-5,5,6][mod(100,4)],a2=a1+D,b2=b1-D*(r+R),c2=c1+D*r*R,p={a1,b1,c1,a2,b2,c2};
  return{kind:id,p,roots:[r,R].sort((x,y)=>x-y),mode:'findX',answer:R,visibleIntersection:[r,a1*r*r+b1*r+c1],visibleLabel:'A',view:{x:4,y:8},readPoints:[{which:1,x:0,y:c1},{which:2,x:0,y:c2}].filter(v=>Math.abs(v.y)<=8),q:'Две параболы пересекаются в A и B. Точка A отмечена, B вне поля. Найдите абсциссу B.'};
 }
 if(id==='exp-line'){
  const a=[1.1,1.2,1.25,1.3,1.4,1.5,1.6,1.75,2][mod(1,9)],x=[3,4,5,6,7][mod(9,5)],c=a**x;
  return{kind:id,p:{a,c},roots:[x],mode:'findX',answer:x,view:{x:2,y:Math.max(8,Math.ceil(c)+1)},readPoints:[{which:1,x:1,y:a},{which:2,x:0,y:c}],q:'По графику y=aˣ и горизонтальной прямой найдите абсциссу пересечения.'};
 }
 if(id==='log'){
  const a=[2,3,4,5,6,7,8,9][mod(1,8)],n=[-2,-1,1,2,3][mod(8,5)],x0=a**n;
  return{kind:id,p:{a},x0,mode:'findY',answer:n,q:`По графику f(x)=logₐx найдите f(${fmt(x0)}).`,sol:[`Точка (${a};1) определяет основание a=${a}.`,`Поскольку ${fmt(x0)}=${a}^(${n}), то f(${fmt(x0)})=${n}.`]};
 }
 if(id==='root'){
  const a=[-3,-2,-1,1,2,3][mod(1,6)],x0=[4,9,16,25,36][mod(6,5)],answer=a*Math.sqrt(x0);
  return{kind:id,p:{a},point:[1,a],x0,mode:'findY',answer,view:{x:6,y:7},q:`По графику f(x)=k√x найдите f(${x0}).`,sol:[`По точке (1; ${a}) определяем коэффициент k=${a}.`,`f(${x0})=${a}·${Math.sqrt(x0)}=${answer}.`]};
 }
 if(id==='exponential'){
  const a=[.5,1.25,1.5,2,2.5,3,4][mod(1,7)],x0=[-3,-2,-1,1,2,3][mod(7,6)],answer=a**x0;
  return{kind:id,p:{a},x0,mode:'findY',answer,q:`По графику f(x)=aˣ найдите f(${x0}).`,sol:[`Точка (1;${fmt(a)}) даёт a=${fmt(a)}.`,`f(${x0})=(${fmt(a)})^(${x0})=${fmt(answer)}.`]};
 }
 return null;
}
function applyEge11Followup(input){
 if(input.includes('function taskHistory(state){'))return input;
 let s=input;
 const region=(a,b,value)=>{const i=s.indexOf(a),j=s.indexOf(b,i+a.length);if(i<0||j<0)throw Error('EGE11 patch region missing: '+a);s=s.slice(0,i)+value+'\n'+s.slice(j)};
 const replace=(oldText,newText)=>{if(s.split(oldText).length!==2)throw Error('EGE11 patch match missing: '+oldText.slice(0,50));s=s.replace(oldText,newText)};
 region('function makePairTask(','function freshUi(',`
function graphSignature(t){return JSON.stringify({kind:t?.kind,p:t?.p})}
${variant.toString()}
function makePairTask(id,peer=null,previous=null,history=[]){
 const used=new Set([...history,...[peer,previous].filter(Boolean).map(taskSignature)]);
 const good=t=>t&&!used.has(taskSignature(t))&&(!peer||graphSignature(t)!==graphSignature(peer));
 for(let i=0;i<220;i++){const t=generateTask(id);if(good(t))return t}
 for(let i=0;i<2400;i++){const t=variant(id,i);if(good(t))return t}
 throw Error('Уникальные условия данного прототипа закончились: '+id);
}
function taskHistory(state){
 const h=state.taskHistory||{};
 for(const p of PROTOS){
  const used=new Set(Array.isArray(h[p.id])?h[p.id]:[]);
  for(const st of [state.practice?.[p.id],state.practicePair?.[p.id]])if(st?.task)used.add(taskSignature(st.task));
  h[p.id]=[...used];
 }
 state.taskHistory=h;return h;
}`.trim());
 region('function freshUi()','let ui=freshUi()',`function freshUi(){
 const models={},practice={},practicePair={},history={};
 for(const item of PROTOS){
  models[item.id]={};for(const[k,c]of Object.entries(MODEL_CONFIG[item.id].sliders))models[item.id][k]=c.val;
  const a=generateTask(item.id),b=makePairTask(item.id,a,null,[taskSignature(a)]);
  practice[item.id]={task:a,answerText:'',checked:null,reveal:0};
  practicePair[item.id]={task:b,answerText:'',checked:null,reveal:0};
  history[item.id]=[taskSignature(a),taskSignature(b)];
 }
 return{activeProto:PROTOS[0].id,models,practice,practicePair,taskHistory:history};
}`);
 region('async function newTask(','function practiceFx(',`async function newTask(id,slot='a'){
 const aRoot=pairRoot(slot),bRoot=pairRoot(slot==='a'?'b':'a');
 if(!connected||!fb){
  const own=pairState(id,slot),peer=pairState(id,slot==='a'?'b':'a')?.task;
  if(!own?.task)return;
  const h=taskHistory(ui),next=makePairTask(id,peer,own.task,h[id]);h[id].push(taskSignature(next));
  clearTaskVisuals(id,slot);clearTaskInk(id,slot);
  localPatch(aRoot+'/'+id,{task:next,answerText:'',checked:null,reveal:0});return;
 }
 const ref=fb.ref(db,'sharedGuides/'+APP_ID+'/currentSession/state/ui');
 const result=await fb.runTransaction(ref,current=>{
  const own=current?.[aRoot]?.[id],peer=current?.[bRoot]?.[id]?.task;if(!own?.task)return;
  const h=taskHistory(current),next=makePairTask(id,peer,own.task,h[id]);h[id].push(taskSignature(next));
  current[aRoot][id]={task:next,answerText:'',checked:null,reveal:0};return current;
 },{applyLocally:false});
 if(!result.committed)throw Error('Не удалось сохранить уникальную задачу');
 clearTaskInk(id,slot);
}`);
 replace('`Представляем правую часть как степень основания: ${fmt(p.c)}=${fmt(a)}^(3/2). Значит x=3/2=${fmt(x)}.`','`Представляем правую часть как степень основания: ${fmt(p.c)}=${fmt(a)}^(${fmt(x)}). Значит x=${fmt(x)}.`');
 replace("if(!ui.practicePair){ui.practicePair={};for(const p of PROTOS)ui.practicePair[p.id]={task:makePairTask(p.id,ui.practice?.[p.id]?.task),answerText:'',checked:null,reveal:0};await update(uiRef(),{practicePair:ui.practicePair})}renderAll()","if(!ui.practicePair){ui.practicePair={};for(const p of PROTOS)ui.practicePair[p.id]={task:makePairTask(p.id,ui.practice?.[p.id]?.task),answerText:'',checked:null,reveal:0}}ui.taskHistory=taskHistory(ui);await update(uiRef(),{practicePair:ui.practicePair,taskHistory:ui.taskHistory});renderAll()");
 return s;
}
export {applyEge11Followup};

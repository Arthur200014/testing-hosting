import test from 'node:test';
import assert from 'node:assert/strict';
import { topicsForClass, renderClassProgram } from './class-program-ui.mjs';
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=(xs,empty,render)=>xs.length?xs.map(render).join(''):empty;
const item={id:'c1',kind:'individual',persistent:true,isArchived:false};
const data={nativeTasks:[],topicTaskLinks:[],classTopics:[
  {id:'t2',individualClassId:'c1',sortOrder:20,title:'Second',plan:''},
  {id:'t1',individualClassId:'c1',sortOrder:10,title:'<unsafe>',plan:'Read'},
  {id:'t3',groupClassId:'group',sortOrder:10,title:'Foreign',plan:''}
],materials:[{id:'m',title:'Notes',url:'https://example.org'}],topicMaterialLinks:[
  {id:'link',topicId:'t1',materialId:'m',title:'Notes',url:'https://example.org'}
]};
test('scopes and orders topics and escapes material content',()=>{
  assert.deepEqual(topicsForClass(item,data).map(x=>x.id),['t1','t2']);
  const markup=renderClassProgram(item,data,safe,list);
  assert.match(markup,/classTopicForm/);
  assert.match(markup,/topicMaterialAttachForm/);
  assert.match(markup,/&lt;unsafe&gt;/);
  assert.doesNotMatch(markup,/<unsafe>|Foreign/);
  assert.match(markup,/rel="noopener noreferrer"/);
});
test('group archive is read-only',()=>{
  const markup=renderClassProgram({id:'group',kind:'group',persistent:true,isArchived:true},data,safe,list);
  assert.match(markup,/Foreign/);
  assert.doesNotMatch(markup,/id="classTopicForm"|id="topicMaterialAttachForm"|id="topicTaskAttachForm"|data-move-topic|data-complete-topic/);
});
test('missing data shows loading state',()=>assert.match(renderClassProgram(item,{},safe,list),/Загружаем/));

test('completion filter keeps progress scoped to this class',()=>{
  const d={...data,classTopics:data.classTopics.map(x=>({...x,completedAt:x.id==='t1'?'2026-11-15T10:00:00Z':null,completionRevision:1}))};
  const markup=renderClassProgram(item,d,safe,list,'completed');
  assert.match(markup,/Пройдено 1 из 2/);
  assert.match(markup,/Вернуть в работу/);
  assert.doesNotMatch(markup,/data-class-topic="t2"|Foreign/);
  assert.match(markup,/data-topic-filter="completed" aria-pressed="true"/);
});
test('legacy imported class does not wait for resources that will never load',()=>{
  const markup=renderClassProgram({...item,persistent:false},{},safe,list);
  assert.match(markup,/пока недоступна/);
  assert.doesNotMatch(markup,/Загружаем|classTopicForm/);
});

test('without-task filter uses explicit topic links rather than student assignments',()=>{
  const d={...data,nativeTasks:[{id:'task',title:'<Task>'}],
    nativeAssignments:[{taskId:'task',membershipId:'unrelated'}],
    topicTaskLinks:[{id:'link',topicId:'t1',taskId:'task',title:'<Task>',prompt:'<script>unsafe</script>'}]};
  const filtered=renderClassProgram(item,d,safe,list,'without-task');
  assert.match(filtered,/data-class-topic="t2"/);
  assert.doesNotMatch(filtered,/data-class-topic="t1"|Foreign/);
  assert.match(filtered,/data-topic-filter="without-task" aria-pressed="true"/);
  const all=renderClassProgram(item,d,safe,list);
  assert.match(all,/&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(all,/<script>/);
  assert.match(all,/topicTaskAttachForm/);
});

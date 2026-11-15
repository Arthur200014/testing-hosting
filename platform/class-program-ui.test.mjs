import test from 'node:test';
import assert from 'node:assert/strict';
import { topicsForClass, renderClassProgram } from './class-program-ui.mjs';
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=(xs,empty,render)=>xs.length?xs.map(render).join(''):empty;
const item={id:'c1',kind:'individual',persistent:true,isArchived:false};
const data={classTopics:[
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
  assert.doesNotMatch(markup,/id="classTopicForm"|id="topicMaterialAttachForm"|data-move-topic/);
});
test('missing data shows loading state',()=>assert.match(renderClassProgram(item,{},safe,list),/Загружаем/));

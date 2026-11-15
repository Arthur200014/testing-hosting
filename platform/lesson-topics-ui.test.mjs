import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonBelongsToClass, lessonTopicChange, renderLessonTopics } from './lesson-topics-ui.mjs';
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=(xs,empty,render)=>xs.length?xs.map(render).join(''):empty;
const item={id:'class',kind:'individual',persistent:true};
const lesson={id:'lesson',individualClassId:'class'};
const data={lessonTopicSets:[{lessonId:'lesson',revision:4,topicIds:['one']}],classTopics:[
  {id:'one',individualClassId:'class',title:'<Title>',plan:'Plan',sortOrder:10},
  {id:'two',individualClassId:'foreign',title:'Foreign',sortOrder:10}
],topicMaterialLinks:[{topicId:'one',title:'Notes',url:'https://example.org'}],
 topicTaskLinks:[{topicId:'one',title:'Task',prompt:'<unsafe>'}]};
test('lesson editor shows only its class topics and inherits escaped content',()=>{
  const markup=renderLessonTopics(lesson,item,data,safe,list);
  assert.match(markup,/lessonTopicSetForm/);
  assert.match(markup,/data-revision="4"/);
  assert.match(markup,/value="one" checked/);
  assert.match(markup,/&lt;Title&gt;|&lt;unsafe&gt;/);
  assert.match(markup,/https:\/\/example.org/);
  assert.doesNotMatch(markup,/Foreign|<unsafe>/);
  assert.match(markup,/rel="noopener noreferrer"/);
});
test('append/remove preserves other topics and includes expected revision',()=>{
  assert.deepEqual(lessonTopicChange(data,'lesson','another',true),{lessonId:'lesson',expectedRevision:4,topicIds:['another','one']});
  assert.deepEqual(lessonTopicChange(data,'lesson','one',false).topicIds,[]);
  assert.deepEqual(data.lessonTopicSets[0].topicIds,['one']);
  assert.throws(()=>lessonTopicChange(data,'unknown','one',true),/Обновите/);
});
test('archive hides editor, legacy ownership is not inferred, group uses explicit class',()=>{
  assert.doesNotMatch(renderLessonTopics(lesson,{...item,isArchived:true},data,safe,list),/lessonTopicSetForm/);
  assert.equal(lessonBelongsToClass({id:'legacy',participants:[{membershipId:'class'}]},item),false);
  assert.doesNotMatch(renderLessonTopics({id:'legacy'},item,data,safe,list),/lessonTopicSetForm|Загружаем/);
  assert.equal(lessonBelongsToClass({groupClassId:'g'},{id:'g',kind:'group'}),true);
  assert.equal(lessonBelongsToClass({groupClassId:'g'},{id:'other',kind:'group'}),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonMaterialEntries, renderLessonMaterials } from './lesson-materials-ui.mjs';

const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=(xs,empty,render)=>xs.length?xs.map(render).join(''):empty;
const lesson={id:'lesson-one'};
const data={materials:[
  {id:'m1',title:'Reference',url:'https://example.org/ref'},
  {id:'m2',title:'Other',url:'https://example.org/other'}
],lessonMaterialLinks:[
  {id:'l1',lessonId:'lesson-one',materialId:'m1',title:'Reference',url:'https://example.org/ref'},
  {id:'l2',lessonId:'lesson-two',materialId:'m2',title:'Other',url:'https://example.org/other'}
]};
test('shows only current lesson links and can reuse other library items',()=>{
  const entries=lessonMaterialEntries(data,lesson.id);
  assert.deepEqual(entries.links.map(x=>x.id),['l1']);
  assert.deepEqual(entries.available.map(x=>x.id),['m2']);
  const markup=renderLessonMaterials(lesson,data,false,safe,list);
  assert.match(markup,/lessonMaterialAttachForm/);
  assert.match(markup,/rel="noopener noreferrer"/);
  assert.doesNotMatch(markup,/<strong>Other<\/strong>/);
});
test('archived lesson class offers read-only links and no new assignment form',()=>{
  assert.doesNotMatch(renderLessonMaterials(lesson,data,true,safe,list),/id="lessonMaterialAttachForm"/);
});
test('escapes unsafe link title',()=>{
  const modified={...data,lessonMaterialLinks:[{...data.lessonMaterialLinks[0],title:'<img src=x>'}]};
  assert.doesNotMatch(renderLessonMaterials(lesson,modified,false,safe,list),/<img /);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {newLibraryState,libraryEntries,filterLibrary,libraryTargets,libraryAttachment,renderLibrary} from './teacher-library.mjs';
const data=()=>({
  programs:[{id:'p',displayName:'Математика'},{id:'q',displayName:'Язык'}],
  students:[{membershipId:'a',programId:'p',isActive:true},{membershipId:'b',programId:'q',isActive:true}],
  classes:[{id:'c',studentMembershipId:'a',title:'Первый'},{id:'other',studentMembershipId:'b',title:'Другой'},{id:'archive',studentMembershipId:'a',isArchived:true}],
  groups:[{id:'g',title:'Пара',members:[{membershipId:'a',isApproved:true},{membershipId:'b',isApproved:false}]}],
  lessons:[{id:'l',individualClassId:'c',title:'Урок',participants:[{membershipId:'a'}]},{id:'wrong',groupClassId:'g',participants:[{membershipId:'b'}]}],
  classTopics:[{id:'topic',individualClassId:'c',title:'Тема'},{id:'otherTopic',individualClassId:'other'},{id:'archivedTopic',individualClassId:'archive'}],
  nativeTasks:[{id:'same',programId:'p',title:'Уравнения',prompt:'Решите КВАДРАТНОЕ уравнение',createdAt:'2026-01-01'}],
  materials:[{id:'same',title:'Разбор',url:'https://example.org/algebra',createdAt:'2026-01-02'},{id:'u',title:'Общее',url:'https://example.org/common'}],
  classMaterialLinks:[{id:'link',materialId:'same',individualClassId:'c'}],lessonMaterialLinks:[],topicMaterialLinks:[],topicTaskLinks:[]
});
test('searches title, condition and URL with independent task/material identities',()=>{
 const d=data();assert.equal(libraryEntries(d).length,3);
 assert.deepEqual(filterLibrary(d,{kind:'all',query:'квадратное'}).map(x=>x.kind),['task']);
 assert.deepEqual(filterLibrary(d,{kind:'material',query:'algebra'}).map(x=>x.id),['same']);
 assert.equal(filterLibrary(d,{kind:'all',programId:'p'}).length,2);
 assert.deepEqual(filterLibrary(d,{kind:'all',programId:'unlinked'}).map(x=>x.id),['u']);
 assert.equal(filterLibrary(d,{kind:'all',query:'не существует'}).length,0);
});
test('material program filter includes explicit topic and lesson associations',()=>{
 const d=data();d.classMaterialLinks=[];
 d.topicMaterialLinks=[{materialId:'u',topicId:'otherTopic'}];d.lessonMaterialLinks=[{materialId:'same',lessonId:'l'}];
 const rows=libraryEntries(d);assert.deepEqual(rows.find(x=>x.key==='material:u').programIds,['q']);
 assert.deepEqual(rows.find(x=>x.key==='material:same').programIds,['p']);
});
test('targets exclude archive, incompatible programs, unavailable recipients and existing links',()=>{
 const d=data(),task=libraryEntries(d).find(x=>x.kind==='task');
 assert.deepEqual(libraryTargets(task,d).map(x=>x.key),['topic:topic']);
 const destinations=libraryTargets(task,d,true).map(x=>x.key);
 assert.ok(destinations.includes('class:individual:c'));assert.ok(destinations.includes('class:group:g'));assert.ok(destinations.includes('lesson:l'));
 assert.ok(!destinations.includes('lesson:wrong'));assert.ok(!destinations.some(x=>x.includes('other')||x.includes('archive')));
 const material=libraryEntries(d).find(x=>x.key==='material:same');
 assert.ok(!libraryTargets(material,d).some(x=>x.key==='class:individual:c'));
 assert.throws(()=>libraryAttachment(material,'class:individual:c',d));
 assert.throws(()=>libraryAttachment(material,'class:individual:foreign',d));
});
test('reuses object IDs through existing endpoints without sending duplicate content',()=>{
 const d=data(),material=libraryEntries(d).find(x=>x.key==='material:same'),task=libraryEntries(d)[0];
 assert.deepEqual(libraryAttachment(material,'lesson:l',d),{path:'lesson-materials',body:{lessonId:'l',materialId:'same'},keys:['lessonMaterialLinks']});
 assert.deepEqual(libraryAttachment(task,'topic:topic',d).body,{topicId:'topic',taskId:'same'});
 assert.deepEqual(libraryAttachment(material,'topic:topic',d).body,{topicId:'topic',materialId:'same'});
});
test('preview escapes source text and never creates an unsafe link or iframe',()=>{
 const d=data();d.materials[0].url='javascript:alert(1)';d.materials[0].title='<img src=x>';
 const state={...newLibraryState(),selected:'material:same'};
 const safe=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const html=renderLibrary(d,state,safe);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|<iframe|href="javascript:/);
 const a=newLibraryState(),b=newLibraryState();a.query='x';assert.equal(b.query,'');
});

test('material management maps exact bindings and preserves the draft revision for conflict checks',async()=>{
 const {materialBindings,materialManagementAction,libraryUsedBytes,renderMaterialManagement}=await import('./teacher-library.mjs');
 const d=data(),entry={...libraryEntries(d).find(x=>x.key==='material:same'),fileId:'file',sizeBytes:12,revision:3};
 d.lessonMaterialLinks=[{id:'lesson-link',lessonId:'l',materialId:entry.id}];
 d.topicMaterialLinks=[{id:'topic-link',topicId:'topic',materialId:entry.id}];
 const links=materialBindings(entry,d);
 assert.deepEqual(links.map(x=>x.key),['class:link','topic:topic-link','lesson:lesson-link']);
 assert.throws(()=>materialManagementAction(entry,'delete',d,{revision:3}),/привязки/);
 assert.deepEqual(materialManagementAction(entry,'unlink',d,{binding:'lesson:lesson-link'}),{path:'materials/same/unlink',body:{linkKind:'lesson',linkId:'lesson-link'},keys:['lessonMaterialLinks']});
 assert.throws(()=>materialManagementAction(entry,'unlink',d,{binding:'class:foreign'}));
 const action=materialManagementAction(entry,'rename',d,{revision:1,title:' New label '});
 assert.deepEqual(action.body,{expectedRevision:1,title:'New label'});
 assert.equal(entry.revision,3);assert.equal(entry.fileId,'file');
 const safe=x=>String(x??'').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const html=renderMaterialManagement({...entry,title:'<unsafe>'},d,safe,true);
 assert.match(html,/data-revision="3"/);assert.match(html,/&lt;unsafe&gt;/);assert.match(html,/type="submit" class="secondary" disabled/);
 d.materials=[{fileId:'f',sizeBytes:12},{fileId:'deleted',sizeBytes:40,deletedAt:'2026-01-01'},{url:'https://example.org',sizeBytes:200}];
 assert.equal(libraryUsedBytes(d),12);
 assert.throws(()=>materialManagementAction({kind:'task',id:'x'},'rename',d,{revision:1,title:'New'}));
 d.classMaterialLinks=[];d.topicMaterialLinks=[];d.lessonMaterialLinks=[];
 assert.equal(materialManagementAction(entry,'delete',d,{revision:3}).path,'materials/same/delete');
});

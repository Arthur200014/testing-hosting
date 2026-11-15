import test from 'node:test';
import assert from 'node:assert/strict';
import { classMaterialEntries, renderClassMaterials } from './class-materials-ui.mjs';

const escape = x => String(x ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const list = (items, empty, fn) => items.length ? items.map(fn).join('') : empty;
const item = { id:'one', kind:'individual', persistent:true, isArchived:false };
const data = { materials:[{id:'m1',title:'Safe',url:'https://example.org/test'}, {id:'m2',title:'Other',url:'https://example.org/other'}],
  classMaterialLinks:[{id:'l1',materialId:'m1',individualClassId:'one',title:'Safe',url:'https://example.org/test'},
    {id:'l2',materialId:'m2',individualClassId:'another',title:'Other',url:'https://example.org/other'}] };

test('class shows its own attachment and only unattached library choices', () => {
  const entries=classMaterialEntries(data,item);
  assert.deepEqual(entries.links.map(x=>x.id),['l1']);
  assert.deepEqual(entries.available.map(x=>x.id),['m2']);
  const markup=renderClassMaterials(item,data,escape,list);
  assert.match(markup,/https:\/\/example.org\/test/);
  assert.match(markup,/rel="noopener noreferrer"/);
  assert.match(markup,/classMaterialLinkForm/);
  assert.doesNotMatch(markup,/<strong>Other<\/strong>/);
});

test('archived and legacy classes cannot write materials', () => {
  assert.doesNotMatch(renderClassMaterials({...item,isArchived:true},data,escape,list),/classMaterialLinkForm/);
  assert.doesNotMatch(renderClassMaterials({...item,persistent:false},data,escape,list),/classMaterialAttachForm/);
});

test('escaped title and URL never become markup', () => {
  const hostile={...data,classMaterialLinks:[{...data.classMaterialLinks[0],title:'<img src=x onerror=alert(1)>'}]};
  const markup=renderClassMaterials(item,hostile,escape,list);
  assert.doesNotMatch(markup,/<img/);
  assert.match(markup,/&lt;img/);
});

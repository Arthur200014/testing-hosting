import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('../../../EGA/config/probnic.html', import.meta.url);

async function ogeSource() {
  const outer = await readFile(pageUrl, 'utf8');
  const match = outer.match(/oge:\{label:'ОГЭ-2027',teacherButton:'[^']+',htmlB64:'([^']+)'\}/);
  assert.ok(match, 'embedded OGE page must exist');
  return Buffer.from(match[1], 'base64').toString('utf8');
}

test('OGE teacher save sends the complete GAS variant contract', async () => {
  const source = await ogeSource();
  assert.match(source, /questions:src\.questions\.map\(\(q,i\)=>serverQuestion\(q,i,practiceGroup\)\)/);
  assert.match(source, /secondPart:src\.secondPart\.map\(\(q,i\)=>serverSecondPart\(q,i\)\)/);
  assert.match(source, /taskCount:19,fullTaskCount:25/);
  assert.match(source, /function serverQuestion\(q,index,practiceGroup\)/);
  assert.match(source, /function serverSecondPart\(q,index\)/);
});

test('OGE server round-trip preserves practical block and second-part bank selections', async () => {
  const source = await ogeSource();
  assert.match(source, /OGE_PRACTICE_SOURCE_PREFIX='oge-practice:'/);
  assert.match(source, /savedPracticeGroup=storedPracticeGroup\(src\.questions\?\.\[0\]\?\.source\)/);
  assert.match(source, /const id=q\?\.prototypeId\|\|storedBankId\(q\?\.source\)/);
  assert.match(source, /source:id\?OGE_BANK_SOURCE_PREFIX\+id:/);
});

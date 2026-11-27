import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const source=await readFile(new URL('./worksheet-pdf.js',import.meta.url));
const {buildJpegPdf,createWorksheetPdfExporter}=await import('data:text/javascript;base64,'+source.toString('base64'));
test('all pages teacher only, notes available to all, snapshot order and mode',async()=>{
let role='student', captured=[];
const e=createWorksheetPdfExporter({getRole:()=>role,getPages:()=>[{id:1,hasInk:false},{id:2,hasInk:true}],capture:(p,o)=>{captured.push([p.id,o.includeInk]);return p.id;},buildPdf:a=>a});
await assert.rejects(e.export('all'),/Teacher required/);assert.deepEqual(await e.export('notes'),[2]);role='teacher';assert.deepEqual(await e.export('all'),[1,2]);assert.deepEqual(captured,[[2,true],[1,false],[2,false]]);assert.equal(e.busy,false);
});
test('PDF offsets and page count',async()=>{const jpeg=new Uint8Array([255,216,255,217]);const pdf=buildJpegPdf([{w:1600,h:900,bytes:jpeg},{w:1600,h:900,bytes:jpeg}]);const b=Buffer.from(await pdf.arrayBuffer());const s=b.toString('latin1');assert.match(s,/\/Count 2/);const x=Number(s.match(/startxref\n(\d+)/)[1]);assert.equal(s.slice(x,x+4),'xref');const lines=s.slice(x).split('\n');for(let i=1;i<9;i++){const off=Number(lines[i+2].slice(0,10));assert.ok(s.slice(off).startsWith(i+' 0 obj'));}});

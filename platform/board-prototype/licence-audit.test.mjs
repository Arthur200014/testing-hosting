import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, symlink, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'tas-license-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 for(const p of ['audit-licenses.mjs','audit-fonts.mjs','package.json','package-lock.json','licence-review-lock.json','licence-overrides.json','font-review.json','FONT_NOTICES.txt','THIRD_PARTY_NOTICES.txt','licences'])await cp(p,join(dir,p),{recursive:true});
 await symlink(resolve('node_modules'),join(dir,'node_modules'),'dir');
 return {dir,run:(script,args=[])=>spawnSync(process.execPath,[script,...args],{cwd:dir,encoding:'utf8'})};
}
test('licence gate rejects unknown graph, altered notices and unreviewed licence',async t=>{
 const f=await fixture(t); assert.equal(f.run('audit-licenses.mjs').status,0);
 const p=join(f.dir,'licence-review-lock.json'),original=await readFile(p,'utf8'),r=JSON.parse(original);
 delete r['node_modules/react'];await writeFile(p,JSON.stringify(r));assert.match(f.run('audit-licenses.mjs').stderr,/graph changed/);
 const bad=JSON.parse(original);bad['node_modules/react'].license='proprietary';await writeFile(p,JSON.stringify(bad));assert.match(f.run('audit-licenses.mjs').stderr,/Unreviewed licence/);
 await writeFile(p,original);await writeFile(join(f.dir,'licences/excalidraw.txt'),'tampered');assert.match(f.run('audit-licenses.mjs').stderr,/Missing\/changed copyright/);
});
test('font gate rejects a changed fingerprint and legacy font in built assets',async t=>{
 const f=await fixture(t),p=join(f.dir,'font-review.json'),original=await readFile(p,'utf8');
 const r=JSON.parse(original);r.files[0].sha256='wrong';await writeFile(p,JSON.stringify(r));assert.match(f.run('audit-fonts.mjs').stderr,/Font asset changed/);
 await writeFile(p,original);await mkdir(join(f.dir,'editor/dist'),{recursive:true});
 await cp('node_modules/@excalidraw/excalidraw/dist/prod/fonts/Liberation/LiberationSans-Regular.woff2',join(f.dir,'editor/dist/legacy.woff2'));
 assert.match(f.run('audit-fonts.mjs',['--built']).stderr,/Legacy Liberation1.05 leaked/);
});

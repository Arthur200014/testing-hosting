import { readFile, readdir, writeFile } from 'node:fs/promises';
const lock=JSON.parse(await readFile(new URL('./package-lock.json',import.meta.url)));
const scope=JSON.parse(await readFile(new URL('./transport-license-scope.json',import.meta.url)));
const packages=[];
for(const [path,e] of Object.entries(lock.packages)) {
  if(!path||e.dev||scope[path])continue;
  let pkg,files;try {pkg=JSON.parse(await readFile(new URL('./'+path+'/package.json',import.meta.url)));files=await readdir(new URL('./'+path+'/',import.meta.url));}catch{continue;}
  packages.push({path,version:e.version,license:pkg.license??pkg.licenses??null,
    notices:files.filter(f=>/^(licen[cs]e|copying|notice)([.-]|$)/i.test(f)),review:'PENDING'});
}
await writeFile(new URL('./EDITOR_LICENSE_REVIEW.json',import.meta.url),JSON.stringify({
  status:'BLOCKED: editor graph NOT APPROVED; no merge/distribution/production enablement',
  notes:'Metadata inventory is not a licence clearance. Resolve missing notices and review fonts, EPL-2.0, dual licence choices and bundled dependencies before GO.',packages
},null,2)+'\n');
console.log(`Inventory only: ${packages.length} additional installed runtime packages require review`);

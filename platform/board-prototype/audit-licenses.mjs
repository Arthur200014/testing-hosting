import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = dirname(fileURLToPath(import.meta.url));
const json = async p => JSON.parse(await readFile(join(root,p)));
const lock = await json('package-lock.json'), manifest = await json('package.json');
const overrides = await json('licence-overrides.json');
const review = await json('licence-review-lock.json');
const allowed = new Set(['MIT','ISC','BSD-2-Clause','BSD-3-Clause','Apache-2.0','CC0-1.0','Unlicense','0BSD','OFL-1.1','(MIT OR CC0-1.0)','(MIT AND Zlib)','(MPL-2.0 OR Apache-2.0)']);
const hash = x => createHash('sha256').update(x).digest('hex');
for(const [name,version] of Object.entries(manifest.dependencies))
  if(!/^\d+\.\d+\.\d+$/.test(version) || lock.packages[''].dependencies[name] !== version) throw new Error('Unpinned dependency: '+name);
let report='# Locked prototype runtime dependency notices\n\n'+
  'Generated from reviewed package-lock.json, shipped notices and attributed upstream supplements.\n'+
  'DOMPurify: Apache-2.0 branch selected; Pako: MIT AND Zlib retained. Development-only tools excluded.\n'+
  'Font assets are separately checked by audit-fonts.mjs. No original Liberation1.05 asset may ship.\n\n';
const packages=Object.entries(lock.packages).filter(([p,e])=>p&&!e.dev).sort(([a],[b])=>a.localeCompare(b));
if(packages.length!==Object.keys(review).length)throw new Error('Runtime graph changed; explicit licence review required');
for(const [path,e] of packages){
  const reviewed=review[path];
  if(!reviewed || reviewed.version!==e.version || reviewed.integrity!==e.integrity || !e.integrity)throw new Error('Unreviewed lock entry: '+path);
  let pkg,files;
  try {pkg=await json(path+'/package.json');files=(await readdir(join(root,path))).filter(f=>/^(licen[cs]e|copying|notice|copyright)([.-]|$)/i.test(f)).sort();}
  catch(error){
    if(error.code!=='ENOENT' || !e.optional || path!=='node_modules/fsevents')throw error;
    pkg={name:'fsevents',version:e.version,license:e.license};files=[];
  }
  if(pkg.name==='fsevents')files=[]; // Use the retained exact tarball notice on every OS.
  const extra=overrides[`${pkg.name}@${pkg.version}`];
  const license=pkg.license??extra?.license??(pkg.licenses?.length===1?pkg.licenses[0].type:undefined);
  if(pkg.version!==e.version||!allowed.has(license)||reviewed.license!==license)throw new Error('Unreviewed licence: '+path+' '+license);
  let notice='';
  for(const file of files)notice+=`${file}:\n\n${await readFile(join(root,path,file),'utf8')}\n\n`;
  if(extra?.file)notice+=`Supplement: ${extra.source}\n\n${await readFile(join(root,extra.file),'utf8')}\n\n`;
  if(!notice||hash(notice)!==reviewed.noticeSha256)throw new Error('Missing/changed copyright notices: '+path);
  report+=`## ${pkg.name}@${pkg.version} — ${license}\n\n${notice}`;
}
report=report.replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,'');
if(process.argv.includes('--write'))await writeFile(join(root,'THIRD_PARTY_NOTICES.txt'),report);
else if(await readFile(join(root,'THIRD_PARTY_NOTICES.txt'),'utf8')!==report)throw new Error('Retained notices differ');
console.log(`PASS: ${packages.length} locked runtime packages with reviewed free-software licences and retained notices`);

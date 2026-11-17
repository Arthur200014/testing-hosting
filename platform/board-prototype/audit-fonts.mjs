import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, join } from 'node:path';
const hash=b=>createHash('sha256').update(b).digest('hex');
const review=JSON.parse(await readFile('font-review.json'));
const original=await readFile('node_modules/@excalidraw/excalidraw/dist/prod/fonts/Liberation/LiberationSans-Regular.woff2');
let report='# Font notices for the isolated editor\n\n'+
'Pinned Excalidraw0.18.1 assets, with the Liberation1.05 export fallback excluded/replaced by unmodified Fontsource Arimo5.3.0 Latin400.\n'+
'The CSS family alias does not modify font name tables or reserved names. Export remains unsupported in this prototype.\n'+
'Fonts are bundled with this software, never sold separately. Retain these notices and licences with distribution.\n\n';
for(const family of review.families){
  report+=`## ${family.name} — ${family.license}\n\n${family.copyright}\n\nSource: ${family.source}\n\n`;
  report+=await readFile(family.notice,'utf8')+'\n\n';
}
for(const f of review.files){if(hash(await readFile(f.path))!==f.sha256)throw new Error('Font asset changed: '+f.path);}
async function walk(dir){let out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);out.push(...(e.isDirectory()?await walk(p):[p]));}return out;}
const npmFonts=(await walk('node_modules/@excalidraw/excalidraw/dist/prod/fonts')).filter(p=>p.endsWith('.woff2'));
if(npmFonts.length!==review.originalFileCount)throw new Error('Upstream font set changed');
report=report.replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,'');
if(process.argv.includes('--write'))await writeFile('FONT_NOTICES.txt',report);
else if(await readFile('FONT_NOTICES.txt','utf8')!==report)throw new Error('Font notices differ');
if(process.argv.includes('--built')){
  const files=await walk('editor/dist');let fontCount=0;
  const allowed=new Set(review.files.map(f=>f.sha256));
  for(const p of files.filter(p=>p.endsWith('.woff2'))){const b=await readFile(p);if(hash(b)===hash(original))throw new Error('Legacy Liberation1.05 leaked into bundle');if(!allowed.has(hash(b)))throw new Error('Unreviewed built font: '+p);fontCount++;}
  if(!fontCount)throw new Error('No built font assets');
  for(const name of ['FONT_NOTICES.txt','THIRD_PARTY_NOTICES.txt'])if(!Buffer.from(await readFile(name)).equals(await readFile('editor/dist/'+name)))throw new Error('Missing distributed notices');
  console.log(`PASS: ${fontCount} built font copies match reviewed assets; legacy font excluded; notices distributed`);
}
console.log(`PASS: ${review.families.length} reviewed font families, ${review.files.length} source assets`);

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const lock = JSON.parse(await readFile(join(root, 'package-lock.json')));
const manifest = JSON.parse(await readFile(join(root, 'package.json')));
const transportOnly = process.argv.includes('--transport-only');
const scope = JSON.parse(await readFile(join(root, 'transport-license-scope.json')));
const allowed = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '(MIT OR CC0-1.0)']);
for (const [name, version] of Object.entries(manifest.dependencies)) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || lock.packages[''].dependencies[name] !== version)
    throw new Error('Dependencies must be exactly pinned: ' + name);
}
let report = '# Locked prototype runtime dependency notices\n\n'
  + 'Generated from package-lock.json and installed package licence/NOTICE files.\n'
  + (transportOnly ? 'Covers pg and Socket.IO only; the editor graph is excluded and remains unaudited.\n\n' : 'Covers locked editor, React, pg and Socket.IO runtime packages; development build/test tools excluded.\n\n');
let count = 0;
for (const [path, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
  if (!path || entry.dev || (transportOnly && !scope[path])) continue;
  if (transportOnly && scope[path] !== entry.version) throw new Error('Previously audited version changed: '+path);
  const dir = join(root, path), pkg = JSON.parse(await readFile(join(dir, 'package.json')));
  const license = pkg.license ?? (pkg.name === 'xmlhttprequest-ssl' && pkg.version === '2.1.2' && pkg.licenses?.length === 1 ? pkg.licenses[0].type : undefined);
  if (pkg.version !== entry.version || !entry.integrity || !allowed.has(license))
    throw new Error(`Unreviewed licence, version or integrity: ${path} ${license}`);
  const files = (await readdir(dir)).filter(f => /^(licen[cs]e|copying|notice)([.-]|$)/i.test(f)).sort();
  if (!files.length && ['pg-types@2.2.0', 'pgpass@1.0.5'].includes(`${pkg.name}@${pkg.version}`)) {
    const readme = await readFile(join(dir, 'README.md'), 'utf8');
    const section = readme.match(/^## [Ll]icense\s*\n([\s\S]+)$/m)?.[1];
    if (!section?.includes('Permission is hereby granted')) throw new Error('Missing embedded MIT notice');
    report += `## ${pkg.name}@${pkg.version} — ${license}\n\nREADME.md licence section:\n\n${section}\n`;
    count++; continue;
  }
  if (!files.length) throw new Error('Missing licence notice: ' + path);
  report += `## ${pkg.name}@${pkg.version} — ${license}\n\n`;
  for (const file of files) report += `${file}:\n\n${await readFile(join(dir, file), 'utf8')}\n\n`;
  count++;
}
if (process.argv.includes('--write')) await writeFile(join(root, 'THIRD_PARTY_NOTICES.txt'), report);
else if (await readFile(join(root, 'THIRD_PARTY_NOTICES.txt'), 'utf8') !== report)
  throw new Error('Notices differ; review installed licences and run audit-licenses.mjs --write');
console.log(`PASS: ${count} locked runtime packages with allowed licences and retained notices`);

import {readdir, readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const sources = [];
for (const dir of ['', 'chrome-extension', 'tools']) {
  for (const name of await readdir(path.join(root, dir))) {
    if (/\.(js|mjs)$/.test(name)) sources.push(path.posix.join(dir, name));
  }
}
sources.sort();
const tests = sources.filter(name => name.endsWith('.test.mjs'));
const commands = [];
let failed = false;
for (const args of [...sources.map(name => ['--check', name]), ['--test', '--test-reporter=tap', ...tests]]) {
  const run = spawnSync(process.execPath, args, {cwd: root, encoding: 'utf8'});
  const output = (run.stdout || '') + (run.stderr || '') + (run.error?.message || '');
  commands.push({command: 'node ' + args.join(' '), exitCode: run.status, output});
  if (run.status !== 0) failed = true;
}
const hashes = {};
for (const name of [...sources, 'manifest.json', 'native-profile.json', 'chrome-extension/manifest.json', 'chrome-extension/native-profile.json']) {
  hashes[name] = createHash('sha256').update(await readFile(path.join(root, name))).digest('hex');
}
const notes = path.join(root, '.skill/notes');
await mkdir(notes, {recursive: true});
await writeFile(path.join(notes, 'verification.json'), JSON.stringify({
  timestamp: new Date().toISOString(), node: process.version, platform: process.platform,
  status: failed ? 'failed' : 'passed', sourceHashes: hashes, commands,
  limitations: ['Node fixtures and syntax only; no installed extension or live game run.', 'Coverity not run: no configured analyzer or capture target.']
}, null, 2) + '\n');
const summary = commands.at(-1).output.split(/\r?\n/).filter(line => /^# (tests|pass|fail|cancelled|skipped)/.test(line));
console.log(summary.join('\n'));
console.log(`Syntax: ${sources.length} files. Evidence: .skill/notes/verification.json`);
if (failed) { console.error(commands.filter(c => c.exitCode !== 0)); process.exitCode = 1; }

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLogged } from '../ci/run-logged.mjs';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const EXCLUDE = new Set(['index.mjs', 'harness.mjs']);
const listOnly = process.argv.includes('--list');

const runners = readdirSync(DIR)
  .filter((name) => name.endsWith('.mjs') && !EXCLUDE.has(name))
  .sort();

if (runners.length === 0) {
  console.error('✖ scripts/smoke 里没有可跑的脚本');
  process.exit(1);
}
if (listOnly) {
  for (const name of runners) console.log(name);
  process.exit(0);
}

for (const name of runners) {
  const label = name.replace(/\.mjs$/u, '');
  const ok = await runLogged({
    root: ROOT,
    label,
    file: 'node',
    args: [join(DIR, name)],
    pattern: /❌|没过|FAIL |× |→ /,
  });
  if (!ok) process.exit(1);
  console.log(`✔ ${label}`);
}
console.log(`✔ 平台冒烟：${runners.length} 个脚本都过了`);

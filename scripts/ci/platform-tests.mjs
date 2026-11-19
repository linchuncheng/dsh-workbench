import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLogged } from './run-logged.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MANIFEST = join(ROOT, 'packages/core/scripts/selfcheck/platform-landings.json');
const dryRun = process.argv.includes('--dry-run');

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function manifestOf() {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch (error) {
    fail(`读不了 ${relative(ROOT, MANIFEST)}：${error instanceof Error ? error.message : String(error)}`);
  }
}

function testsOf(manifest) {
  const files = new Set();
  for (const group of ['allow', 'landings', 'ports']) {
    for (const entry of Object.values(manifest[group] ?? {})) {
      for (const test of entry.tests ?? []) files.add(test);
    }
  }
  for (const tests of Object.values(manifest.suites ?? {})) {
    for (const test of tests ?? []) files.add(test);
  }
  return [...files].sort();
}

function groupsOf(files) {
  const groups = new Map();
  for (const file of files) {
    if (!existsSync(join(ROOT, file))) fail(`清单里的测试不存在：${file}`);
    const pkgDir = file.split('/').slice(0, 2).join('/');
    const manifest = JSON.parse(readFileSync(join(ROOT, pkgDir, 'package.json'), 'utf8'));
    if (!groups.has(pkgDir)) groups.set(pkgDir, { dir: pkgDir, name: manifest.name, files: [] });
    groups.get(pkgDir).files.push(relative(join(ROOT, pkgDir), join(ROOT, file)).split('\\').join('/'));
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const groups = groupsOf(testsOf(manifestOf()));
if (groups.length === 0) fail('清单里一个测试都没有');
if (dryRun) {
  for (const group of groups) console.log(`${group.name}: ${group.files.length} 个测试\n  ${group.files.join('\n  ')}`);
  process.exit(0);
}
const failed = [];
for (const group of groups) {
  const label = `platform-tests-${group.dir.split('/')[1]}`;
  const ok = await runLogged({
    root: ROOT,
    label,
    file: 'pnpm',
    args: ['--filter', group.name, 'exec', 'vitest', 'run', '--testTimeout=20000', ...group.files],
    pattern: /FAIL |× |→ /,
  });
  if (!ok) {
    failed.push(group.name);
    continue;
  }
  console.log(`✔ ${group.name}：${group.files.length} 个平台敏感测试通过`);
}
if (failed.length > 0) {
  console.error(`✖ ${failed.length} 个包的平台测试没过：${failed.join('、')}`);
  process.exit(1);
}
console.log(`✔ 清单驱动的平台测试：${groups.length} 个包都通过`);

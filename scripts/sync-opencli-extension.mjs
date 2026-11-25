import { createHash } from 'node:crypto';
import { execa } from 'execa';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LOCK = join(ROOT, 'scripts', 'opencli-extension.lock.json');
const VENDOR = join(ROOT, 'packages', 'adapter-runtime', 'vendor', 'browser-extension');
const KEEP = 'LICENSE';

function out(line) {
  process.stdout.write(`${line}\n`);
}

function digestOf(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function filesUnder(dir, prefix = '') {
  const found = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...filesUnder(join(dir, entry.name), rel));
    else found.push(rel);
  }
  return found;
}

async function main() {
  const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
  const asked = (process.argv.find((one) => one.startsWith('--zip=')) ?? '').slice('--zip='.length);
  const local = asked !== '' ? asked : (process.env.OPENCLI_EXTENSION_ZIP ?? '').trim();
  const work = mkdtempSync(join(tmpdir(), 'opencli-extension-'));
  const zip = local === '' ? join(work, 'ext.zip') : local;
  if (local === '') {
    out(`下载 ${lock.upstream}`);
    await execa('curl', ['-sSL', '-o', zip, lock.upstream], { stdio: 'inherit' });
  } else {
    out(`用本地包 ${zip}`);
  }
  const actual = digestOf(zip);
  if (actual !== lock.sha256) {
    out(`sha256 对不上：lock 里 ${lock.sha256}，实际 ${actual} —— 先确认源没被替换，再更新 lock`);
    return 1;
  }
  out(`sha256 对得上：${actual}`);
  await execa('unzip', ['-q', zip, '-d', join(work, 'out')], { stdio: 'inherit' });
  const license = existsSync(join(VENDOR, KEEP)) ? readFileSync(join(VENDOR, KEEP)) : undefined;
  rmSync(VENDOR, { recursive: true, force: true });
  mkdirSync(VENDOR, { recursive: true });
  cpSync(join(work, 'out'), VENDOR, { recursive: true });
  if (license !== undefined) writeFileSync(join(VENDOR, KEEP), license);
  const manifest = JSON.parse(readFileSync(join(VENDOR, 'manifest.json'), 'utf8'));
  const files = Object.fromEntries(filesUnder(VENDOR).map((rel) => [rel, digestOf(join(VENDOR, rel))]));
  writeFileSync(LOCK, `${JSON.stringify({ ...lock, version: String(manifest.version), files }, null, 2)}\n`);
  out(`已更新 vendor 目录：${filesUnder(VENDOR).join('、')}`);
  rmSync(work, { recursive: true, force: true });
  return 0;
}

process.exitCode = await main();

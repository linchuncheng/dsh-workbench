#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RELEASE_LIST = join(ROOT, 'packages/shared/src/host/supply/release-packages.generated.ts');
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const SCRIPT = /(?:^|[\n;])\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function releaseNames() {
  const text = readFileSync(RELEASE_LIST, 'utf8');
  return [...text.matchAll(/'([^']+)'/g)].map((one) => one[1]);
}

function dirOf(name) {
  return join(ROOT, 'packages', name.split('/')[1]);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function topOf(spec) {
  return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
}

function testLooking(file) {
  const parts = file.split(sep);
  return parts.includes('__tests__') || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
}

const problems = [];
const scanned = [];

for (const name of releaseNames()) {
  const dir = dirOf(name);
  const manifestPath = join(dir, 'package.json');
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
  const roots = ['dist', 'bin']
    .map((one) => join(dir, one))
    .filter((one) => existsSync(one) && statSync(one).isDirectory());
  const files = roots.flatMap(walk).filter((one) => /\.(?:js|mjs|cjs)$/.test(one));
  scanned.push(`${name}(${files.length})`);
  for (const file of files) {
    const rel = relative(dir, file).split(sep).join('/');
    if (testLooking(rel)) problems.push(`${name}: 发布产物里有测试文件 ${rel}`);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(SCRIPT)) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (spec === undefined || spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('${')) continue;
      if (BUILTINS.has(spec)) continue;
      if (declared.has(topOf(spec))) continue;
      problems.push(`${name}: ${rel} 用到 ${topOf(spec)}，但 package.json 没声明`);
    }
  }
}

if (problems.length > 0) {
  const unique = [...new Set(problems)];
  for (const problem of unique) console.error(`✖ ${problem}`);
  console.error(`✖ 声明与产物对不上：${unique.length} 条`);
  console.error('  补 dependencies / peerDependencies，或把这份产物从包里去掉了再发。');
  process.exit(1);
}
console.log(`✔ 产物 import 都在声明里：${scanned.join(' · ')}`);

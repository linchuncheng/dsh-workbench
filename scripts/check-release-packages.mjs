#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOOLCHAIN = '@dsh-workbench/module-tools';

function releaseNames() {
  const text = readFileSync(join(ROOT, 'packages/shared/src/host/release-packages.generated.ts'), 'utf8');
  return [...text.matchAll(/'([^']+)'/g)].map((one) => one[1]).filter((one) => one !== TOOLCHAIN);
}

function dirOf(name) {
  return join(ROOT, 'packages', name.split('/')[1]);
}

function readManifest(name) {
  const file = join(dirOf(name), 'package.json');
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, 'utf8'));
}

function targetsOf(value, out) {
  if (typeof value === 'string') {
    if (value.startsWith('./') && !value.includes('*')) out.push(value.slice(2));
    return out;
  }
  if (value === null || typeof value !== 'object') return out;
  for (const item of Object.values(value)) targetsOf(item, out);
  return out;
}

function main() {
  const names = releaseNames();
  const core = readManifest('@dsh-workbench/core');
  if (core === undefined) {
    console.error('❌ 找不到 packages/core/package.json');
    return 1;
  }
  const version = core.version;
  const problems = [];
  for (const name of names) {
    const dir = dirOf(name);
    const manifest = readManifest(name);
    if (manifest === undefined) {
      problems.push(`${name}：没有 packages/${name.split('/')[1]}/package.json`);
      continue;
    }
    if (manifest.name !== name) problems.push(`${name}：package.json 里的名字是 ${String(manifest.name)}`);
    if (manifest.version !== version) problems.push(`${name}：版本 ${String(manifest.version)} ≠ core 的 ${version}`);
    for (const rel of targetsOf(manifest.exports ?? {}, [])) {
      if (!existsSync(join(dir, rel))) problems.push(`${name}：exports 指向的 ${rel} 不在这棵树里（构建没跑？）`);
    }
  }
  if (problems.length > 0) {
    for (const one of problems) console.error(`❌ ${one}`);
    console.error(`❌ 发布包自检没过：${problems.length} 条（构建之后再看：pnpm -w run build）`);
    return 1;
  }
  console.log(`✅ 发布包自检过了：${names.length} 个包 · 版本都是 ${version} · exports 指向的产物都在`);
  return 0;
}

process.exit(main());

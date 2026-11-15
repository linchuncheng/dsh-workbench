import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { versionGateOf, probeEntry, type VersionEntryProbe } from '../version-gate.js';

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-wb-version-gate-'));
const VERSION = '1.2.3-beta.3';
const CORE = '@dsh-workbench/core';
const PACKAGES = [CORE];

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

function versionDir(): string {
  return mkdtempSync(join(ROOT, 'versions-'));
}

function writePkg(dir: string, pkg: string, manifest: Record<string, unknown>, files: readonly string[] = []): string {
  const pkgDir = join(dir, 'node_modules', pkg);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, 'package.json'), `${JSON.stringify({ name: pkg, version: VERSION, ...manifest }, null, 2)}\n`);
  for (const file of files) {
    const path = join(pkgDir, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'export const apply = () => undefined;\n');
  }
  return pkgDir;
}

const okProbe: VersionEntryProbe = () => ({ ok: true });

describe('切换前闸：声明了入口就得解析得到，本地副本不查', () => {
  it('条件导出与默认 main 都认：文件在就通过', () => {
    const dir = versionDir();
    writePkg(dir, CORE, { exports: { '.': { import: './dist/host/index.js', default: './dist/host/index.js' } } }, ['dist/host/index.js']);
    const gate = versionGateOf({ versionDir: dir, packages: PACKAGES, probe: okProbe });
    expect(gate.ok).toBe(true);
    expect(gate.entries).toHaveLength(1);

    const mainDir = versionDir();
    writePkg(mainDir, CORE, { main: 'index.js' }, ['index.js']);
    expect(versionGateOf({ versionDir: mainDir, packages: PACKAGES, probe: okProbe }).ok).toBe(true);
  });

  it('★ types 条件不当入口；导出数组第一个不在就取下一个', () => {
    const dir = versionDir();
    writePkg(
      dir,
      CORE,
      { exports: { '.': { types: './dist/types.d.ts', default: './dist/host/index.js' } } },
      ['dist/host/index.js'],
    );
    expect(versionGateOf({ versionDir: dir, packages: PACKAGES, probe: okProbe }).ok).toBe(true);

    const arrayDir = versionDir();
    writePkg(
      arrayDir,
      CORE,
      { exports: { '.': ['./dist/missing.js', './dist/host/index.js'] } },
      ['dist/host/index.js'],
    );
    expect(versionGateOf({ versionDir: arrayDir, packages: PACKAGES, probe: okProbe }).ok).toBe(true);
  });

  it('★ 命中的第一个条件文件缺失：不像数组那样回退到后面的条件', () => {
    const dir = versionDir();
    writePkg(
      dir,
      CORE,
      { exports: { '.': { import: './dist/missing.js', default: './dist/host/index.js' } } },
      ['dist/host/index.js'],
    );
    const gate = versionGateOf({ versionDir: dir, packages: PACKAGES, probe: okProbe });
    expect(gate.ok).toBe(false);
    expect(gate.violations.join('')).toContain('入口解析不到');
  });

  it('★ exports 没有根入口：不回退 main，直接不通过', () => {
    const dir = versionDir();
    writePkg(dir, CORE, { exports: { './client': './client.js' }, main: 'index.js' }, ['index.js']);
    const gate = versionGateOf({ versionDir: dir, packages: PACKAGES, probe: okProbe });
    expect(gate.ok).toBe(false);
    expect(gate.violations.join('')).toContain('没有根入口');
  });

  it('声明了入口但文件不在 → 不通过', () => {
    const dir = versionDir();
    writePkg(dir, CORE, { main: 'dist/host/index.js' });
    const gate = versionGateOf({ versionDir: dir, packages: PACKAGES, probe: okProbe });
    expect(gate.ok).toBe(false);
    expect(gate.violations.join('')).toContain('入口解析不到');
  });

  it('没声明入口的包不强制要求产物', () => {
    const dir = versionDir();
    writePkg(dir, CORE, {});
    expect(versionGateOf({ versionDir: dir, packages: PACKAGES, probe: okProbe }).ok).toBe(true);
  });

  it('本地开发副本（链接）跳过产物检查', () => {
    const dir = versionDir();
    const dev = mkdtempSync(join(ROOT, 'dev-'));
    writeFileSync(join(dev, 'package.json'), JSON.stringify({ name: CORE, version: VERSION }), 'utf8');
    mkdirSync(join(dir, 'node_modules', '@dsh-workbench'), { recursive: true });
    symlinkSync(dev, join(dir, 'node_modules', CORE));
    expect(versionGateOf({ versionDir: dir, packages: PACKAGES, probe: okProbe }).ok).toBe(true);
  });

  it('隔离入口加载失败 → 不通过', () => {
    const dir = versionDir();
    writePkg(dir, CORE, { main: 'index.js' }, ['index.js']);
    const gate = versionGateOf({
      versionDir: dir,
      packages: PACKAGES,
      probe: () => ({ ok: false, detail: 'SyntaxError: Unexpected token' }),
    });
    expect(gate.ok).toBe(false);
    expect(gate.violations.join('')).toContain('宿主入口加载不了');
  });

  it('★ 真子进程加载：能 import 的入口通过，语法错误不通过', () => {
    const dir = versionDir();
    const pkgDir = writePkg(dir, CORE, { main: 'index.js' }, ['index.js']);
    expect(probeEntry({ file: join(pkgDir, 'index.js'), versionDir: dir }).ok).toBe(true);

    writeFileSync(join(pkgDir, 'bad.js'), 'export const = ;\n', 'utf8');
    expect(probeEntry({ file: join(pkgDir, 'bad.js'), versionDir: dir }).ok).toBe(false);
  });
});

describe('切换前闸：dsh 兼容判定随计划一起走', () => {
  it('engines.dsh 高于当前 dsh → 不兼容；拿不到 dsh 版本 → 未知', () => {
    const dir = versionDir();
    writePkg(dir, CORE, { engines: { dsh: '>=0.2.2-rc.2' } });
    const known = versionGateOf({ versionDir: dir, packages: PACKAGES, dshVersion: '0.2.2-rc.1', probe: okProbe });
    expect(known.compatibility).toMatchObject({ verdict: 'incompatible' });
    const unknown = versionGateOf({ versionDir: dir, packages: PACKAGES, probe: okProbe });
    expect(unknown.compatibility).toMatchObject({ verdict: 'unknown', reason: 'missing-dsh-version' });
  });
});

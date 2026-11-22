import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bundledPnpmOf, profilePnpmCommand } from '../pnpm-command.js';

const roots: string[] = [];

function profileWith(modules: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-pnpm-command-'));
  roots.push(dir);
  if (modules !== null) {
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', '.modules.yaml'), modules, 'utf8');
  }
  return dir;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('模块安装用哪个 pnpm：跟 profile 当初装它的是同一个版本', () => {
  it('★ .modules.yaml 里记着 pnpm@11.21.0，corepack 缓存里有这个版本 → 直接用缓存里的 pnpm.cjs（不联网）', () => {
    const dir = profileWith('packageManager: pnpm@11.21.0\nstoreDir: /Users/x/Library/pnpm/store/v11\n');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-corepack-'));
    roots.push(home);
    const cached = path.join(home, 'v1', 'pnpm', '11.21.0', 'bin', 'pnpm.cjs');
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    fs.writeFileSync(cached, '', 'utf8');

    expect(profilePnpmCommand(dir, { COREPACK_HOME: home })).toEqual({
      command: process.execPath,
      args: [cached],
      storeDir: '/Users/x/Library/pnpm/store/v11',
    });
  });

  it('缓存里没有那个版本 → 退回 corepack（它自己去取）', () => {
    const dir = profileWith('packageManager: pnpm@11.21.0\n');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-corepack-'));
    roots.push(home);

    expect(profilePnpmCommand(dir, { COREPACK_HOME: home })).toEqual({
      command: 'corepack',
      args: ['pnpm@11.21.0'],
    });
  });

  it('★ profile 记着 pnpm 版本时优先用它（树是那个 pnpm 装的），DSH_WB_PNPM 只兜底', () => {
    const dir = profileWith('packageManager: pnpm@11.21.0\n');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-corepack-empty-'));
    roots.push(home);
    const env = { DSH_WB_PNPM: '/opt/pnpm', COREPACK_HOME: home };

    expect(profilePnpmCommand(dir, env)).toEqual({ command: '/opt/pnpm', args: [] });
  });

  it('★ DSH_WB_PNPM 是已经裹好的整段（preflight 写的）→ 拆回 argv，别把引号当路径的一部分', () => {
    const dir = profileWith(null);

    expect(profilePnpmCommand(dir, { DSH_WB_PNPM: "'/Applications/DeepSeek Harness.app/node' '/x/pnpm.cjs'" })).toEqual({
      command: '/Applications/DeepSeek Harness.app/node',
      args: ['/x/pnpm.cjs'],
    });
    expect(profilePnpmCommand(dir, { DSH_WB_PNPM: "'/Users/ksen/.dsh/workbench/pnpm-10/node_modules/.bin/pnpm'" })).toEqual({
      command: '/Users/ksen/.dsh/workbench/pnpm-10/node_modules/.bin/pnpm',
      args: [],
    });
  });

  it('★ 显式指定时也带上 profile 记的 storeDir（HOME 被改过也不会换 store）', () => {
    const dir = profileWith('storeDir: /Users/x/Library/pnpm/store/v11\n');

    expect(profilePnpmCommand(dir, { DSH_WB_PNPM: "'/opt/pnpm'" })).toEqual({
      command: '/opt/pnpm',
      args: [],
      storeDir: '/Users/x/Library/pnpm/store/v11',
    });
  });

  it('★ 随 node 带的那份 pnpm 只在同一个大版本时才用（Desktop 升级后不乱点）', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-bundled-pnpm-'));
    roots.push(root);
    const bin = path.join(root, 'dependencies');
    const pnpmBin = path.join(bin, 'pnpm', 'bin');
    fs.mkdirSync(pnpmBin, { recursive: true });
    fs.writeFileSync(path.join(pnpmBin, 'pnpm.cjs'), '', 'utf8');
    fs.writeFileSync(path.join(bin, 'pnpm', 'package.json'), JSON.stringify({ version: '11.28.5' }), 'utf8');
    const execPath = path.join(bin, 'node', 'bin', 'node');

    expect(bundledPnpmOf(execPath, '11.21.0')).toBe(path.join(pnpmBin, 'pnpm.cjs'));
    expect(bundledPnpmOf(execPath, '12.0.0')).toBeUndefined();
    expect(bundledPnpmOf(execPath, '')).toBeUndefined();
  });

  it('没有 .modules.yaml → 退回 PATH 上的 pnpm', () => {
    expect(profilePnpmCommand(profileWith(null), {})).toEqual({ command: 'pnpm', args: [] });
  });

  it('yaml 里没有 packageManager → 退回 pnpm，但 storeDir 照带', () => {
    expect(profilePnpmCommand(profileWith('storeDir: /store\n'), {})).toEqual({
      command: 'pnpm',
      args: [],
      storeDir: '/store',
    });
  });
});

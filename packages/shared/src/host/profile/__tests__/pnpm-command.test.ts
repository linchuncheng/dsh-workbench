import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { profilePnpmCommand } from '../pnpm-command.js';

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

  it('DSH_WB_PNPM 显式指定时优先（用于没有 corepack 的机器）', () => {
    const dir = profileWith('packageManager: pnpm@11.21.0\n');

    expect(profilePnpmCommand(dir, { DSH_WB_PNPM: '/opt/pnpm' })).toEqual({ command: '/opt/pnpm', args: [] });
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

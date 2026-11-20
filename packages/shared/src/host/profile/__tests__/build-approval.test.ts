import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { approveBuilds, blockedBuildNames, pendingBuildsOf, recordPendingBuilds } from '../build-approval.js';

const dirs: string[] = [];

function profile(text?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-build-approval-'));
  dirs.push(dir);
  if (text !== undefined) writeFileSync(join(dir, 'pnpm-workspace.yaml'), text, 'utf8');
  return dir;
}

function policyOf(dir: string): string {
  return readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8');
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('从 pnpm 的输出里认出被拦下的构建脚本', () => {
  it('★ 认「Ignored build scripts:」那一列，逗号分隔并去空白', () => {
    expect(blockedBuildNames('...\nIgnored build scripts: sharp, esbuild\n...')).toEqual(['sharp', 'esbuild']);
  });

  it('★ 认 git 依赖那条：pnpm 建议的 allowBuilds key 取出来', () => {
    const output = [
      'ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED  This is a git-hosted package',
      'To allow it, add this to pnpm-workspace.yaml:',
      'allowBuilds:',
      '  github.com/acme/tool: true',
    ].join('\n');
    expect(blockedBuildNames(output)).toEqual(['github.com/acme/tool']);
  });

  it('通配规则与带凭据的 git 地址不记（会漏进 profile 设置）', () => {
    expect(blockedBuildNames('Ignored build scripts: *, @scope/*, sharp')).toEqual(['sharp']);
    const output = 'allowBuilds:\n  https://user:token@git+github.com/acme/t: true';
    expect(blockedBuildNames(output)).toEqual([]);
  });

  it('没有这类报告 → 空数组', () => {
    expect(blockedBuildNames('Done in 3.2s')).toEqual([]);
  });
});

describe('把待批写进 profile 的 pnpm-workspace.yaml', () => {
  it('★ 第一次：写占位值，返回待批清单', () => {
    const dir = profile('packages:\n  - .\n');

    expect(recordPendingBuilds(dir, 'Ignored build scripts: sharp')).toEqual(['sharp']);
    expect(policyOf(dir)).toContain('set this to true or false');
    expect(pendingBuildsOf(dir)).toEqual(['sharp']);
  });

  it('★ 再报一次不叠加占位行，已有清单原样保留', () => {
    const dir = profile('allowBuilds:\n  esbuild: true\n');
    recordPendingBuilds(dir, 'Ignored build scripts: sharp');
    const pending = recordPendingBuilds(dir, 'Ignored build scripts: sharp, rollup');

    expect(pending).toEqual(['sharp', 'rollup']);
    expect(policyOf(dir).match(/set this to true or false/g)).toHaveLength(2);
  });

  it('没有报告就一个字节都不写', () => {
    const original = 'packages:\n  - .\n';
    const dir = profile(original);

    expect(recordPendingBuilds(dir, 'Done in 1s')).toEqual([]);
    expect(policyOf(dir)).toBe(original);
  });

  it('文件不存在时按空映射开一份', () => {
    const dir = profile();

    expect(recordPendingBuilds(dir, 'Ignored build scripts: sharp')).toEqual(['sharp']);
    expect(pendingBuildsOf(dir)).toEqual(['sharp']);
  });
});

describe('批准构建', () => {
  it('★ 待批 → 改成 true，之后不再出现在待批里', () => {
    const dir = profile('packages:\n  - .\n');
    recordPendingBuilds(dir, 'Ignored build scripts: sharp');

    approveBuilds(dir, ['sharp']);

    expect(policyOf(dir)).toContain('sharp: true');
    expect(pendingBuildsOf(dir)).toEqual([]);
  });

  it('★ 名字不在待批清单里 → 报错，一个都不写（防手抖批量放行）', () => {
    const dir = profile('allowBuilds:\n  sharp: set this to true or false\n');

    expect(() => approveBuilds(dir, ['sharp', 'typod-name'])).toThrow(/typod-name/);
    expect(policyOf(dir)).toContain('set this to true or false');
  });

  it('空清单什么都不做', () => {
    const dir = profile('allowBuilds:\n  sharp: true\n');
    expect(() => approveBuilds(dir, [])).not.toThrow();
    expect(policyOf(dir)).toContain('sharp: true');
  });
});

describe('坏文件不硬来', () => {
  it('YAML 解析不了 → 抛错（不静默覆盖用户的策略文件）', () => {
    const dir = profile('allowBuilds: [\n');
    expect(() => recordPendingBuilds(dir, 'Ignored build scripts: sharp')).toThrow();
  });

  it('allowBuilds 不是映射 → 抛错', () => {
    const dir = profile('allowBuilds:\n  - sharp\n');
    expect(() => recordPendingBuilds(dir, 'Ignored build scripts: sharp')).toThrow(/allowBuilds/);
  });
});

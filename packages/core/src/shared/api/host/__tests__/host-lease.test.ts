import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { holdHostLease } from '../host-lease';

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-wb-host-lease-'));

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

const leaseFiles = (profileDir: string): readonly string[] => {
  try {
    return readdirSync(join(profileDir, '.dsh-workbench', 'hosts'));
  } catch {
    return [];
  }
};

describe('宿主租约：一个窗口一枚，释放时只删自己那枚', () => {
  it('★ 写一枚租约，释放后目录里不剩文件', () => {
    const profileDir = mkdtempSync(join(ROOT, 'profile-'));
    const problems: string[] = [];
    const release = holdHostLease({ profileDir, profile: 'workbench', version: '1.2.3-beta.3', onProblem: (m) => problems.push(m) });

    expect(leaseFiles(profileDir)).toHaveLength(1);
    release();
    expect(leaseFiles(profileDir)).toHaveLength(0);
    expect(problems).toEqual([]);
  });

  it('profile 目录为空 → 什么都不写，也不报错', () => {
    const problems: string[] = [];
    const release = holdHostLease({ profileDir: null, profile: '', onProblem: (m) => problems.push(m) });
    release();
    expect(problems).toEqual([]);
  });
});

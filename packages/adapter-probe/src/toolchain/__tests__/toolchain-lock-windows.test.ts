import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lockMock = vi.hoisted(() => ({ lock: vi.fn() }));

vi.mock('proper-lockfile', () => ({ default: { lock: lockMock.lock } }));

const { holdToolchainLock } = await import('../../index.js');

function eperm(): Error {
  return Object.assign(new Error("EPERM: operation not permitted, mkdir 'toolchain.lock'"), { code: 'EPERM' });
}

function lockDir(): string {
  return join(mkdtempSync(join(tmpdir(), 'toolchain-lock-win-')), 'toolchain');
}

beforeEach(() => {
  lockMock.lock.mockReset();
});

describe('取锁撞上 Windows 的 EPERM', () => {
  it('★ 锁目录正好在删（mkdir 报 EPERM、stat 也看不到）→ 宽限内接着等，不判权限失败', async () => {
    const dir = lockDir();
    const lockPath = `${dir}.lock`;
    mkdirSync(dir, { recursive: true });
    mkdirSync(lockPath, { recursive: true });
    let attempt = 0;
    lockMock.lock.mockImplementation(async () => {
      attempt += 1;
      if (attempt === 1) throw eperm();
      if (attempt === 2) {
        rmSync(lockPath, { recursive: true, force: true });
        throw eperm();
      }
      if (attempt === 3) throw eperm();
      return async () => undefined;
    });

    const order: string[] = [];
    const value = await holdToolchainLock(
      dir,
      async () => {
        order.push('run');
        return 'ok';
      },
      { pollMs: 5 },
    );

    expect(value).toBe('ok');
    expect(lockMock.lock).toHaveBeenCalledTimes(4);
    expect(order).toEqual(['run']);
  });

  it('★ EPERM 且一直看不到锁目录，过了宽限 → 当真的没权限，照原样抛', async () => {
    const dir = lockDir();
    lockMock.lock.mockImplementation(async () => {
      throw eperm();
    });

    const started = Date.now();
    await expect(
      holdToolchainLock(dir, async () => '不该跑到', { pollMs: 5, absentGraceMs: 40 }),
    ).rejects.toThrow(/EPERM/);
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
    expect(lockMock.lock.mock.calls.length).toBeGreaterThan(1);
  });

  it('锁目录看得见就一直等，宽限只对"看不见"生效', async () => {
    const dir = lockDir();
    const lockPath = `${dir}.lock`;
    mkdirSync(dir, { recursive: true });
    mkdirSync(lockPath, { recursive: true });
    let attempt = 0;
    lockMock.lock.mockImplementation(async () => {
      attempt += 1;
      if (attempt <= 30) throw eperm();
      return async () => undefined;
    });

    await expect(holdToolchainLock(dir, async () => 'ok', { pollMs: 2, absentGraceMs: 10 })).resolves.toBe('ok');
  });
});

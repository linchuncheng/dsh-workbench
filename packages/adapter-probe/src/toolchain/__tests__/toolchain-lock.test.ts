import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { holdToolchainLock, isLockContention } from '../../index.js';

function lockDir(): string {
  return join(mkdtempSync(join(tmpdir(), 'toolchain-lock-')), 'toolchain');
}

describe('holdToolchainLock', () => {
  it('两个持锁者串行，不交叠', async () => {
    const dir = lockDir();
    const order: string[] = [];
    let entered: (() => void) | undefined;
    const inside = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = holdToolchainLock(dir, async () => {
      order.push('a-in');
      entered?.();
      await delay(50);
      order.push('a-out');
      return 'a';
    });
    await inside;
    const second = holdToolchainLock(dir, async () => {
      order.push('b-in');
      order.push('b-out');
      return 'b';
    });
    await expect(Promise.all([first, second])).resolves.toEqual(['a', 'b']);
    expect(order).toEqual(['a-in', 'a-out', 'b-in', 'b-out']);
  });

  it('等不到锁就报错，不假装跑过', async () => {
    const dir = lockDir();
    const release: { current: (() => void) | undefined } = { current: undefined };
    const held = holdToolchainLock(
      dir,
      () =>
        new Promise<void>((resolve) => {
          release.current = resolve;
        }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    await expect(holdToolchainLock(dir, async () => '不该跑到', { waitMs: 10 })).rejects.toThrow();
    release.current?.();
    await held;
  });
});

describe('取锁失败算不算"别人正拿着"', () => {
  it('★ Windows 上撞到已存在的锁目录报的是 EPERM（不是 EEXIST），算争用', () => {
    expect(isLockContention(Object.assign(new Error('EPERM'), { code: 'EPERM' }), true)).toBe(true);
  });

  it('★ 同样是 EPERM，锁目录不在就是真没权限 —— 照原样抛，不假装在等', () => {
    expect(isLockContention(Object.assign(new Error('EPERM'), { code: 'EPERM' }), false)).toBe(false);
  });

  it('proper-lockfile 的 ELOCKED 一直是争用', () => {
    expect(isLockContention(Object.assign(new Error('locked'), { code: 'ELOCKED' }), false)).toBe(true);
  });

  it('别的错（ENOENT / 没 code）不当争用', () => {
    expect(isLockContention(Object.assign(new Error('gone'), { code: 'ENOENT' }), true)).toBe(false);
    expect(isLockContention(new Error('随便什么'), true)).toBe(false);
    expect(isLockContention(null, true)).toBe(false);
  });
});

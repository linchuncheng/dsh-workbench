import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireHostLease,
  acquireUpdateLease,
  activeHostLeases,
  hostLeaseDir,
  readUpdateLease,
  releaseHostLease,
  releaseUpdateLease,
  rewriteUpdateLease,
  updateLeaseFile,
} from '../lease';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-wb-lease-'));
  roots.push(dir);
  return dir;
}

describe('宿主租约：一个窗口一枚，退出只摘自己那枚', () => {
  it('★ 两个窗口各留一枚；释放一个不影响另一个', () => {
    const profileDir = root();
    const first = acquireHostLease({ profileDir, profile: 'workbench', pid: process.pid, token: 'a' });
    const second = acquireHostLease({ profileDir, profile: 'workbench', pid: process.pid, token: 'b' });

    expect(activeHostLeases(profileDir)).toHaveLength(2);
    expect(existsSync(join(hostLeaseDir(profileDir), `${process.pid}-a.json`))).toBe(true);

    first.release();

    expect(activeHostLeases(profileDir)).toHaveLength(1);
    expect(existsSync(second.record.file)).toBe(true);

    second.release();
    expect(activeHostLeases(profileDir)).toHaveLength(0);
  });

  it('★ 进程没了就不算活着；令牌不对不许删别人的', () => {
    const profileDir = root();
    const dead = acquireHostLease({ profileDir, profile: 'workbench', pid: 999_999_999, token: 'dead' });
    expect(activeHostLeases(profileDir)).toHaveLength(0);
    expect(existsSync(dead.record.file)).toBe(false);

    const live = acquireHostLease({ profileDir, profile: 'workbench', pid: process.pid, token: 'live' });
    expect(releaseHostLease({ file: live.record.file, pid: process.pid, token: 'wrong' })).toBe(false);
    expect(existsSync(live.record.file)).toBe(true);

    live.release();
    expect(existsSync(live.record.file)).toBe(false);
  });
});

describe('更新租约：同一个运行时根只许一个更新', () => {
  it('★ 第一个拿到，第二个拿不到；释放后可以再拿', () => {
    const rootDir = root();
    const first = acquireUpdateLease({ root: rootDir, pid: process.pid, token: 'run-1' });
    expect(first).toBeDefined();
    expect(readUpdateLease(rootDir)).toMatchObject({ pid: process.pid, token: 'run-1' });

    expect(acquireUpdateLease({ root: rootDir, pid: process.pid, token: 'run-2' })).toBeUndefined();

    first?.release();
    expect(existsSync(updateLeaseFile(rootDir))).toBe(false);
    expect(acquireUpdateLease({ root: rootDir, pid: process.pid, token: 'run-3' })).toBeDefined();
  });

  it('★ 进程没了但锁还没过期 → 先不抢；过期后由锁目录回收接管', () => {
    const rootDir = root();
    const dead = acquireUpdateLease({ root: rootDir, pid: 999_999_999, token: 'dead' });
    expect(dead).toBeDefined();

    expect(acquireUpdateLease({ root: rootDir, pid: process.pid, token: 'next' })).toBeUndefined();

    const lockDir = `${updateLeaseFile(rootDir)}.d`;
    const old = new Date(Date.now() - 120_000);
    utimesSync(lockDir, old, old);

    const next = acquireUpdateLease({ root: rootDir, pid: process.pid, token: 'next' });
    expect(next?.record.token).toBe('next');
    expect(readUpdateLease(rootDir)?.pid).toBe(process.pid);
    next?.release();
  });

  it('★ 断电留下的空锁目录：过了心跳就回收，刚建的还等一下', () => {
    const rootDir = root();
    const lockDir = `${updateLeaseFile(rootDir)}.d`;
    mkdirSync(lockDir);
    const fresh = new Date(Date.now() - 1_000);
    utimesSync(lockDir, fresh, fresh);
    expect(acquireUpdateLease({ root: rootDir, pid: process.pid, token: 'early' })).toBeUndefined();

    const old = new Date(Date.now() - 6_000);
    utimesSync(lockDir, old, old);
    const lease = acquireUpdateLease({ root: rootDir, pid: process.pid, token: 'after-crash' });
    expect(lease?.record.token).toBe('after-crash');
    lease?.release();
    expect(existsSync(lockDir)).toBe(false);
  });

  it('★ 刚起、还没拿到真实进程号 → 窗口内算忙，窗口外可以接管', () => {
    const rootDir = root();
    const launched = acquireUpdateLease({
      root: rootDir,
      pid: 0,
      token: 'launch',
      startedAt: new Date().toISOString(),
    });
    expect(launched).toBeDefined();
    expect(acquireUpdateLease({ root: rootDir, pid: process.pid, token: 'next' })).toBeUndefined();
    launched?.release();

    writeFileSync(
      updateLeaseFile(rootDir),
      `${JSON.stringify({ pid: 0, token: 'old', startedAt: new Date(Date.now() - 10 * 60_000).toISOString() })}\n`,
      'utf8',
    );
    const next = acquireUpdateLease({ root: rootDir, pid: process.pid, token: 'next' });
    expect(next?.record.token).toBe('next');
    next?.release();
  });

  it('★ startedAt 读不出来算陈旧锁，不会把更新永久堵死', () => {
    const rootDir = root();
    writeFileSync(
      updateLeaseFile(rootDir),
      `${JSON.stringify({ pid: 0, token: 'broken-time', startedAt: 'nonsense' })}\n`,
      'utf8',
    );

    const lease = acquireUpdateLease({ root: rootDir, pid: process.pid, token: 'after-broken-time' });
    expect(lease?.record.token).toBe('after-broken-time');
    lease?.release();
  });

  it('★ runner 把自己的进程号写回去，退出时按令牌释放', () => {
    const rootDir = root();
    const lease = acquireUpdateLease({ root: rootDir, pid: 0, token: 'launch' });
    expect(lease).toBeDefined();

    expect(rewriteUpdateLease({ root: rootDir, token: 'launch', pid: process.pid })).toBe(true);
    expect(readUpdateLease(rootDir)?.pid).toBe(process.pid);
    expect(releaseUpdateLease({ root: rootDir, token: 'wrong', pid: process.pid })).toBe(false);
    expect(releaseUpdateLease({ root: rootDir, token: 'launch', pid: process.pid })).toBe(true);
  });

  it('★ 锁文件损坏：按陈旧锁清掉，不把更新永久堵死', () => {
    const rootDir = root();
    writeFileSync(updateLeaseFile(rootDir), 'half-written', 'utf8');

    const lease = acquireUpdateLease({ root: rootDir, pid: process.pid, token: 'after-corrupt' });

    expect(lease?.record.token).toBe('after-corrupt');
    lease?.release();
  });
});

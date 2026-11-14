import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import dayjs from 'dayjs';
import lockfile from 'proper-lockfile';
import { writeJsonFile } from './fs-write.js';
import { pidAlive } from './process-alive.js';
import { now, nowIso } from './time.js';

export interface HostLeaseInput {
  readonly profileDir: string;
  readonly profile: string;
  readonly version?: string | undefined;
  readonly pid?: number | undefined;
  readonly startedAt?: string | undefined;
  readonly token?: string | undefined;
}

export interface HostLeaseRecord {
  readonly pid: number;
  readonly startedAt: string;
  readonly token: string;
  readonly profile: string;
  readonly version?: string | undefined;
  readonly file: string;
}

export interface HostLeaseHandle {
  readonly record: HostLeaseRecord;
  release(): void;
}

export interface UpdateLeaseInput {
  readonly root: string;
  readonly pid?: number | undefined;
  readonly startedAt?: string | undefined;
  readonly token?: string | undefined;
  readonly kind?: UpdateLeaseKind | undefined;
}

export type UpdateLeaseKind = 'update' | 'reinstall';

export interface UpdateLeaseRecord {
  readonly pid: number;
  readonly startedAt: string;
  readonly token: string;
  readonly file: string;
  readonly kind?: UpdateLeaseKind | undefined;
}

export interface UpdateLeaseHandle {
  readonly record: UpdateLeaseRecord;
  release(): void;
  rewrite(pid: number): boolean;
}

export const UPDATE_LEASE_LAUNCH_MS = 120_000;

/** 有 pid 的更新租约最长认账时间：超过它基本可以断定 pid 被复活进程复用了。 */
export const UPDATE_LEASE_MAX_MS = 6 * 60 * 60 * 1000;

const UPDATE_LEASE_CLOCK_SKEW_MS = 60_000;

export function randomLeaseToken(): string {
  return randomBytes(8).toString('hex');
}

export function hostLeaseDir(profileDir: string): string {
  return join(profileDir, '.dsh-workbench', 'hosts');
}

export function hostLeaseFile(profileDir: string, pid: number, token: string): string {
  return join(hostLeaseDir(profileDir), `${pid}-${token}.json`);
}

export function hostLeaseFiles(profileDir: string): readonly string[] {
  try {
    return readdirSync(hostLeaseDir(profileDir))
      .filter((name) => name.endsWith('.json'))
      .map((name) => join(hostLeaseDir(profileDir), name));
  } catch {
    return [];
  }
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function pidOf(value: unknown, minimum: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum ? value : undefined;
}

function hostRecordOf(file: string, raw: unknown): HostLeaseRecord | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record = raw as Readonly<Record<string, unknown>>;
  const pid = pidOf(record['pid'], 1);
  const startedAt = textOf(record['startedAt']);
  const token = textOf(record['token']);
  const profile = record['profile'];
  if (pid === undefined || startedAt === undefined || token === undefined) return undefined;
  if (typeof profile !== 'string') return undefined;
  const version = record['version'];
  return {
    pid,
    startedAt,
    token,
    profile,
    ...(typeof version === 'string' && version !== '' ? { version } : {}),
    file,
  };
}

export function readHostLease(file: string): HostLeaseRecord | undefined {
  try {
    return hostRecordOf(file, JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return undefined;
  }
}

export function acquireHostLease(input: HostLeaseInput): HostLeaseHandle {
  const startedAt = input.startedAt ?? nowIso();
  const pid = input.pid ?? process.pid;
  mkdirSync(hostLeaseDir(input.profileDir), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = input.token === undefined || input.token === '' ? randomLeaseToken() : input.token;
    const file = hostLeaseFile(input.profileDir, pid, token);
    const body = {
      pid,
      startedAt,
      token,
      profile: input.profile,
      ...(input.version === undefined || input.version === '' ? {} : { version: input.version }),
    };
    try {
      writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
      const record: HostLeaseRecord = { ...body, file };
      return {
        record,
        release: () => {
          releaseHostLease({ file, pid, token });
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error('宿主租约重名，写不进去');
}

export function releaseHostLease(input: {
  readonly file: string;
  readonly pid: number;
  readonly token: string;
}): boolean {
  const record = readHostLease(input.file);
  if (record === undefined) return false;
  if (record.pid !== input.pid || record.token !== input.token) return false;
  try {
    unlinkSync(input.file);
    return true;
  } catch {
    return false;
  }
}

export function activeHostLeases(profileDir: string): readonly HostLeaseRecord[] {
  const found: HostLeaseRecord[] = [];
  for (const file of hostLeaseFiles(profileDir)) {
    const record = readHostLease(file);
    if (record === undefined) continue;
    if (pidAlive(record.pid)) {
      found.push(record);
      continue;
    }
    try {
      unlinkSync(file);
    } catch {
      // 别人先清掉了也一样
    }
  }
  return found.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

export function updateLeaseFile(root: string): string {
  return join(root, 'self-update.lock');
}

export function readUpdateLease(root: string): UpdateLeaseRecord | undefined {
  return leaseRecordAt(updateLeaseFile(root));
}

function leaseRecordAt(file: string): UpdateLeaseRecord | undefined {
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof raw !== 'object' || raw === null) return undefined;
    const record = raw as Readonly<Record<string, unknown>>;
    const pid = pidOf(record['pid'], 0);
    const startedAt = textOf(record['startedAt']);
    const token = textOf(record['token']);
    if (pid === undefined || startedAt === undefined || token === undefined) return undefined;
    const kind = record['kind'];
    return {
      pid,
      startedAt,
      token,
      file,
      ...(kind === 'update' || kind === 'reinstall' ? { kind } : {}),
    };
  } catch {
    return undefined;
  }
}

export function updateLeaseActive(root: string, at: number = now()): boolean {
  const record = readUpdateLease(root);
  if (record === undefined) return false;
  const started = dayjs(record.startedAt).valueOf();
  // 时间读不出来只能当损坏锁清掉，否则会永久卡住更新。
  if (!Number.isFinite(started)) return false;
  const age = at - started;
  if (record.pid > 0) {
    if (!pidAlive(record.pid)) return false;
    // pid 可能被系统复用；超过合理时长就不再认这把锁。
    return age < UPDATE_LEASE_MAX_MS;
  }
  // 时钟往回调得太离谱时也按陈旧处理，避免永久忙。
  if (age < -UPDATE_LEASE_CLOCK_SKEW_MS) return false;
  return age < UPDATE_LEASE_LAUNCH_MS;
}

export function acquireUpdateLease(input: UpdateLeaseInput): UpdateLeaseHandle | undefined {
  mkdirSync(input.root, { recursive: true });
  const startedAt = input.startedAt ?? nowIso();
  const pid = input.pid ?? 0;
  const token = input.token === undefined || input.token === '' ? randomLeaseToken() : input.token;
  const file = updateLeaseFile(input.root);
  let unlock: (() => void) | undefined;
  try {
    // OS 级互斥：proper-lockfile 用目录创建做原子锁，按 mtime 心跳判断陈旧锁。
    unlock = lockfile.lockSync(file, updateLockOptions(file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOCKED') return undefined;
    throw error;
  }
  try {
    const body = {
      pid,
      startedAt,
      token,
      ...(input.kind === undefined ? {} : { kind: input.kind }),
    };
    writeJsonFile(file, body, { fsync: true });
    const record: UpdateLeaseRecord = { ...body, file };
    return {
      record,
      release: () => {
        releaseUpdateLease({ root: input.root, token, pid });
      },
      rewrite: (nextPid: number) => rewriteUpdateLease({ root: input.root, token, pid: nextPid }),
    };
  } catch (error) {
    try {
      unlock();
    } catch {
      // 已经没了
    }
    throw error;
  }
}

const UPDATE_LOCK_STALE_MS = 30_000;

const UPDATE_LOCK_UPDATE_MS = 5_000;

function updateLockOptions(file: string): lockfile.LockOptions {
  return {
    realpath: false,
    stale: UPDATE_LOCK_STALE_MS,
    update: UPDATE_LOCK_UPDATE_MS,
    retries: 0,
    lockfilePath: `${file}.d`,
  };
}

export function rewriteUpdateLease(input: {
  readonly root: string;
  readonly token: string;
  readonly pid: number;
  readonly startedAt?: string | undefined;
}): boolean {
  const record = readUpdateLease(input.root);
  if (record === undefined || record.token !== input.token) return false;
  try {
    writeJsonFile(record.file, {
      pid: input.pid,
      startedAt: input.startedAt ?? record.startedAt,
      token: record.token,
      ...(record.kind === undefined ? {} : { kind: record.kind }),
    });
    return true;
  } catch {
    return false;
  }
}

export function releaseUpdateLease(input: {
  readonly root: string;
  readonly token: string;
  readonly pid?: number | undefined;
}): boolean {
  const record = readUpdateLease(input.root);
  if (record === undefined || record.token !== input.token) return false;
  if (input.pid !== undefined && record.pid !== 0 && record.pid !== input.pid) return false;
  try {
    unlinkSync(record.file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false;
  }
  try {
    lockfile.unlockSync(record.file, { realpath: false, lockfilePath: `${record.file}.d` });
  } catch {
    // 锁目录可能已经被清掉或过期回收
  }
  return true;
}

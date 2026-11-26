import { mkdirSync, statSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { now } from '@dsh-workbench/shared/host';
import lockfile from 'proper-lockfile';

export interface ToolchainLockOptions {
  readonly waitMs?: number | undefined;
  readonly staleMs?: number | undefined;
  readonly pollMs?: number | undefined;
  readonly absentGraceMs?: number | undefined;
}

const DEFAULT_WAIT_MS = 90_000;
const DEFAULT_POLL_MS = 500;
const DEFAULT_ABSENT_GRACE_MS = 2_000;

function codeOf(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : '';
}

function lockedPathOf(dir: string): string {
  return `${dir}.lock`;
}

export function isLockContention(error: unknown, locked: boolean): boolean {
  const code = codeOf(error);
  if (code === 'ELOCKED') return true;
  return (code === 'EPERM' || code === 'EEXIST') && locked;
}

function isTransientLockError(error: unknown): boolean {
  const code = codeOf(error);
  return code === 'EPERM' || code === 'EEXIST';
}

function lockedNow(dir: string): boolean {
  try {
    statSync(lockedPathOf(dir));
    return true;
  } catch {
    return false;
  }
}

async function acquire(
  dir: string,
  stale: number,
  waitMs: number,
  pollMs: number,
  absentGraceMs: number,
): Promise<() => Promise<void>> {
  const deadline = now() + waitMs;
  let absentSince: number | undefined;
  for (;;) {
    try {
      return await lockfile.lock(dir, {
        realpath: false,
        stale,
        update: Math.max(1_000, Math.floor(stale / 4)),
        retries: 0,
      });
    } catch (error) {
      if (isLockContention(error, lockedNow(dir))) {
        absentSince = undefined;
      } else if (isTransientLockError(error)) {
        absentSince ??= now();
        if (now() - absentSince > absentGraceMs) throw error;
      } else {
        throw error;
      }
      if (now() >= deadline) throw error;
      await delay(pollMs);
    }
  }
}

export async function holdToolchainLock<T>(
  dir: string,
  run: () => Promise<T>,
  options: ToolchainLockOptions = {},
): Promise<T> {
  mkdirSync(dir, { recursive: true });
  const release = await acquire(
    dir,
    options.staleMs ?? 120_000,
    options.waitMs ?? DEFAULT_WAIT_MS,
    options.pollMs ?? DEFAULT_POLL_MS,
    options.absentGraceMs ?? DEFAULT_ABSENT_GRACE_MS,
  );
  try {
    return await run();
  } finally {
    await release();
  }
}
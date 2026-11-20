import { mkdirSync, statSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { now } from '@dsh-workbench/shared/host';
import lockfile from 'proper-lockfile';

export interface ToolchainLockOptions {
  readonly waitMs?: number | undefined;
  readonly staleMs?: number | undefined;
  readonly pollMs?: number | undefined;
}

const DEFAULT_WAIT_MS = 90_000;
const DEFAULT_POLL_MS = 500;

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
): Promise<() => Promise<void>> {
  const deadline = now() + waitMs;
  for (;;) {
    try {
      return await lockfile.lock(dir, {
        realpath: false,
        stale,
        update: Math.max(1_000, Math.floor(stale / 4)),
        retries: 0,
      });
    } catch (error) {
      if (!isLockContention(error, lockedNow(dir)) || now() >= deadline) throw error;
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
  );
  try {
    return await run();
  } finally {
    await release();
  }
}

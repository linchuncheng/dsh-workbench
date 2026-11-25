import lockfile from 'proper-lockfile';
import { ensureDir } from '@dsh-workbench/shared/host';

export interface DirLockOptions {
  readonly staleMs?: number | undefined;
  readonly retries?: number | undefined;
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function withDirLockSync<T>(dir: string, run: () => T, options: DirLockOptions = {}): T {
  ensureDir(dir);
  const attempts = options.retries ?? 10;
  let release: (() => void) | undefined;
  for (let index = 0; index < attempts; index += 1) {
    try {
      release = lockfile.lockSync(dir, {
        realpath: true,
        stale: options.staleMs ?? 30_000,
        lockfilePath: `${dir}.lock`,
      });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ELOCKED' || index === attempts - 1) throw error;
      sleepMs(40 + index * 20);
    }
  }
  if (release === undefined) throw new Error(`目录锁等待超时：${dir}`);
  try {
    return run();
  } finally {
    release();
  }
}

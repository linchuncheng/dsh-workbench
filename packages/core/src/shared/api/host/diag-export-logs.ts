import { readFileSync, statSync } from 'node:fs';

export const DIAG_LOG_TAIL_BYTES = 256 * 1024;

export function logTailOf(file: string, maxBytes: number = DIAG_LOG_TAIL_BYTES): string | null {
  let size: number;
  try {
    size = statSync(file).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const start = Math.max(0, size - maxBytes);
  return readFileSync(file).subarray(start).toString('utf8');
}

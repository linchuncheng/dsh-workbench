import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

export function packageVersionOf(root: string): string | null {
  let text: string;
  try {
    text = readFileSync(join(root, 'package.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const version = (JSON.parse(text) as { readonly version?: unknown }).version;
  return typeof version === 'string' ? version : null;
}

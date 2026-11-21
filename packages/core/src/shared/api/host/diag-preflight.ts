import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PREFLIGHT_SNAPSHOT_FILE = 'preflight.json';

export function readPreflightSnapshot(root: string): unknown | null {
  let text: string;
  try {
    text = readFileSync(join(root, PREFLIGHT_SNAPSHOT_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return JSON.parse(text) as unknown;
}

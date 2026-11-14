import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonFile } from './fs-write.js';
import { readJsonObject } from './read-json.js';

export type ReinstallState = 'pending' | 'failed';

export interface ReinstallRecord {
  readonly schema: 1;
  readonly state: ReinstallState;
  readonly profile: string;
  readonly profileDir: string;
  readonly version: string;
  readonly from?: string | undefined;
  readonly reason?: string | undefined;
  readonly attempts?: number | undefined;
  readonly at: string;
}

export function reinstallRecordFile(root: string): string {
  return join(root, 'self-update-reinstall.json');
}

export function writeReinstallRecord(file: string, record: ReinstallRecord): void {
  writeJsonFile(file, record);
}

export function clearReinstallRecord(file: string): void {
  try {
    unlinkSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export function readReinstallRecord(file: string): ReinstallRecord | undefined {
  const record = readJsonObject(file);
  if (record === undefined) return undefined;
  if (record['schema'] !== 1) return undefined;
  const state = record['state'];
  const profile = textOf(record['profile']);
  const profileDir = textOf(record['profileDir']);
  const version = textOf(record['version']);
  const at = textOf(record['at']);
  if (state !== 'pending' && state !== 'failed') return undefined;
  if (profile === undefined || profileDir === undefined || version === undefined || at === undefined) return undefined;
  const from = textOf(record['from']);
  const reason = textOf(record['reason']);
  const attempts = typeof record['attempts'] === 'number' && Number.isInteger(record['attempts']) && record['attempts'] >= 0
    ? record['attempts']
    : undefined;
  return {
    schema: 1,
    state,
    profile,
    profileDir,
    version,
    at,
    ...(from === undefined ? {} : { from }),
    ...(reason === undefined ? {} : { reason }),
    ...(attempts === undefined ? {} : { attempts }),
  };
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

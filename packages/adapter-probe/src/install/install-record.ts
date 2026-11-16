import { dirname, join } from 'node:path';
import { readJsonObject, writeJsonFile } from '@dsh-workbench/shared/host';

export interface InstallRecord {
  readonly schema: 1;
  readonly dir: string;
  readonly pin: string;
  readonly at: string;
}

export function installRecordFile(toolchain: string): string {
  return join(dirname(toolchain), 'install-record.json');
}

export function writeInstallRecord(file: string, record: InstallRecord): void {
  writeJsonFile(file, record);
}

export function recordInstall(toolchain: string, pin: string, at: string): void {
  try {
    writeInstallRecord(installRecordFile(toolchain), { schema: 1, dir: toolchain, pin, at });
  } catch {
    return;
  }
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function readInstallRecord(file: string): InstallRecord | undefined {
  const record = readJsonObject(file);
  if (record === undefined || record['schema'] !== 1) return undefined;
  const dir = textOf(record['dir']);
  const pin = textOf(record['pin']);
  const at = textOf(record['at']);
  if (dir === undefined || pin === undefined || at === undefined) return undefined;
  return { schema: 1, dir, pin, at };
}

export function describeInstallRecord(record: InstallRecord, live: string, pin: string): string {
  if (record.dir !== live) return `上次装到 ${record.dir}，这次看的是 ${live}`;
  if (record.pin !== pin) return `上次装的是 ${record.pin}，这次要 ${pin}`;
  return `上次装好是 ${record.at}，现在读不到`;
}

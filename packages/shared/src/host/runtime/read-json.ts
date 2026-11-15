import { readFileSync } from 'node:fs';

export function readJsonObject(file: string): Readonly<Record<string, unknown>> | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
  return typeof raw === 'object' && raw !== null ? (raw as Readonly<Record<string, unknown>>) : undefined;
}

import { existsSync, readFileSync } from 'node:fs';

export function jsonAt(file: string): Readonly<Record<string, unknown>> | undefined {
  if (!existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Readonly<Record<string, unknown>>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

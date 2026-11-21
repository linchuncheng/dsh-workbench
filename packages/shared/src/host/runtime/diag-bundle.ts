import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { basename } from 'node:path';
import { writeTextFile } from './fs-write.js';
import type { DiagRecord } from './diag-records.js';

export const DIAG_BUNDLE_SCHEMA = 1;
export const DIAG_BUNDLE_MAX_BYTES = 8 * 1024 * 1024;
const SECRET_KEY = /token|secret|password|passwd|auth|api[-_]?key|credential/i;
const ABSOLUTE = /(^|["'\s])((?:\/|[A-Za-z]:\\)[^"'\s]*)/g;

export interface DiagBundleInput {
  readonly at: string;
  readonly env: Readonly<Record<string, unknown>>;
  readonly config: Readonly<Record<string, unknown>>;
  readonly runtime: Readonly<Record<string, unknown>>;
  readonly records: readonly DiagRecord[];
  readonly checks: Readonly<Record<string, unknown>>;
  readonly maxBytes?: number | undefined;
}

export interface DiagBundle {
  readonly files: Readonly<Record<string, string>>;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly truncated: readonly string[];
}

function shortenPath(hit: string): string {
  const name = basename(hit.replace(/["'\s]+$/, ''));
  const digest = createHash('sha1').update(hit).digest('hex').slice(0, 6);
  return `<path:${name}:${digest}>`;
}

export function redactText(text: string): string {
  return text.replace(ABSOLUTE, (_all, lead: string, hit: string) => `${lead}${shortenPath(hit)}`);
}

export function redact(value: unknown): unknown {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map((one) => redact(one));
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) continue;
    out[key] = redact(inner);
  }
  return out;
}

function sizeOf(files: Readonly<Record<string, string>>): number {
  return Object.values(files).reduce((sum, text) => sum + Buffer.byteLength(text), 0);
}

export function buildDiagBundle(input: DiagBundleInput): DiagBundle {
  const max = input.maxBytes ?? DIAG_BUNDLE_MAX_BYTES;
  const truncated: string[] = [];
  let records = [...input.records];
  const runtime = { ...input.runtime };
  const fixed = {
    'env.json': JSON.stringify(redact(input.env), null, 2),
    'config.json': JSON.stringify(redact(input.config), null, 2),
    'checks.json': JSON.stringify(redact(input.checks), null, 2),
    'records.jsonl': '',
    'runtime.json': '',
  };
  const compose = (): Record<string, string> => ({
    ...fixed,
    'records.jsonl': records.map((one) => JSON.stringify(redact(one))).join('\n'),
    'runtime.json': JSON.stringify(redact(runtime), null, 2),
  });
  while (sizeOf(compose()) > max && records.length > 0) {
    records = records.slice(Math.ceil(records.length / 2));
    if (!truncated.includes('records')) truncated.push('records');
  }
  if (sizeOf(compose()) > max && 'logs' in runtime) {
    runtime['logs'] = [];
    truncated.push('runtime.logs');
  }
  if (sizeOf(compose()) > max && 'panels' in runtime) {
    runtime['panels'] = [];
    truncated.push('runtime.panels');
  }
  const files = compose();
  const manifest = {
    schema: DIAG_BUNDLE_SCHEMA,
    at: input.at,
    bytes: sizeOf(files),
    truncated,
    files: Object.keys({ ...files, 'manifest.json': '' }).sort(),
  };
  return {
    files: { ...files, 'manifest.json': JSON.stringify(manifest, null, 2) },
    manifest,
    truncated,
  };
}

export function diagBundleDir(root: string, at: string): string {
  const stamp = at.replace(/[:.]/g, '-');
  return join(root, 'diagnostics', stamp);
}

export function writeDiagBundle(root: string, at: string, bundle: DiagBundle): string {
  const dir = diagBundleDir(root, at);
  for (const [name, text] of Object.entries(bundle.files)) writeTextFile(join(dir, name), text);
  return dir;
}

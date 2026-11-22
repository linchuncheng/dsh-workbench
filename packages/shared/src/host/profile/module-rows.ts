import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSeq, parseDocument } from 'yaml';
import { nestedIdsOf, spannedBlocks } from '../patch/patch-blocks.js';

export interface ModuleRow {
  readonly id: string;
  readonly name: string;
}

export interface ModuleRowSource {
  readonly unit: string;
  readonly pkg: string;
  readonly shipsBundle?: boolean | undefined;
}

const ROW_PREFIX = 'wb-';

export function moduleRowId(unit: string): string {
  return `${ROW_PREFIX}${unit}`;
}

export function moduleRowsFrom(modules: readonly ModuleRowSource[]): readonly ModuleRow[] {
  return modules
    .filter((module) => module.shipsBundle !== true)
    .map((module) => ({ id: moduleRowId(module.unit), name: module.pkg }));
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

export function moduleRowsIn(text: string): readonly ModuleRow[] {
  const document = parseDocument(text, { logLevel: 'silent' });
  if (document.errors.length > 0) {
    throw new Error(`cordis.patch.yml 无法解析：${document.errors[0]?.message ?? '原因不明'}`);
  }
  const raw: unknown = document.toJS();
  const items = Array.isArray(raw) ? (raw as unknown[]) : [];
  const rows: ModuleRow[] = [];
  for (const item of items) {
    const insert = asRecord(item)?.['insert'];
    if (!Array.isArray(insert)) continue;
    for (const nested of insert) {
      const row = asRecord(nested);
      const id = row?.['id'];
      const name = row?.['name'];
      if (typeof id !== 'string' || typeof name !== 'string' || !id.startsWith(ROW_PREFIX)) continue;
      rows.push({ id, name });
    }
  }
  return rows;
}

function rowLines(rows: readonly ModuleRow[]): readonly string[] {
  return [
    '- insert:',
    ...rows.flatMap((row) => [`    - id: ${row.id}`, `      name: '${row.name}'`]),
  ];
}

function emptyFlowSequenceRange(text: string): { readonly from: number; readonly to: number } | undefined {
  const document = parseDocument(text, { logLevel: 'silent' });
  if (document.errors.length > 0) return undefined;
  const contents = document.contents;
  if (contents === null || !isSeq(contents) || contents.items.length > 0) return undefined;
  const range = contents.range;
  if (range === null || range === undefined) return undefined;
  return { from: range[0], to: range[1] };
}

export function withModuleRows(text: string, rows: readonly ModuleRow[]): string {
  const lines = text.split('\n');
  const blocks = spannedBlocks(text);
  const ours = blocks.filter((block) => {
    const ids = nestedIdsOf(block.body);
    return ids.length > 0 && ids.every((id) => id.startsWith(ROW_PREFIX));
  });
  const foreign = new Set(
    blocks
      .filter((block) => !ours.includes(block))
      .flatMap((block) => nestedIdsOf(block.body).filter((id) => id.startsWith(ROW_PREFIX))),
  );
  const desired = rows.filter((row) => !foreign.has(row.id));
  const replacement = desired.length === 0 ? [] : [...rowLines(desired)];
  if (ours.length === 0) {
    if (desired.length === 0) return text;
    const emptyRoot = emptyFlowSequenceRange(text);
    if (emptyRoot !== undefined) {
      return `${text.slice(0, emptyRoot.from)}${replacement.join('\n')}\n${text.slice(emptyRoot.to)}`;
    }
    const base = text === '' || text.endsWith('\n') ? text : `${text}\n`;
    const gap = base === '' || base.endsWith('\n\n') ? '' : '\n';
    return `${base}${gap}${replacement.join('\n')}\n`;
  }
  const output: string[] = [];
  let cursor = 0;
  for (const block of ours) {
    output.push(...lines.slice(cursor, block.from));
    if (block === ours[0]) output.push(...replacement);
    cursor = block.to;
  }
  output.push(...lines.slice(cursor));
  const first = output.findIndex((line) => line.trim() !== '');
  const kept = first === -1 ? [] : output.slice(first);
  const joined = kept.join('\n');
  return joined === '' ? '' : joined.endsWith('\n') ? joined : `${joined}\n`;
}

export function hasModuleRow(profileDir: string, pkg: string): boolean {
  const file = join(profileDir, 'cordis.patch.yml');
  if (!existsSync(file)) return false;
  try {
    return moduleRowsIn(readFileSync(file, 'utf8')).some((row) => row.name === pkg);
  } catch {
    return false;
  }
}

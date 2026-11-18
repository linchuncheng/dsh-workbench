import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isScalar, isSeq, parseDocument } from 'yaml';

import { writeTextFile } from '../runtime/fs-write.js';
import { PnpmConfigError } from './pnpm-workspace.js';
import { RELEASE_PACKAGES } from './release-packages.generated.js';

export interface ReleaseAgeInput {
  readonly dir: string;
  readonly packages?: readonly string[] | undefined;
}

interface ExcludeWant {
  readonly match: string;
  readonly entry: string;
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

function scalarValue(node: unknown): string | undefined {
  return isScalar(node) && typeof node.value === 'string' ? node.value : undefined;
}

function versionListed(value: string, version: string): boolean {
  return value.split('||').some((part) => part.trim().replace(/^.*@/u, '').trim() === version);
}

function quoted(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

function applyEdits(text: string, edits: readonly Edit[]): string {
  return [...edits]
    .sort((left, right) => right.start - left.start)
    .reduce((next, edit) => `${next.slice(0, edit.start)}${edit.text}${next.slice(edit.end)}`, text);
}

function lineIndentOf(text: string, offset: number): string {
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/u.exec(text.slice(start, offset))?.[0] ?? '';
}

function lineEndOf(text: string, offset: number): { readonly at: number; readonly eol: string } {
  const at = text.indexOf('\n', offset);
  if (at === -1) return { at: text.length, eol: '\n' };
  return text[at - 1] === '\r' ? { at: at - 1, eol: '\r\n' } : { at, eol: '\n' };
}

function mergedValues(values: readonly string[], wants: readonly ExcludeWant[]): readonly string[] {
  const out = [...values];
  for (const want of wants) {
    const exact = want.entry === want.match;
    if (exact) {
      if (!out.includes(want.match)) out.push(want.entry);
      continue;
    }
    const at = out.findIndex((value) => value.startsWith(`${want.match}@`));
    const version = want.entry.slice(want.match.length + 1);
    if (at < 0) {
      if (!out.includes(want.entry)) out.push(want.entry);
      continue;
    }
    if (!versionListed(out[at] ?? '', version)) out[at] = `${out[at]} || ${version}`;
  }
  return out;
}

function appendMissing(text: string, wants: readonly ExcludeWant[]): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const base = text.replace(/\s+$/u, '');
  const lines = wants.map((want) => `${eol}  - ${quoted(want.entry)}`).join('');
  return `${base}${base === '' ? '' : eol}${eol}minimumReleaseAgeExclude:${lines}${eol}`;
}

function fillEmptyKey(text: string, wants: readonly ExcludeWant[]): string {
  const match = /^([ \t]*)minimumReleaseAgeExclude:[ \t]*$/mu.exec(text);
  if (match === null) {
    throw new PnpmConfigError('unsupported-shape', 'minimumReleaseAgeExclude 只能写成块列表或空键');
  }
  const indent = `${match[1] ?? ''}  `;
  const end = lineEndOf(text, match.index + match[0].length);
  const lines = wants.map((want) => `${end.eol}${indent}- ${quoted(want.entry)}`).join('');
  return `${text.slice(0, end.at)}${lines}${text.slice(end.at)}`;
}

function appendExcludes(text: string, wants: readonly ExcludeWant[]): string {
  const document = parseDocument(text);
  if (document.errors.length > 0) {
    throw new PnpmConfigError(
      'unparsable',
      `pnpm-workspace.yaml 解析不了：${document.errors[0]?.message ?? '原因不明'}`,
    );
  }
  if (wants.length === 0) return text;
  if (!document.has('minimumReleaseAgeExclude')) return appendMissing(text, wants);
  const node = document.get('minimumReleaseAgeExclude', true);
  if (node === null || node === undefined) return fillEmptyKey(text, wants);
  if (!isSeq(node) || node.range === null) {
    throw new PnpmConfigError('unsupported-shape', 'minimumReleaseAgeExclude 只能写成块列表，不能是字符串或映射');
  }
  const values = node.items.map(scalarValue).filter((value): value is string => value !== undefined);
  if (node.flow) {
    const indent = `${lineIndentOf(text, node.range[0])}  `;
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = mergedValues(values, wants).map((value) => `${eol}${indent}- ${quoted(value)}`).join('');
    return `${text.slice(0, node.range[0])}${lines}${text.slice(node.range[1])}`;
  }
  const edits: Edit[] = [];
  const missing: string[] = [];
  for (const want of wants) {
    const exact = want.entry === want.match;
    const found = node.items.find((item) => {
      const value = scalarValue(item);
      return value !== undefined && (exact ? value === want.match : value.startsWith(`${want.match}@`));
    });
    if (found === undefined) {
      if (!missing.includes(want.entry)) missing.push(want.entry);
      continue;
    }
    if (exact) continue;
    if (found.range === null) continue;
    const value = scalarValue(found) ?? '';
    const version = want.entry.slice(want.match.length + 1);
    if (versionListed(value, version)) continue;
    const raw = text.slice(found.range[0], found.range[1]);
    const quote = raw.startsWith('"') ? '"' : "'";
    const inner = raw.replace(/^['"]/u, '').replace(/['"]$/u, '');
    edits.push({ start: found.range[0], end: found.range[1], text: `${quote}${inner} || ${version}${quote}` });
  }
  const last = node.items[node.items.length - 1];
  if (missing.length > 0 && last !== undefined && last.range !== null) {
    const indent = lineIndentOf(text, last.range[0]);
    const end = lineEndOf(text, last.range[1]);
    const lines = missing.map((entry) => `${end.eol}${indent}- ${quoted(entry)}`).join('');
    edits.push({ start: end.at, end: end.at, text: lines });
  }
  if (edits.length === 0) return text;
  return applyEdits(text, edits);
}

/**
 * 把版本补进 `minimumReleaseAgeExclude` 名单：缺哪个包补哪个包，已有的条目不动，别的键原样保留。
 * @param version 要放行的版本号。
 * @param packages 要放行的包名。
 * @param workspace 现有的 pnpm-workspace.yaml 文本。
 */
export function withReleaseAge(version: string, packages: readonly string[], workspace: string): string {
  return appendExcludes(
    workspace,
    packages.map((name) => ({ match: name, entry: `${name}@${version}` })),
  );
}

export function releaseAgeFileOf(dir: string): string {
  return join(dir, 'pnpm-workspace.yaml');
}

function scopePatternsOf(packages: readonly string[]): readonly string[] {
  const patterns = packages.map((name) => (name.startsWith('@') ? `${name.split('/')[0] ?? name}/*` : name));
  return [...new Set(patterns)];
}

/**
 * 把整个 scope 补进 `minimumReleaseAgeExclude`：同一个 scope 里以后发多少版都不用再跟着改。
 * @param patterns 包名或 scope 通配（`@scope/*`）。
 * @param workspace 现有的 pnpm-workspace.yaml 文本。
 */
export function withReleaseAgeScopes(patterns: readonly string[], workspace: string): string {
  const wanted = [...new Set(patterns)];
  return appendExcludes(
    workspace,
    wanted.map((pattern) => ({ match: pattern, entry: pattern })),
  );
}

/**
 * 让 profile 自己的 pnpm-workspace.yaml 放行工作台这一族包（按 scope 通配）；文件不存在就不碰，读不了/写不了也不抛。
 * @param input profile 目录，以及要放行的包（默认整份发布清单）。
 * @returns 真的写了文件才为 `true`。
 */
export function ensureReleaseAge(input: ReleaseAgeInput): boolean {
  const packages = input.packages ?? RELEASE_PACKAGES;
  const file = releaseAgeFileOf(input.dir);
  let before: string;
  try {
    before = readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  let after: string;
  try {
    after = withReleaseAgeScopes(scopePatternsOf(packages), before);
  } catch {
    return false;
  }
  if (after === before) return false;
  try {
    writeTextFile(file, after);
    return true;
  } catch {
    return false;
  }
}

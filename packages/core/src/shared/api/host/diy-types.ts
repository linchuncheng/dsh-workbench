import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { depthOf } from './diy-lines';

const TYPE_DECL = /^\s*export\s+(?:declare\s+)?(?:interface|type|class)\s+([A-Za-z_$][\w$]*)\b/;
const BARRELS = ['host.ts', 'index.ts', 'testing.ts'] as const;

export interface PublicTypeFact {
  readonly name: string;
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

const cache = new Map<string, readonly PublicTypeFact[]>();

function declarationEndOf(lines: readonly string[], start: number): number {
  let depth = 0;
  for (let at = start; at < lines.length; at += 1) {
    depth += depthOf(lines[at]);
    const trimmed = lines[at].trimEnd();
    if (depth <= 0 && (trimmed.endsWith(';') || trimmed.endsWith('}'))) return at;
  }
  return start;
}

function docStartOf(lines: readonly string[], start: number): number {
  if (start === 0 || !lines[start - 1].trimEnd().endsWith('*/')) return start;
  let at = start - 1;
  while (at >= 0 && !lines[at].trimStart().startsWith('/**')) at -= 1;
  return at < 0 ? start : at;
}

function factsOfFile(path: string): readonly PublicTypeFact[] {
  const lines = readFileSync(path, 'utf8').split('\n');
  const facts: PublicTypeFact[] = [];
  for (let at = 0; at < lines.length; at += 1) {
    const match = TYPE_DECL.exec(lines[at]);
    if (match === null) continue;
    const end = declarationEndOf(lines, at);
    const first = docStartOf(lines, at);
    facts.push({
      name: match[1],
      path,
      line: first + 1,
      text: lines.slice(first, end + 1).join('\n').trimEnd(),
    });
    at = end;
  }
  return facts;
}

function resolveTs(fromFile: string, specifier: string): string | null {
  const base = specifier.endsWith('.js') ? specifier.slice(0, -3) : specifier;
  for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const file = join(dirname(fromFile), `${base}${suffix}`);
    if (existsSync(file)) return file;
  }
  return null;
}

function sharedBarrelFiles(coreRoot: string | null): readonly string[] {
  if (coreRoot === null) return [];
  const src = join(coreRoot, '..', 'shared', 'src');
  const out = new Set<string>();
  for (const barrel of BARRELS) {
    const file = join(src, barrel);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/from\s+'(\.[^']+)'/g)) {
      const resolved = resolveTs(file, match[1]);
      if (resolved !== null) out.add(resolved);
    }
  }
  return [...out];
}

export function publicTypeFacts(coreRoot: string | null, kitFiles: readonly string[]): readonly PublicTypeFact[] {
  const key = `${coreRoot ?? ''}\n${kitFiles.join('\n')}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const files = [...sharedBarrelFiles(coreRoot), ...kitFiles.filter((file) => existsSync(file))];
  const facts = files.flatMap(factsOfFile);
  cache.set(key, facts);
  return facts;
}

export function publicTypeOf(
  name: string,
  coreRoot: string | null,
  kitFiles: readonly string[],
): PublicTypeFact | null {
  return publicTypeFacts(coreRoot, kitFiles).find((fact) => fact.name === name) ?? null;
}

export function typeNameIn(text: string): string | null {
  const match = /:\s*([A-Z][A-Za-z0-9_]*)\b/.exec(text);
  return match === null ? null : match[1];
}

export function declaredTypeIn(text: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `\\b(?:function|const|let|var)\\s+${escaped}\\b[\\s\\S]{0,600}?(?:\\bprops\\??\\s*:|\\boptions\\??\\s*:|\\}\\s*:)\\s*([A-Z][A-Za-z0-9_]*)`,
  );
  return pattern.exec(text)?.[1] ?? null;
}

export function renderTypeText(fact: PublicTypeFact): string {
  return [`${fact.name} → ${fact.path}:${String(fact.line)}`, fact.text].join('\n');
}
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UnitMountDeps } from '@dsh-workbench/shared/host';
import { depthOf } from './diy-lines';
import { publicTypeOf, typeNameIn } from './diy-types';
import { skillDirOf } from './diy-surface';

export const DEPS_NAMES = [
  'flow',
  'sessionIdOf',
  'sessionWorkspace',
  'libInstallCommand',
  'surface',
  'seam',
  'ai',
  'drafts',
  'manifest',
  'ctx',
  'logger',
  'manifests',
  'ownedUnits',
  'installable',
  'data',
  'env',
  'libs',
  'git',
  'commands',
  'store',
  'values',
  'probe',
  'longTasks',
  'longTaskRuns',
] as const satisfies readonly (keyof UnitMountDeps)[];

type MissingDep = Exclude<keyof UnitMountDeps, (typeof DEPS_NAMES)[number]>;
const EVERY_DEP_NAMED: MissingDep extends never ? true : never = true;
void EVERY_DEP_NAMED;

const DEP_DECL_FILES = ['host/unit/unit-face', 'host/unit/host-kit'] as const;

export interface DepDeclaration {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

export function isDepName(name: string): boolean {
  return (DEPS_NAMES as readonly string[]).includes(name);
}

function summaryOf(text: string): string {
  const match = /\/\*\*([\s\S]*?)\*\//.exec(text);
  if (match === null) return (text.split('\n')[0] ?? '').trim();
  const lines = match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim())
    .filter((line) => line !== '');
  return (lines[0] ?? '').replace(/。$/, '');
}

export function coreRootOf(skillDir: string | null): string | null {
  return skillDir === null ? null : dirname(dirname(skillDir));
}

export function surfaceCoreRoot(): string | null {
  return coreRootOf(skillDirOf(dirname(fileURLToPath(import.meta.url))));
}

export function depDeclarationFiles(coreRoot: string | null): readonly string[] {
  if (coreRoot === null) return [];
  const found = DEP_DECL_FILES.map((base) =>
    [
      join(coreRoot, '..', 'shared', 'src', `${base}.ts`),
      join(coreRoot, 'node_modules', '@dsh-workbench', 'shared', 'dist', `${base}.d.ts`),
      join(coreRoot, '..', 'shared', 'dist', `${base}.d.ts`),
    ].find((one) => existsSync(one)),
  );
  return found.filter((one): one is string => one !== undefined);
}

function memberDeclarationOf(lines: readonly string[], name: string): { readonly line: number; readonly text: string } | null {
  const pattern = new RegExp(`^\\s*(?:readonly\\s+)?${name}\\??\\s*:`);
  const start = lines.findIndex((line) => pattern.test(line));
  if (start === -1) return null;
  let end = start;
  let depth = depthOf(lines[start]);
  while (end < lines.length && !(depth <= 0 && lines[end].trimEnd().endsWith(';'))) {
    end += 1;
    if (end < lines.length) depth += depthOf(lines[end]);
  }
  let first = start;
  if (first > 0 && lines[first - 1].trimEnd().endsWith('*/')) {
    let at = first - 1;
    while (at >= 0 && !lines[at].trimStart().startsWith('/**')) at -= 1;
    if (at >= 0) first = at;
  }
  return { line: first + 1, text: lines.slice(first, end + 1).join('\n').trimEnd() };
}

export function depDeclarationOf(name: string, coreRoot: string | null): DepDeclaration | null {
  for (const file of depDeclarationFiles(coreRoot)) {
    const found = memberDeclarationOf(readFileSync(file, 'utf8').split('\n'), name);
    if (found !== null) return { path: file, ...found };
  }
  return null;
}

export function depDeclarationsOf(coreRoot: string | null): readonly (DepDeclaration & { readonly name: string })[] {
  const files = depDeclarationFiles(coreRoot).map((path) => ({ path, lines: readFileSync(path, 'utf8').split('\n') }));
  return DEPS_NAMES.flatMap((name) => {
    for (const file of files) {
      const found = memberDeclarationOf(file.lines, name);
      if (found !== null) return [{ name, path: file.path, ...found }];
    }
    return [];
  });
}

export function renderDepsText(coreRoot: string | null): string {
  const files = depDeclarationFiles(coreRoot);
  const facts = depDeclarationsOf(coreRoot);
  const byName = new Map(facts.map((one) => [one.name, one]));
  return [
    `工作台 deps（UnitMountDeps，${String(DEPS_NAMES.length)} 项）：`,
    files.length === 0 ? '声明：没找到装好的 shared 类型' : `声明：${files.join(' · ')}`,
    ...DEPS_NAMES.map((name) => {
      const found = byName.get(name);
      return `${name}: ${found === undefined ? '（没找到声明）' : summaryOf(found.text)}`;
    }),
  ].join('\n');
}

export function renderDepText(name: string, coreRoot: string | null): string {
  if (!isDepName(name)) {
    return `「${name}」不在工作台 deps 里（${String(DEPS_NAMES.length)} 个成员，scope=deps 看全表）。`;
  }
  const found = depDeclarationOf(name, coreRoot);
  if (found === null) return [name, '（没找到它的声明；这份工作台可能没装 @dsh-workbench/shared）'].join('\n');
  const typeName = typeNameIn(found.text);
  const type = typeName === null ? null : publicTypeOf(typeName, coreRoot, []);
  return [
    `${name} → ${found.path}:${String(found.line)}`,
    found.text,
    ...(type === null ? [] : [`类型：${typeName ?? ''} → ${type.path}:${String(type.line)}`]),
  ].join('\n');
}

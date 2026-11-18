import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { asRecord } from '../../contract/guards.js';
import { join } from 'node:path';

import { globSync } from 'tinyglobby';
import { parse } from 'yaml';

/** 一份 pnpm workspace 声明的解析结果：有没有 `packages`、条目是什么、是不是显式空列表。 */
export interface WorkspaceDeclaration {
  readonly declared: boolean;
  readonly patterns: readonly string[];
  readonly empty: boolean;
}

/** pnpm 配置读不懂时抛它：`unparsable` 是语法坏，`unsupported-shape` 是形状不支持。 */
export class PnpmConfigError extends Error {
  readonly code: 'unparsable' | 'unsupported-shape';

  constructor(code: 'unparsable' | 'unsupported-shape', message: string) {
    super(message);
    this.name = 'PnpmConfigError';
    this.code = code;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function patternsOfList(value: readonly unknown[]): readonly string[] {
  const patterns: string[] = [];
  value.forEach((item, index) => {
    if (typeof item !== 'string') {
      throw new PnpmConfigError('unsupported-shape', `packages[${String(index)}] 不是字符串`);
    }
    const trimmed = item.trim();
    if (trimmed !== '') patterns.push(trimmed);
  });
  return patterns;
}

function manifestOf(root: string): Readonly<Record<string, unknown>> | undefined {
  try {
    return asRecord(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')));
  } catch {
    return undefined;
  }
}

function patternsOfManifest(manifest: Readonly<Record<string, unknown>>): readonly string[] | undefined {
  const workspaces = manifest['workspaces'];
  if (Array.isArray(workspaces)) return patternsOfList(workspaces);
  const nested = asRecord(workspaces)?.['packages'];
  return Array.isArray(nested) ? patternsOfList(nested) : undefined;
}

/** 解析 `pnpm-workspace.yaml` 的文本；没有 `packages` 说没声明，有但读不成列表就抛。 */
export function workspaceDeclarationOf(text: string): WorkspaceDeclaration {
  let document: unknown;
  try {
    document = parse(text);
  } catch (error) {
    throw new PnpmConfigError('unparsable', `pnpm-workspace.yaml 解析不了：${errorText(error)}`);
  }
  const record = asRecord(document);
  if (record === undefined) return { declared: false, patterns: [], empty: false };
  const packages = record['packages'];
  if (packages === undefined) return { declared: false, patterns: [], empty: false };
  if (packages === null) return { declared: true, patterns: [], empty: false };
  if (!Array.isArray(packages)) {
    throw new PnpmConfigError('unsupported-shape', 'pnpm-workspace.yaml 的 packages 要写成列表');
  }
  const patterns = patternsOfList(packages);
  return { declared: true, patterns, empty: patterns.length === 0 };
}

/** 从目录读 workspace 声明：先看 `pnpm-workspace.yaml`，没有再看 `package.json#workspaces`。 */
export function workspaceDeclarationIn(root: string): WorkspaceDeclaration {
  const file = join(root, 'pnpm-workspace.yaml');
  if (existsSync(file)) return workspaceDeclarationOf(readFileSync(file, 'utf8'));
  const manifest = manifestOf(root);
  if (manifest !== undefined) {
    const patterns = patternsOfManifest(manifest);
    if (patterns !== undefined) return { declared: true, patterns, empty: patterns.length === 0 };
  }
  return { declared: false, patterns: [], empty: false };
}

const GLOB_OPTIONS = {
  onlyFiles: false,
  followSymbolicLinks: true,
  absolute: true,
  expandDirectories: false,
  dot: false,
  ignore: ['**/node_modules', '**/node_modules/**'],
};

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function withoutTrailing(path: string): string {
  if (path === '/' || /^[A-Za-z]:[\\/]$/u.test(path)) return path;
  return path.replace(/[\\/]+$/u, '');
}

function inNodeModules(path: string): boolean {
  return path.split(/[\\/]+/u).includes('node_modules');
}

function symlinkDirsOf(root: string, pattern: string): readonly string[] {
  const clean = pattern.replace(/^\.\//u, '').replace(/\/+$/u, '');
  if (!clean.endsWith('/*')) return [];
  const base = join(root, clean.slice(0, -2));
  try {
    return readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isSymbolicLink())
      .map((entry) => join(base, entry.name))
      .filter((dir) => isDirectory(dir) && !inNodeModules(dir));
  } catch {
    return [];
  }
}

function dirsOfPattern(root: string, pattern: string): readonly string[] {
  const clean = pattern.replace(/^\.\//u, '').replace(/\/+$/u, '');
  if (clean === '' || clean === '.') return [root];
  try {
    return [
      ...globSync([clean], { ...GLOB_OPTIONS, cwd: root }).map(withoutTrailing),
      ...symlinkDirsOf(root, clean),
    ]
      .filter((dir) => !inNodeModules(dir) && isDirectory(dir))
      .sort();
  } catch (error) {
    throw new PnpmConfigError(
      'unsupported-shape',
      `工作区 glob 不认这个写法：${pattern}（${errorText(error)}）`,
    );
  }
}

/** 展开 workspace 的包目录：支持 `*` / `**` / `{}` / `!`，按 patterns 顺序返回绝对路径并去重。 */
export function workspaceDirsOf(root: string, patterns: readonly string[]): readonly string[] {
  const positive = patterns.filter((pattern) => !pattern.startsWith('!'));
  const negative = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1));
  const excluded = new Set<string>();
  for (const pattern of negative) {
    for (const dir of dirsOfPattern(root, pattern)) {
      if (existsSync(dir)) excluded.add(realpathSync(dir));
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const pattern of positive) {
    for (const dir of dirsOfPattern(root, pattern)) {
      if (!existsSync(dir)) continue;
      const real = realpathSync(dir);
      if (excluded.has(real) || seen.has(real)) continue;
      seen.add(real);
      out.push(dir);
    }
  }
  return out;
}

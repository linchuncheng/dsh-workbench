import { existsSync, lstatSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execaSync } from 'execa';
import {
  dshCompatibilityOf,
  dshRequirementsOf,
  readJsonObject,
  type DshCompatibility,
  type DshRequirement,
} from '@dsh-workbench/shared/host';
import { SELF_UPDATE_PACKAGES } from './self-update-plan.js';

export type VersionEntryProbe = (input: {
  readonly file: string;
  readonly versionDir: string;
}) => { readonly ok: true } | { readonly ok: false; readonly detail: string };

export interface VersionGateInput {
  readonly versionDir: string;
  readonly packages?: readonly string[] | undefined;
  readonly dshVersion?: string | undefined;
  readonly probe?: VersionEntryProbe | undefined;
}

export interface VersionGateResult {
  readonly ok: boolean;
  readonly violations: readonly string[];
  readonly compatibility: DshCompatibility;
  readonly entries: readonly string[];
}

export function versionGateOf(input: VersionGateInput): VersionGateResult {
  const packages = input.packages ?? SELF_UPDATE_PACKAGES;
  const violations: string[] = [];
  const entries: string[] = [];
  const requirements: DshRequirement[] = [];
  for (const pkg of packages) {
    const pkgDir = join(input.versionDir, 'node_modules', pkg);
    const manifest = readJsonObject(join(pkgDir, 'package.json'));
    if (manifest === undefined) continue;
    requirements.push(...dshRequirementsOf(manifest));
    if (isLinkDir(pkgDir)) continue;
    const declared = declaredEntriesOf(manifest);
    if (declared.length === 0) {
      // 有 exports 却没有根入口：按名字 import 会直接失败，不能静默放行。
      if (manifest['exports'] !== undefined) violations.push(`${pkg} 的 exports 没有根入口`);
      continue;
    }
    const file = firstResolvable(pkgDir, declared);
    if (file === undefined) {
      violations.push(`${pkg} 声明的入口解析不到（${declared.join('、')}）`);
      continue;
    }
    entries.push(file);
  }
  const compatibility = dshCompatibilityOf({
    requirements,
    ...(input.dshVersion === undefined ? {} : { dshVersion: input.dshVersion }),
  });
  if (violations.length === 0) {
    const hostEntry = coreHostEntryOf(input.versionDir);
    if (hostEntry !== undefined) {
      const probe = input.probe ?? probeEntry;
      const result = probe({ file: hostEntry, versionDir: input.versionDir });
      if (!result.ok) violations.push(`新版本宿主入口加载不了：${result.detail}`);
    }
  }
  return { ok: violations.length === 0, violations, compatibility, entries };
}

export const probeEntry: VersionEntryProbe = (input) => {
  const code = [
    `const mod = await import(${JSON.stringify(pathToFileURL(input.file).href)});`,
    `const names = Object.keys(mod ?? {});`,
    `if (names.length === 0) { process.stderr.write("没有导出"); process.exit(2); }`,
  ].join('\n');
  const result = execaSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: input.versionDir,
    timeout: 20_000,
    reject: false,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  if (!result.failed) return { ok: true };
  const detail = `${result.stderr ?? ''}`.trim() || `${result.shortMessage ?? `退出码 ${String(result.exitCode)}`}`;
  return { ok: false, detail };
};

function coreHostEntryOf(versionDir: string): string | undefined {
  const coreDir = join(versionDir, 'node_modules', '@dsh-workbench', 'core');
  if (isLinkDir(coreDir)) return undefined;
  const manifest = readJsonObject(join(coreDir, 'package.json'));
  if (manifest === undefined) return undefined;
  // 与一般的入口声明共用同一套解析，避免“能解析”和“能加载”看的不是同一个文件。
  const declared = declaredEntriesOf(manifest);
  return declared.length === 0 ? undefined : firstResolvable(coreDir, declared);
}

function declaredEntriesOf(manifest: Readonly<Record<string, unknown>>): readonly string[] {
  // 有 exports 时 Node 只认它，不能再回退 main（否则会放行一个按名字 import 不进来的版本）。
  if (manifest['exports'] !== undefined) return entriesOfExports(manifest['exports']);
  const main = stringOf(manifest['main']);
  return main === undefined ? [] : [main];
}

/**
 * 按 Node 的 ESM 条件解析收集候选：对象键按插入顺序，取第一个命中的条件；
 * 数组是回退列表，按顺序取第一个可解析的。`types`/`browser`/子路径键不参与。
 */
function entriesOfExports(value: unknown): readonly string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => [...entriesOfExports(item)]);
  if (typeof value !== 'object' || value === null) return [];
  const record = value as Readonly<Record<string, unknown>>;
  if (record['.'] !== undefined) return entriesOfExports(record['.']);
  for (const [key, entry] of Object.entries(record)) {
    if (key === 'types' || key.startsWith('types@') || key.startsWith('.')) continue;
    if (!ESM_CONDITIONS.has(key)) continue;
    // 命中第一个条件就只认它：Node 不会因为它的文件缺失再退到后面的条件。
    return entriesOfExports(entry);
  }
  return [];
}

const ESM_CONDITIONS: ReadonlySet<string> = new Set(['node', 'import', 'default']);

function firstResolvable(pkgDir: string, entries: readonly string[]): string | undefined {
  for (const entry of entries) {
    const found = resolveEntryFile(pkgDir, entry);
    if (found !== undefined) return found;
  }
  return undefined;
}

function resolveEntryFile(pkgDir: string, entry: string): string | undefined {
  const file = join(pkgDir, entry);
  try {
    if (statSync(file).isDirectory()) {
      const index = join(file, 'index.js');
      return existsSync(index) ? index : undefined;
    }
  } catch {
    // 不存在就继续走下面的解析
  }
  if (existsSync(file)) return file;
  try {
    return createRequire(join(pkgDir, 'package.json')).resolve(entry);
  } catch {
    return undefined;
  }
}

function isLinkDir(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

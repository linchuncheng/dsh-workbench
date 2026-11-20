import fs from 'node:fs';
import path from 'node:path';
export { splitNpmSpec } from '../data/spec.js';
export type { NpmRef } from '../data/spec.js';
import { asRecord } from '../../contract/guards.js';
import { dshRecordOf, packageManifestOf, packageNameOf } from '../unit/local-declaration.js';
import { pluginAt } from './plugin.js';

export type PackageKind = 'runtime-plugin' | 'dsh-bundle' | 'workbench-module' | 'both' | 'neither';

export interface PackageVerdict {
  readonly kind: PackageKind;
  readonly pkg?: string;
  readonly pluginName?: string;
}

/**
 * 按包自己声明的 `dsh` 判它走哪条装载路径：有 `dsh.bundle` 就是组合包；只有 `dsh.workbench.unit`
 * 才是工作台模块（行装载）；两者都没有、或 `dsh.workbench` 里连 unit 都没写，都不算。
 * @param raw - 包 `package.json` 的 `dsh` 段（本地读到的或源上读到的同一份形状）。
 * @returns `dsh-bundle` / `workbench-module`；不像 dsh 扩展包时 `undefined`。
 */
export function dshRouteKindOf(raw: unknown): 'dsh-bundle' | 'workbench-module' | undefined {
  const record = asRecord(raw);
  if (record === undefined) return undefined;
  if ('bundle' in record) return 'dsh-bundle';
  const workbench = asRecord(record['workbench']);
  const unit = workbench?.['unit'];
  return typeof unit === 'string' && unit.trim() !== '' ? 'workbench-module' : undefined;
}

export function isCommandFile(name: string): boolean {
  if (name.endsWith('.d.ts') || name.endsWith('.test.ts')) return false;
  if (name.endsWith('.d.js')) return false;
  return name.endsWith('.ts') || name.endsWith('.js');
}

export function pluginManifestOf(dir: string, manifestFile: string): Readonly<Record<string, unknown>> | undefined {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(dir, manifestFile), 'utf8'));
    if (Array.isArray(parsed)) return undefined;
    return asRecord(parsed);
  } catch {
    return undefined;
  }
}

export function hasCommandFile(dir: string): boolean {
  try {
    return fs.readdirSync(dir).some(isCommandFile);
  } catch {
    return false;
  }
}

export function dshMarkersOf(raw: unknown): boolean {
  return dshRouteKindOf(raw) !== undefined;
}

export function verdictOf(dir: string, manifestFile: string): PackageVerdict | undefined {
  const plugin = pluginAt(dir, manifestFile);
  if (packageManifestOf(dir) === undefined && plugin === undefined) return undefined;
  const route = dshRouteKindOf(dshRecordOf(dir));
  const kind: PackageKind =
    plugin !== undefined && route !== undefined
      ? 'both'
      : plugin !== undefined
        ? 'runtime-plugin'
        : (route ?? 'neither');
  const pkg = packageNameOf(dir);
  return {
    kind,
    ...(pkg === undefined ? {} : { pkg }),
    ...(plugin?.name === undefined ? {} : { pluginName: plugin.name }),
  };
}



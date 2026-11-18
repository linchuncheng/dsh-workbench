import { parse } from 'yaml';
import { asRecord } from '../../contract/guards.js';

/** lockfile 里一条包记录：名字、版本、可选 tarball 与从 tarball 推出来的 registry 根。 */
export interface LockEntry {
  readonly name: string;
  readonly version: string;
  readonly tarball?: string;
  readonly registry?: string;
}

const PACKAGE_NAME = /^(?:@[^/\s]+\/)?[^/\s@]+$/;

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function splitLockKey(key: string): { readonly name: string; readonly version: string } | undefined {
  const base = key.split('(')[0] ?? key;
  if (base.startsWith('/')) {
    const match = /^\/((?:@[^/]+\/)?[^/]+)\/([^/]+)$/u.exec(base);
    const name = match?.[1] ?? '';
    const version = (match?.[2] ?? '').split('_')[0] ?? '';
    return PACKAGE_NAME.test(name) && version !== '' ? { name, version } : undefined;
  }
  const at = base.lastIndexOf('@');
  if (at <= 0) return undefined;
  const name = base.slice(0, at);
  const version = base.slice(at + 1);
  return PACKAGE_NAME.test(name) && version !== '' ? { name, version } : undefined;
}

function registryRootOf(name: string, tarball: string): string | undefined {
  const marker = `/${name}/-/`;
  const at = tarball.indexOf(marker);
  if (at > 0) return tarball.slice(0, at + 1);
  try {
    return `${new URL(tarball).origin}/`;
  } catch {
    return undefined;
  }
}

/** 读 lockfile 的 `packages` 段：兼容 v9 的 `name@version` 与 v6 的 `/name/version`；坏文件给空数组。 */
export function lockEntriesOf(text: string): readonly LockEntry[] {
  let document: unknown;
  try {
    document = parse(text);
  } catch {
    return [];
  }
  const packages = asRecord(asRecord(document)?.['packages']);
  if (packages === undefined) return [];
  const entries = new Map<string, LockEntry>();
  for (const [key, value] of Object.entries(packages)) {
    const split = splitLockKey(key);
    if (split === undefined) continue;
    const resolution = asRecord(asRecord(value)?.['resolution']);
    const tarball = textOf(resolution?.['tarball']);
    const registry = tarball === '' ? undefined : registryRootOf(split.name, tarball);
    const id = `${split.name}@${split.version}`;
    if (entries.has(id)) continue;
    entries.set(id, {
      name: split.name,
      version: split.version,
      ...(tarball === '' ? {} : { tarball }),
      ...(registry === undefined ? {} : { registry }),
    });
  }
  return [...entries.values()];
}

/** 按包名建索引：同一个包有多版时优先留带 registry 的那条，给“这个包从哪装”用。 */
export function lockEntryMapOf(text: string): ReadonlyMap<string, LockEntry> {
  const map = new Map<string, LockEntry>();
  for (const entry of lockEntriesOf(text)) {
    const seen = map.get(entry.name);
    if (seen === undefined || (seen.registry === undefined && entry.registry !== undefined)) {
      map.set(entry.name, entry);
    }
  }
  return map;
}

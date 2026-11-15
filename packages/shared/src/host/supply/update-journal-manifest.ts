import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { copyDirInto, linkDir, removePath, writeJsonFile, writeTextFile } from '../runtime/fs-write.js';
import { readJsonObject } from '../runtime/read-json.js';
import type { UpdateJournalRecord } from './update-journal-types.js';

/** 用 Pick 绑定日志结构，字段增删会变成编译错误而不是静默漂移。 */
export type ManifestRecord = Pick<
  UpdateJournalRecord,
  | 'from'
  | 'to'
  | 'profileDir'
  | 'versionDir'
  | 'manifestPath'
  | 'manifestText'
  | 'manifestDeps'
  | 'links'
  | 'carry'
>;

/**
 * 回滚清单：新日志只回写被接管的几条依赖，避免把等待期间用户/插件新增的依赖整份吞掉。
 * 旧日志没有逐条快照，只能退回整份原文。
 */
export function restoreManifest(record: ManifestRecord): void {
  const deps = record.manifestDeps;
  if (deps === undefined) {
    writeTextFile(record.manifestPath, record.manifestText, { fsync: true });
    return;
  }
  const current = readManifestObject(record);
  const dependencies = { ...(dependenciesOf(current) ?? {}) };
  for (const [pkg, spec] of Object.entries(deps)) {
    if (spec === null) delete dependencies[pkg];
    else dependencies[pkg] = spec;
  }
  writeJsonFile(record.manifestPath, { ...current, dependencies }, { fsync: true });
}

export type LinkFn = (target: string, path: string) => void;

/**
 * 新版已经启动过时按日志前滚：把链接与清单都补成新版，而不是留半截现场。
 *
 * 先整体校验（新版本目录里的包都在、类型可接），再逐条换链；中途失败会尽力把
 * 已经换过的链接按快照退回去，避免留下“一半新版、一半旧版”的现场。
 */
export function rollForward(
  record: ManifestRecord,
  link: LinkFn = linkDir,
): { readonly ok: boolean; readonly detail: string } {
  const failures: string[] = [];
  const planned: { readonly link: UpdateJournalRecord['links'][number]; readonly target: string }[] = [];
  for (const link of record.links) {
    if (link.kind === 'other') {
      failures.push(`${link.pkg}：现场那条既不是链接也不是目录`);
      continue;
    }
    const target = join(record.versionDir, 'node_modules', link.pkg);
    if (!existsSync(target)) {
      failures.push(`${link.pkg}：新版本目录里找不到`);
      continue;
    }
    planned.push({ link, target });
  }
  if (failures.length > 0) return { ok: false, detail: `换新版的链接没补齐（${failures.join('；')}）` };

  const changed: typeof planned = [];
  const specs: Record<string, string> = {};
  for (const item of planned) {
    changed.push(item);
    try {
      link(item.target, item.link.path);
      specs[item.link.pkg] = linkSpecOf(record.profileDir, item.target);
    } catch (error) {
      failures.push(`${item.link.pkg}：${messageOf(error)}`);
      break;
    }
  }
  if (failures.length > 0) {
    for (const item of changed.reverse()) revertLink(record, item.link, link);
    return { ok: false, detail: `换新版的链接没补齐（${failures.join('；')}）` };
  }
  try {
    const current = readJsonObject(record.manifestPath);
    if (current === undefined) throw new Error('清单读不出来');
    const dependencies = { ...(dependenciesOf(current) ?? {}) };
    for (const [pkg, spec] of Object.entries(specs)) dependencies[pkg] = spec;
    writeJsonFile(record.manifestPath, { ...current, dependencies }, { fsync: true });
  } catch (error) {
    for (const item of changed.reverse()) revertLink(record, item.link, link);
    return { ok: false, detail: `换新版的清单没写成（${messageOf(error)}）` };
  }
  return { ok: true, detail: `已经按 ${record.to} 补好链接与清单` };
}

function revertLink(record: ManifestRecord, link: UpdateJournalRecord['links'][number], apply: LinkFn): void {
  try {
    if (link.kind === 'symlink' && link.target !== undefined) {
      apply(resolve(dirname(link.path), link.target), link.path);
      return;
    }
    if (link.kind === 'missing') {
      removePath(link.path);
      return;
    }
    if (link.kind !== 'dir') return;
    const carried = record.carry.find((item) => item.from === link.path);
    if (carried !== undefined && existsSync(carried.to)) {
      copyDirInto(carried.to, link.path);
      return;
    }
    if (record.to === record.from) {
      const target = join(record.versionDir, 'node_modules', link.pkg);
      if (existsSync(target)) apply(target, link.path);
    }
  } catch {
    // 尽力而为：退不回去就保留日志，下次启动还会再试
  }
}

function linkSpecOf(profileDir: string, target: string): string {
  return `link:${relative(profileDir, target).split(sep).join('/')}`;
}

function readManifestObject(record: ManifestRecord): Readonly<Record<string, unknown>> {
  const current = readJsonObject(record.manifestPath);
  if (current !== undefined) return current;
  try {
    const parsed: unknown = JSON.parse(record.manifestText);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Readonly<Record<string, unknown>>;
  } catch {
    // 落到下面统一报错
  }
  throw new Error('清单读不出来');
}

function dependenciesOf(manifest: Readonly<Record<string, unknown>>): Record<string, unknown> | undefined {
  const table = manifest['dependencies'];
  if (typeof table !== 'object' || table === null || Array.isArray(table)) return undefined;
  return { ...(table as Readonly<Record<string, unknown>>) };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { existsSync, lstatSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import dayjs from 'dayjs';
import { readBootRecord } from './boot-record.js';
import { ensureDir, linkDir, moveDir, removePath, writeJsonFile } from './fs-write.js';
import { acquireUpdateLease, updateLeaseActive, type UpdateLeaseHandle } from './lease.js';
import { readJsonObject } from './read-json.js';
import { clearReinstallRecord, readReinstallRecord, reinstallRecordFile } from './reinstall-record.js';
import { restoreManifest, rollForward } from './update-journal-manifest.js';
import {
  UPDATE_JOURNAL_LINK_KINDS,
  UPDATE_JOURNAL_STATES,
  type UpdateJournalCarry,
  type UpdateJournalLink,
  type UpdateJournalLinkKind,
  type UpdateJournalRecord,
  type UpdateJournalState,
} from './update-journal-types.js';

export function updateJournalFile(root: string): string {
  return join(root, 'self-update-journal.json');
}

export function writeUpdateJournal(file: string, record: UpdateJournalRecord): void {
  writeJsonFile(file, record, { fsync: true });
}

export function clearUpdateJournal(file: string): void {
  try {
    unlinkSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export function readUpdateJournal(file: string): UpdateJournalRecord | undefined {
  const raw = readJsonObject(file);
  if (raw === undefined) return undefined;
  return recordOf(raw);
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function countOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function linkOf(value: unknown): UpdateJournalLink | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Readonly<Record<string, unknown>>;
  const pkg = textOf(record['pkg']);
  const path = textOf(record['path']);
  const kind = textOf(record['kind']);
  if (pkg === undefined || path === undefined) return undefined;
  if (kind === undefined || !(UPDATE_JOURNAL_LINK_KINDS as readonly string[]).includes(kind)) return undefined;
  const target = textOf(record['target']);
  return { pkg, path, kind: kind as UpdateJournalLinkKind, ...(target === undefined ? {} : { target }) };
}

function carryOf(value: unknown): UpdateJournalCarry | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Readonly<Record<string, unknown>>;
  const pkg = textOf(record['pkg']);
  const from = textOf(record['from']);
  const to = textOf(record['to']);
  if (pkg === undefined || from === undefined || to === undefined) return undefined;
  return { pkg, from, to };
}

function manifestDepsOf(value: unknown): Readonly<Record<string, string | null>> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const deps: Record<string, string | null> = {};
  for (const [pkg, spec] of Object.entries(value as Readonly<Record<string, unknown>>)) {
    if (typeof spec === 'string') deps[pkg] = spec;
    else if (spec === null) deps[pkg] = null;
    else return undefined;
  }
  return deps;
}

function recordOf(raw: unknown): UpdateJournalRecord | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record = raw as Readonly<Record<string, unknown>>;
  if (record['schema'] !== 1) return undefined;
  const state = textOf(record['state']);
  const from = textOf(record['from']);
  const to = textOf(record['to']);
  const profileDir = textOf(record['profileDir']);
  const versionsDir = textOf(record['versionsDir']);
  const versionDir = textOf(record['versionDir']);
  const manifestPath = textOf(record['manifestPath']);
  const at = textOf(record['at']);
  const cursor = countOf(record['cursor']);
  const carried = countOf(record['carried']);
  if (state === undefined || !(UPDATE_JOURNAL_STATES as readonly string[]).includes(state)) return undefined;
  if (from === undefined || to === undefined) return undefined;
  if (profileDir === undefined || versionsDir === undefined || versionDir === undefined) return undefined;
  if (manifestPath === undefined || at === undefined) return undefined;
  if (typeof record['manifestText'] !== 'string') return undefined;
  if (cursor === undefined || carried === undefined) return undefined;
  if (!Array.isArray(record['links']) || !Array.isArray(record['carry'])) return undefined;
  const links = record['links'].map(linkOf);
  const carry = record['carry'].map(carryOf);
  if (links.some((item) => item === undefined) || carry.some((item) => item === undefined)) return undefined;
  const manifestDeps = manifestDepsOf(record['manifestDeps']);
  if (record['manifestDeps'] !== undefined && manifestDeps === undefined) return undefined;
  const updatedAt = textOf(record['updatedAt']);
  return {
    schema: 1,
    state: state as UpdateJournalState,
    from,
    to,
    profileDir,
    versionsDir,
    versionDir,
    manifestPath,
    manifestText: record['manifestText'],
    ...(manifestDeps === undefined ? {} : { manifestDeps }),
    links: links as readonly UpdateJournalLink[],
    carry: carry as readonly UpdateJournalCarry[],
    cursor,
    carried,
    at,
    ...(updatedAt === undefined ? {} : { updatedAt }),
  };
}

export interface UpdateJournalRestoreInput {
  readonly record: UpdateJournalRecord;
  readonly file: string;
  readonly log?: ((message: string) => void) | undefined;
}

export interface UpdateJournalRestoreResult {
  readonly ok: boolean;
  readonly detail: string;
}

export function restoreUpdateJournal(input: UpdateJournalRestoreInput): UpdateJournalRestoreResult {
  const errors: string[] = [];
  for (const link of [...input.record.links].reverse()) {
    try {
      restoreLink(link, input.record);
    } catch (error) {
      errors.push(`${link.pkg}：${messageOf(error)}`);
    }
  }
  for (const item of [...input.record.carry].reverse()) {
    if (existsSync(item.from) && realDirOf(item.from)) continue;
    try {
      restoreCarry(item);
    } catch (error) {
      errors.push(`${item.pkg}：${messageOf(error)}`);
    }
  }
  if (input.record.state === 'manifest') {
    try {
      restoreManifest(input.record);
    } catch (error) {
      errors.push(`清单：${messageOf(error)}`);
    }
  }
  if (errors.length > 0) {
    const detail = `恢复没完成（${errors.join('；')}），换版现场留着`;
    input.log?.(detail);
    return { ok: false, detail };
  }
  try {
    clearUpdateJournal(input.file);
  } catch (error) {
    return { ok: false, detail: `配置恢复了，但换版日志没清掉：${messageOf(error)}` };
  }
  const detail = `已经回到 ${input.record.from}，链接与清单一致`;
  input.log?.(detail);
  return { ok: true, detail };
}

function restoreLink(link: UpdateJournalLink, record: UpdateJournalRecord): void {
  if (link.kind === 'symlink') {
    if (link.target === undefined) throw new Error('快照里没有原来指向哪');
    linkDir(resolve(dirname(link.path), link.target), link.path);
    return;
  }
  if (link.kind === 'dir') {
    if (realDirOf(link.path)) return;
    removePath(link.path);
    if (record.to === record.from) {
      const target = join(record.versionDir, 'node_modules', link.pkg);
      if (existsSync(target)) linkDir(target, link.path);
    }
    return;
  }
  if (link.kind === 'missing') {
    removePath(link.path);
    return;
  }
  throw new Error('现场那条既不是链接也不是目录');
}

function restoreCarry(item: UpdateJournalCarry): void {
  if (!existsSync(item.to)) throw new Error('搬走的目录找不到了');
  if (existsSync(item.from) && realDirOf(item.from)) return;
  removePath(item.from);
  ensureDir(dirname(item.from));
  moveDir(item.to, item.from);
}

function realDirOf(path: string): boolean {
  try {
    const info = lstatSync(path);
    return info.isSymbolicLink() ? false : info.isDirectory();
  } catch {
    return false;
  }
}

export type UpdateJournalRecovery =
  | { readonly kind: 'none' }
  | { readonly kind: 'cleared'; readonly from: string; readonly to: string; readonly dirty?: true }
  | { readonly kind: 'restored'; readonly from: string; readonly to: string; readonly detail: string }
  | { readonly kind: 'kept'; readonly from: string; readonly to: string; readonly detail: string };

export interface UpdateJournalRecoveryInput {
  readonly file: string;
  readonly bootFile?: string | undefined;
  readonly upFile?: string | undefined;
  readonly markerPath?: string | undefined;
  readonly at?: string | undefined;
  readonly ignoreLease?: boolean | undefined;
  readonly log?: ((message: string) => void) | undefined;
}

export function recoverUpdateJournal(input: UpdateJournalRecoveryInput): UpdateJournalRecovery {
  if (!existsSync(input.file)) return { kind: 'none' };
  const root = dirname(input.file);
  let lease: UpdateLeaseHandle | undefined;
  if (input.ignoreLease !== true) {
    if (updateLeaseActive(root)) return { kind: 'none' };
    try {
      lease = acquireUpdateLease({ root, pid: process.pid });
    } catch (error) {
      input.log?.(`恢复锁没写上，这次先不动现场：${messageOf(error)}`);
      return { kind: 'none' };
    }
    if (lease === undefined) return { kind: 'none' };
  }
  try {
    return recoverLocked(input);
  } finally {
    if (lease !== undefined) {
      try {
        lease.release();
      } catch {
        // 释放失败最多堵一轮，下一轮按陈旧锁接管
      }
    }
  }
}

function recoverLocked(input: UpdateJournalRecoveryInput): UpdateJournalRecovery {
  const record = readUpdateJournal(input.file);
  if (record === undefined) return { kind: 'none' };
  if (record.state === 'committed') {
    try {
      clearUpdateJournal(input.file);
    } catch (error) {
      input.log?.(`换版日志没清掉：${messageOf(error)}`);
      markCommitted(input, record);
      return { kind: 'cleared', from: record.from, to: record.to, dirty: true };
    }
    markCommitted(input, record);
    return { kind: 'cleared', from: record.from, to: record.to };
  }
  if (targetStarted(record, input)) {
    const rolled = rollForward(record);
    if (!rolled.ok) {
      const detail = `新版已经启动过，但${rolled.detail}`;
      markFailed(input, record);
      input.log?.(detail);
      return { kind: 'kept', from: record.from, to: record.to, detail };
    }
    try {
      clearUpdateJournal(input.file);
    } catch (error) {
      input.log?.(`新版已经在跑，但换版日志没清掉：${messageOf(error)}`);
      markCommitted(input, record);
      return { kind: 'cleared', from: record.from, to: record.to, dirty: true };
    }
    markCommitted(input, record);
    input.log?.(rolled.detail);
    return { kind: 'cleared', from: record.from, to: record.to };
  }
  if (!snapshotIntact(record)) {
    const detail = '快照里的旧目录已经不在了，不敢按日志恢复';
    markFailed(input, record);
    input.log?.(detail);
    return { kind: 'kept', from: record.from, to: record.to, detail };
  }
  const restored = restoreUpdateJournal({
    record,
    file: input.file,
    ...(input.log === undefined ? {} : { log: input.log }),
  });
  if (restored.ok) clearRolledBackReinstall(dirname(input.file), record);
  markFailed(input, record);
  return restored.ok
    ? { kind: 'restored', from: record.from, to: record.to, detail: restored.detail }
    : { kind: 'kept', from: record.from, to: record.to, detail: restored.detail };
}

function clearRolledBackReinstall(root: string, record: UpdateJournalRecord): void {
  if (record.to === record.from) return;
  try {
    const file = reinstallRecordFile(root);
    const pending = readReinstallRecord(file);
    if (pending !== undefined && pending.version !== record.to) return;
    clearReinstallRecord(file);
  } catch {
    // 记录没清掉最多多跑一次 install，不影响配置
  }
}

function targetStarted(record: UpdateJournalRecord, input: UpdateJournalRecoveryInput): boolean {
  if (record.to === record.from) return false;
  if (record.state !== 'flipping' && record.state !== 'manifest') return false;
  const since = dayjs(record.at).valueOf();
  for (const file of [input.bootFile, input.upFile]) {
    if (file === undefined) continue;
    const boot = readBootRecord(file);
    if (boot === undefined || boot.version !== record.to) continue;
    const at = dayjs(boot.at).valueOf();
    if (!Number.isFinite(at) || !Number.isFinite(since) || at >= since) return true;
  }
  return false;
}

function snapshotIntact(record: UpdateJournalRecord): boolean {
  for (const link of record.links) {
    if (link.kind === 'symlink') {
      if (link.target === undefined || !existsSync(resolve(dirname(link.path), link.target))) return false;
      continue;
    }
    if (link.kind === 'other') return false;
    if (link.kind !== 'dir') continue;
    if (realDirOf(link.path)) continue;
    const item = record.carry.find((entry) => entry.from === link.path);
    if (item === undefined) {
      if (record.to === record.from && existsSync(join(record.versionDir, 'node_modules', link.pkg))) continue;
      return false;
    }
    if (!existsSync(item.from) && !existsSync(item.to)) return false;
  }
  return true;
}

function markCommitted(input: UpdateJournalRecoveryInput, record: UpdateJournalRecord): void {
  if (markerIsOk(input, record.to)) return;
  writeMarker(input, {
    state: 'pending-restart',
    version: record.to,
    at: input.at ?? new Date().toISOString(),
    phase: 'committed',
    committed: true,
  });
}

function markFailed(input: UpdateJournalRecoveryInput, record: UpdateJournalRecord): void {
  if (markerIsOk(input, record.to)) return;
  const current = readMarker(input);
  if (current?.['state'] === 'failed' && current['version'] === record.from) return;
  writeMarker(input, {
    state: 'failed',
    version: record.from,
    reason: 'incomplete',
    at: input.at ?? new Date().toISOString(),
  });
}

function markerIsOk(input: UpdateJournalRecoveryInput, version: string): boolean {
  const current = readMarker(input);
  return current?.['state'] === 'ok' && current['version'] === version;
}

function readMarker(input: UpdateJournalRecoveryInput): Readonly<Record<string, unknown>> | undefined {
  if (input.markerPath === undefined) return undefined;
  return readJsonObject(input.markerPath);
}

function writeMarker(input: UpdateJournalRecoveryInput, patch: Readonly<Record<string, unknown>>): void {
  if (input.markerPath === undefined) return;
  const base = readJsonObject(input.markerPath) ?? {};
  try {
    writeJsonFile(input.markerPath, { ...base, ...patch });
  } catch {
    return;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

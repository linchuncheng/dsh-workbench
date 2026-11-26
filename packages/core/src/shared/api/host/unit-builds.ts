import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { profileModules } from '@dsh-workbench/shared/host';
import type { UnitApplyRecord } from '@/kernel/host/unit-registry';

export type BuildApplyOutcome =
  | { readonly ran: true; readonly pending?: readonly PendingModule[] | undefined }
  | { readonly ran: false; readonly reason: 'no-hmr' | 'error'; readonly detail?: string | undefined };

export interface PendingModule {
  readonly url: string;
  readonly reason: string;
}

export type ProblemSink = (message: string) => void;

export interface UnitBuildTarget {
  readonly unit: string;
  readonly dir: string;
}

export interface BuildApplierOptions {
  readonly targets: () => readonly UnitBuildTarget[];
  readonly apply: () => Promise<BuildApplyOutcome>;
  readonly record: (unit: string, record: UnitApplyRecord) => void;
  readonly logger?: { warn?(message: string): void } | undefined;
  readonly settleMs?: number | undefined;
  readonly retryMs?: number | undefined;
  readonly now?: (() => number) | undefined;
}

export interface BuildApplier {
  push(unit: string): void;
  dispose(): void;
}

const MAX_RETRIES = 5;

function realDirOf(profileDir: string, pkg: string, reportProblem: ProblemSink): string | undefined {
  const target = join(profileDir, 'node_modules', pkg);
  try {
    return realpathSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      reportProblem(`无法读取模块目录（${target}）：${String(error)}`);
    }
    return undefined;
  }
}

export function installedBuildTargets(
  profileDir: string | null,
  reportProblem: ProblemSink,
): readonly UnitBuildTarget[] {
  if (profileDir === null) return [];
  return profileModules(profileDir).flatMap((row) => {
    const dir = realDirOf(profileDir, row.pkg, reportProblem);
    return dir === undefined ? [] : [{ unit: row.unit, dir }];
  });
}

function insideUnit(dir: string, pending: readonly PendingModule[]): PendingModule | undefined {
  const prefix = `${pathToFileURL(dir).href}/`;
  return pending.find((one) => one.url.startsWith(prefix));
}

export function createBuildApplier(options: BuildApplierOptions): BuildApplier {
  const settleMs = options.settleMs ?? 120;
  const retryMs = options.retryMs ?? 600;
  const now = options.now ?? Date.now;
  const queued = new Set<string>();
  const warned = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let failures = 0;
  let closed = false;

  const schedule = (delayMs: number): void => {
    if (closed) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delayMs);
  };

  const run = async (): Promise<void> => {
    if (closed || running) return;
    const batch = [...queued];
    queued.clear();
    if (batch.length === 0) return;
    running = true;
    const dirs = new Map(options.targets().map((one) => [one.unit, one.dir]));
    const known = batch.filter((unit) => {
      if (dirs.has(unit)) return true;
      if (warned.has(unit)) return false;
      warned.add(unit);
      options.logger?.warn?.(`收到模块 ${unit} 的构建推送，但这份工作台配置没有安装它：忽略`);
      return false;
    });
    if (known.length === 0) {
      running = false;
      if (queued.size > 0) schedule(settleMs);
      return;
    }
    let outcome: BuildApplyOutcome;
    try {
      outcome = await options.apply();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      options.logger?.warn?.(`构建推送的对账未完成：${detail}；稍后重试`);
      outcome = { ran: false, reason: 'error', detail };
    }
    running = false;
    if (closed || known.length === 0) {
      if (queued.size > 0) schedule(settleMs);
      return;
    }
    if (!outcome.ran && outcome.reason === 'error') {
      failures += 1;
      if (failures <= MAX_RETRIES) {
        for (const unit of known) queued.add(unit);
        schedule(retryMs * failures);
      } else {
        failures = 0;
        options.logger?.warn?.(
          `构建推送的对账连续失败，已停止重试：${outcome.detail ?? '原因不明'}；下次构建时重试`,
        );
      }
      return;
    }
    failures = 0;
    const at = now();
    if (!outcome.ran) {
      for (const unit of known) options.record(unit, { at, state: 'unavailable', reason: '这台 dsh 未启用热更新' });
      return;
    }
    const pending = outcome.pending ?? [];
    for (const unit of known) {
      const dir = dirs.get(unit);
      if (dir === undefined) continue;
      const hit = insideUnit(dir, pending);
      options.record(unit, hit === undefined ? { at, state: 'applied' } : { at, state: 'pending', reason: hit.reason });
    }
    if (queued.size > 0) schedule(settleMs);
  };

  return {
    push(unit) {
      if (unit === '') return;
      queued.add(unit);
      schedule(settleMs);
    },
    dispose() {
      closed = true;
      if (timer !== null) clearTimeout(timer);
    },
  };
}

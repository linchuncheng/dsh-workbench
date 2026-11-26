import { readFileSync, readdirSync, statSync, watch } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ID, workbenchRoot, writeTextFile } from '@dsh-workbench/shared/host';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import type { UnitApplyRecord } from '@/kernel/host/unit-registry';
import { createBuildApplier, installedBuildTargets, type BuildApplyOutcome } from './unit-builds';

export const BUILD_PUSH_DIR = 'outbox';

const KEEP_FILE = '.keep';

export interface BuildPush {
  readonly unit: string;
  readonly dir?: string | undefined;
  readonly pkg?: string | undefined;
  readonly at?: string | undefined;
}

export interface BuildPushWatchOptions {
  readonly onPush: (push: BuildPush) => void;
  readonly logger?: { warn?(message: string): void } | undefined;
  readonly settleMs?: number | undefined;
}

function asPush(value: unknown): BuildPush | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const unit = typeof record['unit'] === 'string' ? record['unit'].trim() : '';
  if (unit === '') return undefined;
  return {
    unit,
    ...(typeof record['dir'] === 'string' ? { dir: record['dir'] } : {}),
    ...(typeof record['pkg'] === 'string' ? { pkg: record['pkg'] } : {}),
    ...(typeof record['at'] === 'string' ? { at: record['at'] } : {}),
  };
}

function stampsOf(dir: string, logger: BuildPushWatchOptions['logger']): Map<string, number> {
  const stamps = new Map<string, number>();
  let names: readonly string[];
  try {
    names = readdirSync(dir);
  } catch (error) {
    logger?.warn?.('无法读取构建推送目录 ' + dir + '：' + String(error));
    return stamps;
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      stamps.set(name, statSync(join(dir, name)).mtimeMs);
    } catch (error) {
      logger?.warn?.('无法读取构建推送状态 ' + name + '：' + String(error));
    }
  }
  return stamps;
}

export function watchBuildPush(dir: string, options: BuildPushWatchOptions): () => void {
  const settleMs = options.settleMs ?? 100;
  try {
    writeTextFile(join(dir, KEEP_FILE), '');
  } catch (error) {
    options.logger?.warn?.('无法创建构建推送目录 ' + dir + '：' + String(error));
    return () => {};
  }

  const seen = stampsOf(dir, options.logger);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const drain = (): void => {
    const current = stampsOf(dir, options.logger);
    for (const [name, at] of current) {
      const before = seen.get(name);
      seen.set(name, at);
      if (before !== undefined && at <= before) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      } catch (error) {
        options.logger?.warn?.('无法读取构建推送 ' + name + '：' + String(error));
        continue;
      }
      const push = asPush(parsed);
      if (push === undefined) {
        options.logger?.warn?.('构建推送缺少 unit（' + name + '）：跳过');
        continue;
      }
      options.onPush(push);
    }
    for (const name of [...seen.keys()]) {
      if (!current.has(name)) seen.delete(name);
    }
  };

  const schedule = (): void => {
    if (closed) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!closed) drain();
    }, settleMs);
  };

  let watcher: ReturnType<typeof watch>;
  try {
    watcher = watch(dir, { persistent: false });
  } catch (error) {
    options.logger?.warn?.('无法监听构建推送目录 ' + dir + '：' + String(error));
    return () => {};
  }
  watcher.on('error', (error) => {
    options.logger?.warn?.('构建推送监听出错：' + String(error));
  });
  watcher.on('change', schedule);

  return () => {
    closed = true;
    if (timer !== null) clearTimeout(timer);
    watcher.close();
  };
}

export interface BuildPushMountOptions {
  readonly ctx: DshHostContext;
  readonly units: { noteApply(unit: string, record: UnitApplyRecord): void };
  readonly apply: () => Promise<BuildApplyOutcome>;
  readonly profileDir: string | null;
  readonly outbox?: string | undefined;
}

export function mountBuildPush(options: BuildPushMountOptions): void {
  const host = options.ctx.logger;
  const logger =
    host === undefined
      ? undefined
      : { warn: (message: string) => host.warn?.(`[dsh-workbench] ${message}`) };
  const applier = createBuildApplier({
    targets: () => installedBuildTargets(options.profileDir, (message) => logger?.warn?.(message)),
    apply: options.apply,
    record: (unit, record) => options.units.noteApply(unit, record),
    ...(logger === undefined ? {} : { logger }),
  });
  const close = watchBuildPush(options.outbox ?? join(workbenchRoot(), 'diy', BUILD_PUSH_DIR), {
    onPush: (push) => applier.push(push.unit),
    ...(logger === undefined ? {} : { logger }),
  });
  options.ctx.effect(
    () => () => {
      close();
      applier.dispose();
    },
    `${PLUGIN_ID}: 构建推送（模块构建完成后直接应用，不轮询）`,
  );
}

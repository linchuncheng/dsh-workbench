import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  answerRouteOf,
  longTaskIsLive,
  longTaskPollMs,
  recheckRouteOf,
  runsRouteOf,
  stopRouteOf,
  type LongTaskStatus,
  type LongTasksPayload,
  type WriteOutcome,
} from '@dsh-workbench/shared';

import type { ShellLongTaskRow } from '@/kernel/contract/long-tasks';
import { requestResource } from './use-api-resource';
import { useExternalActions } from './use-external-actions';
import { subscribeFactRevision } from './use-facts';
import { postWrite } from './use-host-write';

interface RunsState<T> {
  runs: readonly T[];
  at: number | null;
  stopping: string | null;
  stopFailed: string | null;
  rechecking: string | null;
  recheckFailed: string | null;
  answering: string | null;
  answerFailed: string | null;
}

interface RunsStore<T> {
  subscribe(listener: () => void): () => void;
  snapshot(): RunsState<T>;
  refresh(): void;
  stop(id: string): Promise<WriteOutcome<unknown>>;
  recheck(id: string): Promise<WriteOutcome<unknown>>;
  answer(id: string, values: Readonly<Record<string, string>>): Promise<WriteOutcome<unknown>>;
}

const IDLE_STATE: RunsState<never> = {
  runs: [],
  at: null,
  stopping: null,
  stopFailed: null,
  rechecking: null,
  recheckFailed: null,
  answering: null,
  answerFailed: null,
};

const NO_ACTION = async (): Promise<WriteOutcome<unknown>> => ({
  ok: false,
  message: '当前没有工作区',
});

const STORES = new Map<string, RunsStore<unknown>>();

function createRunsStore<T extends { readonly status: LongTaskStatus }>(
  unit: string,
  workspace: string,
  pollMs: number | undefined,
): RunsStore<T> {
  let state: RunsState<T> = IDLE_STATE as RunsState<T>;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;
  let offFact: (() => void) | null = null;
  let offVisibility: (() => void) | null = null;

  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  const update = (patch: Partial<RunsState<T>>): void => {
    state = { ...state, ...patch };
    notify();
  };

  const read = (): void => {
    const mine = (seq += 1);
    const flight = requestResource<LongTasksPayload>(
      runsRouteOf(unit),
      { path: workspace },
      runsRouteOf(unit),
    );
    void flight.task
      .then(
        (response) => {
          if (mine !== seq) return;
          if (response.ok) update({ runs: (response.runs ?? []) as readonly T[], at: Date.now() });
        },
        () => undefined,
      )
      .finally(flight.release);
  };

  const live = (): boolean => state.runs.some((row) => longTaskIsLive(row.status));

  const hidden = (): boolean => typeof document !== 'undefined' && document.hidden;

  const clearTimer = (): void => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const schedule = (): void => {
    clearTimer();
    if (listeners.size === 0 || hidden()) return;
    timer = setTimeout(() => {
      timer = null;
      if (listeners.size === 0 || hidden()) return;
      read();
      schedule();
    }, longTaskPollMs(live(), pollMs));
  };

  const onVisible = (): void => {
    if (document.hidden) {
      clearTimer();
      return;
    }
    read();
    schedule();
  };

  const start = (): void => {
    read();
    schedule();
    offFact = subscribeFactRevision(runsRouteOf(unit), read);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
      offVisibility = () => document.removeEventListener('visibilitychange', onVisible);
    }
  };

  const stop = (): void => {
    clearTimer();
    offFact?.();
    offVisibility?.();
    offFact = null;
    offVisibility = null;
  };

  const runWrite = async (
    busyKey: 'stopping' | 'rechecking' | 'answering',
    failedKey: 'stopFailed' | 'recheckFailed' | 'answerFailed',
    id: string,
    resource: string,
    body: Record<string, unknown>,
    networkText: string,
  ): Promise<WriteOutcome<unknown>> => {
    const busy = { [busyKey]: id, [failedKey]: null } as Partial<RunsState<T>>;
    update(busy);
    const outcome = await postWrite('actions', resource, body, networkText);
    const settled: Partial<RunsState<T>> = { [busyKey]: null } as Partial<RunsState<T>>;
    if (!outcome.ok) settled[failedKey] = outcome.message;
    update(settled);
    if (outcome.ok) read();
    return outcome;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    snapshot: () => state,
    refresh: () => read(),
    stop: (id) =>
      runWrite('stopping', 'stopFailed', id, stopRouteOf(unit), { id }, '网络不通，停止请求没发出去'),
    recheck: (id) =>
      runWrite(
        'rechecking',
        'recheckFailed',
        id,
        recheckRouteOf(unit),
        { id },
        '网络不通，重查请求没发出去',
      ),
    answer: (id, values) =>
      runWrite(
        'answering',
        'answerFailed',
        id,
        answerRouteOf(unit),
        { id, values },
        '网络不通，回执没交出去',
      ),
  };
}

function storeOf<T extends { readonly status: LongTaskStatus }>(
  unit: string,
  workspace: string,
  pollMs: number | undefined,
): RunsStore<T> {
  const key = JSON.stringify([unit, workspace]);
  const existing = STORES.get(key);
  if (existing !== undefined) return existing as RunsStore<T>;
  const created = createRunsStore<T>(unit, workspace, pollMs);
  STORES.set(key, created as RunsStore<unknown>);
  return created;
}

/**
 * 这一单元的长任务清单与三个写口：`runs` 是这次读交回的那一批（读数还没回来时是空数组）；
 * `stop(id)` 请外壳停某一趟 —— 回执没成就带回一句人话（调用点自己决定说不说）；
 * `stopping` 是正在请求停止的那一趟 id（没有就是 `null`），`stopFailed` 是上一次停止请求失败那句话（没有就是 `null`）。
 * `recheck(id)` 是「我处理完了」：只请模块再看一眼、外壳不承诺恢复；`rechecking` / `recheckFailed` 与停止那一对同形。
 * `answer(id, values)` 交结构化回执：值只回给模块、外壳不落快照；`answering` / `answerFailed` 同上那一对。
 * `refresh()` 让这一格**立刻**重读一次（不必等下一拍轮询）—— 自己写完/发起完之后用它，
 * 别去拼读口路由、也别为一个读数去碰事实通道。
 */
/** 一张卡的长任务读与写；同一个 `(unit, workspace)` 只有一个轮询与一套写状态。 */
export interface LongTaskFeed<T> {
  /** 当前要画的那几趟。 */
  readonly runs: readonly T[];
  /** 请求停止；成功后立刻重读一次，不抛错。 */
  stop(id: string): Promise<WriteOutcome<unknown>>;
  /** 正在停的那趟 id；没有是 null。 */
  readonly stopping: string | null;
  /** 上一次停止失败的原文；没有是 null。 */
  readonly stopFailed: string | null;
  /** 「我处理完了」；不抛错。 */
  recheck(id: string): Promise<WriteOutcome<unknown>>;
  /** 正在 recheck 的那趟 id；没有是 null。 */
  readonly rechecking: string | null;
  /** 上一次 recheck 失败的原文；没有是 null。 */
  readonly recheckFailed: string | null;
  /** 交回执；不抛错。 */
  answer(id: string, values: Readonly<Record<string, string>>): Promise<WriteOutcome<unknown>>;
  /** 正在回答的那趟 id；没有是 null。 */
  readonly answering: string | null;
  /** 上一次回执失败的原文；没有是 null。 */
  readonly answerFailed: string | null;
  /** 立刻重读一次。 */
  refresh(): void;
}

/** `useLongTask` 的入参：哪一格、哪个工作区、要不要轮。 */
export interface LongTaskOptions {
  /** 这个单元的 id。 */
  readonly unit: string;
  /** 当前工作区；null 时不轮。 */
  readonly workspace: string | null;
  /** 夹具模式：不轮、不写。 */
  readonly mocked?: boolean | undefined;
  /** false 时不轮。 */
  readonly enabled?: boolean | undefined;
  /** 轮询间隔；按第一个订阅者算。 */
  readonly pollMs?: number | undefined;
}

/**
 * 卡片要轮询长任务那一行时调用：有在跑的（`running` / `needs-human` / `needs-login`）按 `longTaskPollMs` 走快档、空闲走慢档；
 * `workspace` 为 `null`、`mocked: true` 或 `enabled: false` 时不轮。换单元 / 换工作区就是换读数身份，
 * 旧那批立刻清空、读数回来前 `runs` 是空数组。
 *
 * **读与写都是单飞的**：同一个 `(unit, workspace)` 的多个消费者共用一份数据、一个定时器与一套写状态
 * （引用计数），所以卡片、模块自己的 hook、`LongTaskRun` 一起用也只有一条轮询、一处「正在停」。
 * `pollMs` 按第一个订阅者算。`stop(id)` / `recheck(id)` / `answer(id, values)` 走 actions 通道；
 * 成功后立刻重读一次；都不抛错。
 */
export function useLongTask<T extends { readonly id: string; readonly status: LongTaskStatus }>(
  options: LongTaskOptions,
): LongTaskFeed<T> {
  const enabled = options.enabled !== false && options.mocked !== true && options.workspace !== null;
  const store = useMemo(
    () => (enabled ? storeOf<T>(options.unit, options.workspace ?? '', options.pollMs) : null),
    [enabled, options.unit, options.workspace, options.pollMs],
  );
  const subscribe = useCallback(
    (listener: () => void) => (store === null ? () => undefined : store.subscribe(listener)),
    [store],
  );
  const snapshot = useCallback(
    () => (store === null ? IDLE_STATE : store.snapshot()) as RunsState<T>,
    [store],
  );
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);

  if (store === null) {
    return {
      runs: state.runs,
      stop: NO_ACTION,
      stopping: null,
      stopFailed: null,
      recheck: NO_ACTION,
      rechecking: null,
      recheckFailed: null,
      answer: NO_ACTION,
      answering: null,
      answerFailed: null,
      refresh: () => undefined,
    };
  }

  return {
    runs: state.runs,
    stop: store.stop,
    stopping: state.stopping,
    stopFailed: state.stopFailed,
    recheck: store.recheck,
    rechecking: state.rechecking,
    recheckFailed: state.recheckFailed,
    answer: store.answer,
    answering: state.answering,
    answerFailed: state.answerFailed,
    refresh: store.refresh,
  };
}

const WIRING_URL_PATTERN = /^https?:\/\//i;

/** 卡片侧把长任务行接起来的整组。 */
export interface LongTaskWiring {
  /** 长任务读与写。 */
  readonly feed: LongTaskFeed<ShellLongTaskRow>;
  /** 打开一个链接。 */
  readonly open: (url: string) => void;
  /** 复制一段文本。 */
  readonly copy: (text: string) => void;
  /** 刚复制的那段；没有是 null。 */
  readonly copied: string | null;
}

/** 卡片要一行长任务时用它：读 feed、接打开与复制。 */
export function useLongTaskWiring(options: {
  readonly unit: string;
  readonly workspace: string | null;
  readonly enabled?: boolean | undefined;
}): LongTaskWiring {
  const feed = useLongTask<ShellLongTaskRow>({
    unit: options.unit,
    workspace: options.workspace,
    ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
  });
  const external = useExternalActions(feed.refresh);
  const openExternal = external.open;
  const open = useCallback(
    (url: string): void => {
      if (!WIRING_URL_PATTERN.test(url)) return;
      openExternal(url);
    },
    [openExternal],
  );
  return { feed, open, copy: external.copy, copied: external.copied };
}

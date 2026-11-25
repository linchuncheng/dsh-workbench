import { useEffect, useRef } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import type { ModuleBlocker } from '@dsh-workbench/shared';
import { blockerOfCapability } from '@dsh-workbench/shared';
import type { UnitBlockers } from '@dsh-workbench/shared';
import type { CapabilityPayload } from '@dsh-workbench/shared';
import type { ApiError } from '@dsh-workbench/shared';
import { MIN_BUSY_MS } from '@dsh-workbench/shared';
import { probeKeyOf, splitBlocker } from '@/shared/api/unit-board';

import type { ResourceState } from './use-api-resource';
import { useCapabilityProbe } from './use-capabilities';

import type { CapabilityGate } from './use-capability-gate';
import { useCardSummary, type CardSummary } from './use-card-summary';
import { useVisibleBusy } from './use-visible-busy';

/**
 * 卡片读数的最小形状：`state` 是 `useApiResource` 那一格，加上 `refreshing` / `at`（来自 `CardSummary`）
 * 与 `settling`（挂过最短可见时长的那截收尾）。
 */
export interface CardFeed extends CardSummary {
  /** `useApiResource` 那一格。 */
  readonly state: ResourceState<unknown>;
  /** 刚结束、还在最短可见时长里。 */
  readonly settling?: boolean | undefined;
}

/**
 * 起步一张卡片要交的东西：这个单元的 `unit`、能力门 `gate`、`refreshToken`、`onRefresh` / `onSummary` 两个回调、
 * 自己的读数函数 `read(gated)`（收到的是「是否放行」，为真才去读）、翻译 `t`（`enabled: false` 时整个单元不读）；
 * `platformBlocker(error, t)` 把平台错误翻成 blocker。
 */
export interface UnitBoardOptions<TFeed extends CardFeed> {
  /** 这个单元的 id。 */
  readonly unit: string;
  /** 能力门。 */
  readonly gate: CapabilityGate;
  /** 刷新令牌；一变就重读。 */
  readonly refreshToken: number;
  /** 请求刷新。 */
  readonly onRefresh: () => void;
  /** 把这张卡的刷新状态与上次读到时间报给工作台。 */
  readonly onSummary: (summary: CardSummary) => void;
  /** 自己的读数函数；收到「是否放行」，为真才去读。 */
  readonly read: (gated: boolean) => TFeed;
  /** 翻译函数。 */
  readonly t: Translate;
  /** false 时整个单元不读。 */
  readonly enabled?: boolean | undefined;
  /** 把平台错误翻成 blocker。 */
  readonly platformBlocker?: ((error: ApiError, t: Translate) => ModuleBlocker | undefined) | undefined;
}

/**
 * `useUnitBoard` 叠出来的整组：`feed`（含 `state`）、`capability`、`gated`（是否放行）、`refresh`、`forceProbe`、`summary`，
 * 外加拆好的那几个 blocker 字段。
 */
export interface UnitBoard<TFeed extends CardFeed> extends UnitBlockers {
  /** 读数那一格（含 `state`）。 */
  readonly feed: TFeed;
  /** 能力读数；还没探到是 null。 */
  readonly capability: CapabilityPayload | null;
  /** 是否放行。 */
  readonly gated: boolean;
  /** 请求刷新。 */
  readonly refresh: () => void;
  /** 现在就去探测一次。 */
  readonly forceProbe: () => void;
  /** 报给面板的摘要。 */
  readonly summary: CardSummary;
}

/**
 * 卡片起步就用它：把“gate 不放行就不读”、忙 / 安定（按 `MIN_BUSY_MS` 挂最短可见时长）、读数报错时
 * 自动 `forceProbe`、`useCardSummary` 上报面板、blocker 拆分一次叠好。`read(gated)` 里自己调 `useApiResource`。
 */
export function useUnitBoard<TFeed extends CardFeed>(options: UnitBoardOptions<TFeed>): UnitBoard<TFeed> {
  const { gate, onRefresh, onSummary, t } = options;

  const feed = options.read(gate.gated && options.enabled !== false);

  const capabilityBlocker = gate.capability === null ? undefined : blockerOfCapability(gate.capability, t);
  const probe = useCapabilityProbe();
  const probeBusy = capabilityBlocker === undefined ? false : probe.checking;
  const { busy: refreshing, settling } = useVisibleBusy(feed.refreshing || probeBusy, MIN_BUSY_MS);

  const probedFor = useRef<string | null>(null);
  const probeKey = probeKeyOf(feed.state.phase === 'error' ? feed.state.error : undefined);
  const { forceProbe } = gate;
  useEffect(() => {
    if (probeKey === null || probedFor.current === probeKey) return;
    probedFor.current = probeKey;
    forceProbe();
  }, [probeKey, forceProbe]);

  const summary: CardSummary = { refreshing, at: feed.at };
  useCardSummary(onSummary, summary);

  const errorBlocker =
    feed.state.phase === 'error' && options.platformBlocker !== undefined
      ? options.platformBlocker(feed.state.error as ApiError, t)
      : undefined;
  const blockers = splitBlocker([errorBlocker, capabilityBlocker]);

  return {
    feed: { ...feed, refreshing, settling },
    capability: gate.capability,
    gated: gate.gated,
    refresh: onRefresh,
    forceProbe,
    summary,
    ...blockers,
  };
}

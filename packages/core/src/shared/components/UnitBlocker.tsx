import { createElement as h } from 'react';
import type { ApiError, CapabilityPayload, Translate } from '@dsh-workbench/shared';
import { blockerOf } from '@dsh-workbench/shared';
import { BlockerState } from './BlockerState';

/**
 * `<UnitBlocker>` 的 prop：一份读口错误或能力读数，外加渲染要用的那几样。
 */
export interface UnitBlockerProps {
  /** 翻译函数；文案全部来自 `blocker.*` 与 `env.*`。 */
  readonly t: Translate;
  /** 读口回的错；`auth-required` 会出「需要登录 + 去登录」，`permission-denied` 出「没有权限」。 */
  readonly error?: ApiError | undefined;
  /** 工作台返回的模块环境读数；`ok` 时忽略，其余状态出一张阻断或提示。 */
  readonly capability?: CapabilityPayload | undefined;
  /** 平台名；给了就用「需要登录 {平台}」那一句。 */
  readonly platform?: string | undefined;
  /** 登录地址；`error.helpUrl` 没给时用它补上。 */
  readonly loginUrl?: string | undefined;
  /** 重试与修复成功后的回调。 */
  readonly onRetry: () => void;
  /** 外层是否在忙（默认 `false`）；为真时动作一并禁用。 */
  readonly busy?: boolean | undefined;
  /** 贴着卡片边渲染（默认 `false`）：去图标、收窄留白。 */
  readonly flush?: boolean | undefined;
  /** 市场动作的回调；没给就退回 `onRetry`。 */
  readonly onOpenMarket?: (() => void) | undefined;
}

/**
 * 把读口错误或能力读数翻成一张统一的阻断屏；两者都干净时不画任何东西。
 * @returns 一个 `BlockerState`，或 `null`。
 */
export function UnitBlocker({
  t,
  error,
  capability,
  platform,
  loginUrl,
  onRetry,
  busy = false,
  flush = false,
  onOpenMarket,
}: UnitBlockerProps) {
  const blocker = blockerOf({ error, capability, t, platform, loginUrl });
  if (blocker === undefined) return null;
  return (
    <BlockerState
      blocker={blocker}
      t={t}
      busy={busy}
      flush={flush}
      onRetry={onRetry}
      {...(onOpenMarket === undefined ? {} : { onOpenMarket })}
    />
  );
}

import { useCallback, useRef, useState } from 'react';
import { apiPost } from '@dsh-workbench/shared';
import type { WriteChannel, WriteOutcome } from '@dsh-workbench/shared';
import { writeOutcomeOf, writeRoute } from '@/shared/api/write-outcome';
import { sessionForWrite, writeBodyWithSession } from './write-session';

/**
 * 一个写通道的句柄：`busy` 在发、`failed` / `detail` 上一条人话失败（没有是 `null`）、
 * `send(body, { silent })` 回 `WriteOutcome`、`fail(message, detail?)` 本地就知道不行时自己塞一条、`clear()` 清掉。
 */
/** 一个写通道的句柄。 */
export interface HostWrite<T> {
  /** 这一路写有没有在飞。 */
  readonly busy: boolean;
  /** 上一条失败的提示；没有是 null。 */
  readonly failed: string | null;
  /** 失败详情（原文 / 诊断）；没有是 null。 */
  readonly detail: string | null;
  /** 发一次写；`silent` 不打扰（不动 `busy` / `failed`，结果只看返回值）。 */
  send(body: Record<string, unknown>, options?: { readonly silent?: boolean }): Promise<WriteOutcome<T>>;
  /** 本地就知道不行时自己塞一条失败文案。 */
  fail(message: string, detail?: string): void;
  /** 清掉失败。 */
  clear(): void;
}

/**
 * 写通道的配置：`channel` 用哪个前缀、`resource` 挂在它的哪一格（多数通道留空）、`networkText` 网络不通时那句人话。
 */
export interface HostWriteOptions {
  /** 用哪个写通道前缀。 */
  readonly channel: WriteChannel;
  /** 挂在该通道的哪一格；多数通道留空。 */
  readonly resource?: string | undefined;
  /** 网络不通时那句提示。 */
  readonly networkText: string;
}

/**
 * 非 hook 的写口：组件外的 store 也要写时用它（同一套通道 / 会话 / 网络文案），不要自己 `fetch`。
 * @param channel 写通道。
 * @param resource 挂在该通道的哪一格。
 * @param body 请求体。
 * @param networkText 网络不通时那句人话。
 * @returns 写回执。
 */
export async function postWrite<T>(
  channel: WriteChannel,
  resource: string,
  body: Record<string, unknown>,
  networkText: string,
): Promise<WriteOutcome<T>> {
  const session = sessionForWrite(channel);
  const response = await apiPost<T>(
    writeRoute(channel, resource),
    writeBodyWithSession(channel, body, session),
  ).catch(() => null);
  return writeOutcomeOf<T>(response, networkText);
}

/**
 * 组件里要写（发 POST）时调用 —— 写只走这条，别在组件里自己 `fetch`。
 * `send` 失败自动落到 `failed` + `detail`（界面直接显示，别自己拼）；`silent: true` 是不打扰：不动 `busy` / `failed`，
 * 结果只从返回值拿。返回的 `busy` 是这一路写有没有在飞。
 */
export function useHostWrite<T>(options: HostWriteOptions): HostWrite<T> {
  const { channel, networkText } = options;
  const resource = options.resource ?? '';
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; detail?: string } | null>(null);
  const alive = useRef(true);

  const fail = useCallback((message: string, detail?: string): void => {
    setFailure({ message, ...(detail === undefined ? {} : { detail }) });
  }, []);

  const send = useCallback(
    async (body: Record<string, unknown>, callOptions?: { readonly silent?: boolean }): Promise<WriteOutcome<T>> => {
      const silent = callOptions?.silent === true;
      if (!silent) {
        setFailure(null);
        setBusy(true);
      }
      try {
        const outcome = await postWrite<T>(channel, resource, body, networkText);
        if (!outcome.ok && !silent) fail(outcome.message, outcome.detail);
        return outcome;
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        const outcome = { ok: false, message: networkText, detail: text } as const;
        if (!silent) fail(outcome.message, outcome.detail);
        return outcome;
      } finally {
        if (!silent && alive.current) setBusy(false);
      }
    },
    [channel, resource, networkText, fail],
  );

  const clear = useCallback((): void => setFailure(null), []);

  return {
    busy,
    failed: failure?.message ?? null,
    detail: failure?.detail ?? null,
    send,
    fail,
    clear,
  };
}

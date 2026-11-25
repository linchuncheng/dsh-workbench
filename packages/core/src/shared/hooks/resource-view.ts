import type { ApiError } from '@dsh-workbench/shared';

/** 一次读的相位：idle / loading / ready / error；身份没变的重取会保留上一格的值。 */
export interface ResourceState<T> {
  /** 读到哪一步；重取时从 ready 降到 loading，同时保留 `value`。 */
  readonly phase: 'idle' | 'loading' | 'ready' | 'error';
  /** 读到的值；idle / loading / error 时可能没有。 */
  readonly value?: T;
  /** 失败时的错误；有上一格 `value` 时会同时是 ready。 */
  readonly error?: ApiError;
  /** 读到 `value` 的时刻（毫秒时间戳）。 */
  readonly at?: number;
  /** 值是不是旧的；当前读路径不设它，调用点按需用。 */
  readonly stale?: boolean;
}

export const IDLE: ResourceState<never> = { phase: 'idle' };
export const LOADING: ResourceState<never> = { phase: 'loading' };

export interface TaggedState<T> {
  readonly identity: string;
  readonly state: ResourceState<T>;
}

export function failureViewOf<T>(previous: ResourceState<T> | undefined, error: ApiError): ResourceState<T> {
  const value = previous?.value;
  if (value === undefined) return { phase: 'error', error };
  return {
    phase: 'ready',
    value,
    error,
    stale: true,
    ...(previous?.at === undefined ? {} : { at: previous.at }),
  };
}

export function resourceViewOf<T>(
  enabled: boolean,
  current: TaggedState<T>,
  identity: string,
): ResourceState<T> {
  if (!enabled) return IDLE;
  return current.identity === identity ? current.state : LOADING;
}

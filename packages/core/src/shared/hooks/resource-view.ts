import type { ApiError } from '@dsh-workbench/shared';

export interface ResourceState<T> {
  readonly phase: 'idle' | 'loading' | 'ready' | 'error';
  readonly value?: T;
  readonly error?: ApiError;
  readonly at?: number;
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

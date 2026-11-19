import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import type { MarketMock } from './market-mock';
import type { Pending } from './market-view-text';
import type { MarketFailure } from './market-row-types';

export interface MarketTransient {
  readonly pending: Pending | null;
  readonly setPending: (next: Pending | null) => void;
  readonly confirming: string | null;
  readonly setConfirming: (next: string | null) => void;
  readonly failed: MarketFailure | null;
  readonly setFailed: (next: MarketFailure | null) => void;
  readonly notice: string | null;
  readonly setNotice: (next: string | null) => void;
}

interface MarketTransientFacts {
  readonly pending: Pending | null;
  readonly confirming: string | null;
  readonly failed: MarketFailure | null;
  readonly notice: string | null;
}

const IDLE: MarketTransientFacts = {
  pending: null,
  confirming: null,
  failed: null,
  notice: null,
};

let facts = IDLE;
const listeners = new Set<() => void>();

function sameFacts(left: MarketTransientFacts, right: MarketTransientFacts): boolean {
  return (
    left.pending === right.pending &&
    left.confirming === right.confirming &&
    left.failed === right.failed &&
    left.notice === right.notice
  );
}

function publish(next: MarketTransientFacts): void {
  if (sameFacts(next, facts)) return;
  facts = next;
  for (const listener of [...listeners]) listener();
}

export function marketTransientFacts(): MarketTransientFacts {
  return facts;
}

export function subscribeMarketTransient(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetMarketTransient(): void {
  publish(IDLE);
}

export function setMarketPending(next: Pending | null): void {
  publish({ ...facts, pending: next });
}

export function setMarketConfirming(next: string | null): void {
  publish({ ...facts, confirming: next });
}

export function setMarketFailed(next: MarketFailure | null): void {
  publish({ ...facts, failed: next });
}

export function setMarketNotice(next: string | null): void {
  publish({ ...facts, notice: next });
}

function factsOfMock(mock: MarketMock | undefined): MarketTransientFacts {
  return {
    pending: mock?.pending ?? null,
    confirming: mock?.confirming ?? null,
    failed: mock?.failure ?? null,
    notice: null,
  };
}

export function useMarketTransient(input: {
  readonly mock: MarketMock | undefined;
  readonly onPending?: ((pending: boolean) => void) | undefined;
}): MarketTransient {
  const { mock, onPending } = input;
  const live = useSyncExternalStore(subscribeMarketTransient, marketTransientFacts);
  const [draft, setDraft] = useState<MarketTransientFacts>(() => factsOfMock(mock));
  const setDraftPending = useCallback((next: Pending | null): void => {
    setDraft((previous) => (previous.pending === next ? previous : { ...previous, pending: next }));
  }, []);
  const setDraftConfirming = useCallback((next: string | null): void => {
    setDraft((previous) => (previous.confirming === next ? previous : { ...previous, confirming: next }));
  }, []);
  const setDraftFailed = useCallback((next: MarketFailure | null): void => {
    setDraft((previous) => (previous.failed === next ? previous : { ...previous, failed: next }));
  }, []);
  const setDraftNotice = useCallback((next: string | null): void => {
    setDraft((previous) => (previous.notice === next ? previous : { ...previous, notice: next }));
  }, []);

  const pending = mock === undefined ? live.pending : draft.pending;
  const confirming = mock === undefined ? live.confirming : draft.confirming;
  const failed = mock === undefined ? live.failed : draft.failed;
  const notice = mock === undefined ? live.notice : draft.notice;
  const setPending = mock === undefined ? setMarketPending : setDraftPending;
  const setConfirming = mock === undefined ? setMarketConfirming : setDraftConfirming;
  const setFailed = mock === undefined ? setMarketFailed : setDraftFailed;
  const setNotice = mock === undefined ? setMarketNotice : setDraftNotice;

  useEffect(() => {
    onPending?.(pending !== null);
    return () => onPending?.(false);
  }, [pending, onPending]);

  return { pending, setPending, confirming, setConfirming, failed, setFailed, notice, setNotice };
}

import { useSyncExternalStore } from 'react';

export interface MarketStore {
  subscribe(listener: () => void): () => void;
  notify(): void;
}

export function marketStore(): MarketStore {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify() {
      for (const listener of [...listeners]) listener();
    },
  };
}

export function useMarketStore<T>(store: MarketStore, read: () => T): T {
  return useSyncExternalStore(store.subscribe, read);
}

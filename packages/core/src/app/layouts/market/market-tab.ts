import { useSyncExternalStore } from 'react';
import type { MarketTab } from './market-header';

let tab: MarketTab = 'installed';
const listeners = new Set<() => void>();

export function marketTabValue(): MarketTab {
  return tab;
}

export function subscribeMarketTab(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setMarketTab(next: MarketTab): void {
  if (next === tab) return;
  tab = next;
  for (const listener of [...listeners]) listener();
}

export function resetMarketTab(): void {
  setMarketTab('installed');
}

export function useMarketTab(): {
  readonly tab: MarketTab;
  readonly setTab: (next: MarketTab) => void;
} {
  return { tab: useSyncExternalStore(subscribeMarketTab, marketTabValue), setTab: setMarketTab };
}

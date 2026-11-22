import type { MarketState } from './market-row-types';

export function isOnMachine(state: MarketState): boolean {
  return (
    state === 'installed' ||
    state === 'outdated' ||
    state === 'older-on-disk' ||
    state === 'pending-restart' ||
    state === 'inactive' ||
    state === 'unusable' ||
    state === 'broken'
  );
}

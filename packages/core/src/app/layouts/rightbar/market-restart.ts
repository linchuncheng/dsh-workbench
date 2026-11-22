import { marketStore, useMarketStore, type MarketStore } from './market-store';

const KEY = 'wb.market.restart';

const NO_UNITS: ReadonlySet<string> = new Set();

const channel: MarketStore = marketStore();

let snapshot: ReadonlySet<string> | null = null;

function read(): ReadonlySet<string> {
  const raw = globalThis.localStorage?.getItem(KEY) ?? '';
  const units = raw
    .split('\n')
    .map((one) => one.trim())
    .filter((one) => one !== '');
  return units.length === 0 ? NO_UNITS : new Set(units);
}

function publish(next: ReadonlySet<string>): void {
  snapshot = next;
  channel.notify();
}

function write(next: ReadonlySet<string>): void {
  globalThis.localStorage?.setItem(KEY, [...next].join('\n'));
  publish(next);
}

export function marketRestartUnits(): ReadonlySet<string> {
  snapshot ??= read();
  return snapshot;
}

export function markMarketRestart(units: readonly string[]): void {
  const current = marketRestartUnits();
  const next = new Set(current);
  for (const unit of units) if (unit !== '') next.add(unit);
  if (next.size !== current.size) write(next);
}

export function loadedMarketUnits(units: readonly string[]): void {
  const current = marketRestartUnits();
  const loaded = new Set(units);
  const next = new Set([...current].filter((unit) => !loaded.has(unit)));
  if (next.size !== current.size) write(next);
}

export const subscribeMarketRestart = channel.subscribe;

export function useMarketRestart(): ReadonlySet<string> {
  return useMarketStore(channel, marketRestartUnits);
}

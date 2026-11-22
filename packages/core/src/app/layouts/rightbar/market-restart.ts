import { marketStore, useMarketStore, type MarketStore } from './market-store';
import { MODULE_SETTLE_MS } from './market-settle';

const KEY = 'wb.market.restart';

const NO_UNITS: ReadonlySet<string> = new Set();

const channel: MarketStore = marketStore();

export interface MarketRestartState {
  readonly grace: ReadonlySet<string>;
  readonly confirmed: ReadonlySet<string>;
}

const IDLE: MarketRestartState = { grace: NO_UNITS, confirmed: NO_UNITS };

let snapshot: MarketRestartState = IDLE;
let marks: ReadonlyMap<string, number> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function read(): ReadonlyMap<string, number> {
  const raw = globalThis.localStorage?.getItem(KEY) ?? '';
  const found = new Map<string, number>();
  for (const line of raw.split('\n')) {
    const [unit, at] = line.split('\t');
    const named = unit?.trim() ?? '';
    if (named === '') continue;
    const marked = Number(at);
    found.set(named, Number.isFinite(marked) ? marked : 0);
  }
  return found;
}

function split(now: number): MarketRestartState {
  const grace = new Set<string>();
  const confirmed = new Set<string>();
  for (const [unit, at] of marketRestartUnits()) {
    (now - at < MODULE_SETTLE_MS ? grace : confirmed).add(unit);
  }
  return grace.size === 0 && confirmed.size === 0 ? IDLE : { grace, confirmed };
}

function schedule(now: number): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  const waits = [...marketRestartUnits().values()]
    .map((at) => at + MODULE_SETTLE_MS - now)
    .filter((left) => left > 0);
  if (waits.length === 0) return;
  timer = setTimeout(refresh, Math.min(...waits) + 1);
}

function refresh(): void {
  const now = Date.now();
  snapshot = split(now);
  schedule(now);
  channel.notify();
}

function write(next: ReadonlyMap<string, number>): void {
  marks = next;
  globalThis.localStorage?.setItem(
    KEY,
    [...next.entries()].map(([unit, at]) => `${unit}\t${at}`).join('\n'),
  );
  refresh();
}

export function marketRestartUnits(): ReadonlyMap<string, number> {
  marks ??= read();
  return marks;
}

export function marketRestartState(): MarketRestartState {
  return snapshot;
}

refresh();

export function markMarketRestart(units: readonly string[]): void {
  const current = marketRestartUnits();
  const next = new Map(current);
  const now = Date.now();
  for (const unit of units) if (unit !== '' && !next.has(unit)) next.set(unit, now);
  if (next.size !== current.size) write(next);
}

export function loadedMarketUnits(units: readonly string[]): void {
  const current = marketRestartUnits();
  const loaded = new Set(units);
  const next = new Map([...current].filter(([unit]) => !loaded.has(unit)));
  if (next.size !== current.size) write(next);
}

export const subscribeMarketRestart = channel.subscribe;

export function useMarketRestart(): MarketRestartState {
  return useMarketStore(channel, marketRestartState);
}

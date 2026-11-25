import { now as clockNow } from '../runtime/time.js';
import { HANDOFF_TTL_MS } from '../../config/constants.js';

export interface HandoffEntry {
  readonly fact: string;
  readonly key: string;
}

export interface HandoffValue {
  readonly value: unknown;
  readonly at: number;
}

/** 跨单元交接一个值：按 (fact, key) 放，取一次就没了，过期当没放。 */
export interface ValueHandoff {
  /** 放一个值，覆盖同 (fact, key) 的旧值；now 只给测试用。 */
  hand(entry: HandoffEntry, value: unknown, now?: number): void;
  /** 取走同 (fact, key) 的值；取过就删，过期也返回 undefined。 */
  take(entry: HandoffEntry, now?: number): HandoffValue | undefined;
}

export function handoffId(entry: HandoffEntry): string {
  return `${String(entry.fact.length)}:${entry.fact}${entry.key}`;
}

export function createValueHandoff(options: { ttlMs?: number } = {}): ValueHandoff {
  const ttlMs = options.ttlMs ?? HANDOFF_TTL_MS;
  const held = new Map<string, HandoffValue>();

  return {
    hand(entry, value, now: number = clockNow()) {
      held.set(handoffId(entry), { value, at: now });
    },
    take(entry, now: number = clockNow()) {
      const id = handoffId(entry);
      const hit = held.get(id);
      if (hit === undefined) return undefined;
      held.delete(id);
      return now - hit.at >= ttlMs ? undefined : hit;
    },
  };
}

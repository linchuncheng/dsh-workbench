export interface HoldSlot {
  readonly sessionId: string;
  readonly at: number;
}

export type HoldMiss = 'none' | 'not-owner';

export type HoldBusy = 'already-held' | 'held-by-other';

export type HoldCode = HoldMiss | HoldBusy;

export type HoldMove<T, R> =
  | { readonly ok: true; readonly state: T }
  | { readonly ok: false; readonly code: R };

export interface Hold<T> {
  live(now: number): T | null;
  begin(sessionId: string, now: number, state: (now: number) => T): HoldMove<T, HoldBusy>;
  move<R>(sessionId: string, now: number, next: (found: T) => HoldMove<T, R>): HoldMove<T, HoldCode | R>;
  release(sessionId: string, now: number): HoldMove<T, HoldMiss>;
}

export function createHold<T extends HoldSlot>(staleMs: number): Hold<T> {
  let held: T | null = null;

  const fresh = (now: number): T | null => (held === null || now - held.at > staleMs ? null : held);

  return {
    live(now) {
      return fresh(now);
    },

    begin(sessionId, now, state) {
      const current = fresh(now);
      if (current !== null) {
        return { ok: false, code: current.sessionId === sessionId ? 'already-held' : 'held-by-other' };
      }
      const next = state(now);
      held = next;
      return { ok: true, state: next };
    },

    move(sessionId, now, next) {
      const current = fresh(now);
      if (current === null) return { ok: false, code: 'none' };
      if (current.sessionId !== sessionId) return { ok: false, code: 'not-owner' };
      const moved = next(current);
      if (!moved.ok) return moved;
      held = moved.state;
      return moved;
    },

    release(sessionId, now) {
      const current = fresh(now);
      if (current === null) return { ok: false, code: 'none' };
      if (current.sessionId !== sessionId) return { ok: false, code: 'not-owner' };
      held = null;
      return { ok: true, state: current };
    },
  };
}

export function beginMove<T, P extends { readonly sessionId: string; readonly now: number }>(
  hold: Hold<T>,
  pact: P,
  seed: (pact: P, now: number) => T,
): HoldMove<T, HoldBusy> {
  return hold.begin(pact.sessionId, pact.now, (now) => seed(pact, now));
}

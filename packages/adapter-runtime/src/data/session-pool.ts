import { now } from '@dsh-workbench/shared/host';

interface Entry {
  readonly seq: number;
  readonly at: number;
}

export interface SessionPool {
  touch(session: string): void;
  hold(session: string): void;
  idle(session: string): string | undefined;
  drop(session: string): void;
  expire(idleMs: number): readonly string[];
}

export function createSessionPool(input: {
  readonly max: number;
  readonly close: (session: string) => void;
}): SessionPool {
  const seen = new Map<string, Entry>();
  const busy = new Set<string>();
  let clock = 0;

  function mark(session: string): void {
    clock += 1;
    seen.set(session, { seq: clock, at: now() });
  }

  function sweep(keep: string): void {
    if (seen.size <= input.max) return;
    const idle = [...seen.entries()]
      .filter(([session]) => !busy.has(session) && session !== keep)
      .sort((a, b) => a[1].seq - b[1].seq);
    for (const [session] of idle) {
      if (seen.size <= input.max) break;
      seen.delete(session);
      input.close(session);
    }
  }

  return {
    touch(session) {
      mark(session);
      sweep(session);
    },
    hold(session) {
      busy.add(session);
      mark(session);
      sweep(session);
    },
    drop(session) {
      busy.delete(session);
      seen.delete(session);
    },
    expire(idleMs) {
      if (idleMs <= 0) return [];
      const at = now();
      const found: string[] = [];
      for (const [session, entry] of [...seen.entries()]) {
        if (busy.has(session)) continue;
        if (at - entry.at < idleMs) continue;
        seen.delete(session);
        found.push(session);
      }
      return found;
    },
    idle(session) {
      busy.delete(session);
      mark(session);
      const before = seen.size;
      sweep(session);
      return before === seen.size ? undefined : session;
    },
  };
}

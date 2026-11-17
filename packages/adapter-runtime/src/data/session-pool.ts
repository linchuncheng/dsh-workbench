export interface SessionPool {
  touch(session: string): void;
  hold(session: string): void;
  idle(session: string): string | undefined;
  drop(session: string): void;
}

export function createSessionPool(input: {
  readonly max: number;
  readonly close: (session: string) => void;
}): SessionPool {
  const seen = new Map<string, number>();
  const busy = new Set<string>();
  let clock = 0;

  function mark(session: string): void {
    clock += 1;
    seen.set(session, clock);
  }

  function sweep(keep?: string): void {
    if (seen.size <= input.max) return;
    const idle = [...seen.entries()]
      .filter(([session]) => !busy.has(session) && session !== keep)
      .sort((a, b) => a[1] - b[1]);
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
    idle(session) {
      busy.delete(session);
      mark(session);
      sweep(session);
      const before = seen.size;
      sweep(session);
      return before === seen.size ? undefined : session;
    },
  };
}

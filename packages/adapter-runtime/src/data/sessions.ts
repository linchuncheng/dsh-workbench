import { productWrite, type Seam } from '@dsh-workbench/shared/host';
import { backgroundLine, type SessionDialect } from '../cli/index.js';
import { createSessionPool } from './session-pool.js';
import { createSessionRegistry } from './session-registry.js';

export interface SessionKeeper {
  begin(session: string): void;
  end(session: string, write: boolean): Promise<void>;
  hold<T>(session: string, work: () => Promise<T>): Promise<T>;
}

export function createSessionKeeper(input: {
  readonly seam?: Seam | undefined;
  readonly command: string;
  readonly max: number;
  readonly registryDir?: string | undefined;
  readonly idleMs?: number | undefined;
  readonly dialectOf?: (() => SessionDialect) | undefined;
}): SessionKeeper {
  const inFlight = new Map<string, number>();
  const opened = new Set<string>();

  async function close(session: string): Promise<void> {
    if (input.seam === undefined) return;
    await input.seam
      .run({
        command: backgroundLine(
          input.command,
          ['browser', session, 'close'],
          input.dialectOf === undefined ? {} : { dialect: input.dialectOf() },
        ),
        intent: productWrite(),
        timeoutMs: 15_000,
        bestEffort: true,
      })
      .catch(() => undefined);
  }

  const pool = createSessionPool({ max: input.max, close: (session) => void close(session) });
  const registry =
    input.registryDir === undefined ? undefined : createSessionRegistry({ dir: input.registryDir });

  async function leave(session: string, write: boolean): Promise<void> {
    const left = (inFlight.get(session) ?? 1) - 1;
    if (left > 0) {
      inFlight.set(session, left);
      return;
    }
    inFlight.delete(session);
    if (!write) return;
    if (!opened.delete(session)) return;
    pool.drop(session);
    await close(session);
  }

  void (async () => {
    for (const session of registry?.stale() ?? []) await close(session);
  })();

  if (input.idleMs !== undefined && input.idleMs > 0) {
    const timer = setInterval(() => {
      void (async () => {
        for (const session of pool.expire(input.idleMs ?? 0)) await close(session);
      })();
    }, Math.min(input.idleMs, 60_000));
    timer.unref?.();
  }

  return {
    begin(session) {
      inFlight.set(session, (inFlight.get(session) ?? 0) + 1);
      registry?.claim(session);
      opened.add(session);
      pool.hold(session);
    },
    async end(session, write) {
      pool.idle(session);
      await leave(session, write);
    },
    async hold(session, work) {
      inFlight.set(session, (inFlight.get(session) ?? 0) + 1);
      try {
        return await work();
      } finally {
        await leave(session, true);
      }
    },
  };
}

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDir, pidAlive, removePath, writeTextFile } from '@dsh-workbench/shared/host';

interface RegistryFile {
  readonly pid: number;
  readonly sessions: readonly string[];
}

export interface SessionRegistry {
  claim(session: string): void;
  stale(): readonly string[];
  release(): void;
}

function readFileAt(file: string): RegistryFile | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const pid = (parsed as Record<string, unknown>)['pid'];
    const sessions = (parsed as Record<string, unknown>)['sessions'];
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return undefined;
    const list = Array.isArray(sessions) ? sessions.filter((one): one is string => typeof one === 'string') : [];
    return { pid, sessions: list };
  } catch {
    return undefined;
  }
}

export function createSessionRegistry(input: {
  readonly dir: string;
  readonly processId?: number | undefined;
}): SessionRegistry {
  const processId = input.processId ?? process.pid;
  const own = join(input.dir, `${String(processId)}.json`);
  const claimed = new Set<string>();

  function write(): void {
    try {
      ensureDir(input.dir);
      writeTextFile(own, `${JSON.stringify({ pid: processId, sessions: [...claimed] })}\n`);
    } catch {
      return;
    }
  }

  return {
    claim(session) {
      if (claimed.has(session)) return;
      claimed.add(session);
      write();
    },
    stale() {
      if (!existsSync(input.dir)) return [];
      const found: string[] = [];
      for (const entry of readdirSync(input.dir)) {
        if (!entry.endsWith('.json')) continue;
        const file = join(input.dir, entry);
        const parsed = readFileAt(file);
        if (parsed === undefined) {
          removePath(file);
          continue;
        }
        if (parsed.pid === processId) continue;
        if (pidAlive(parsed.pid)) continue;
        found.push(...parsed.sessions);
        removePath(file);
      }
      return [...new Set(found)];
    },
    release() {
      removePath(own);
    },
  };
}

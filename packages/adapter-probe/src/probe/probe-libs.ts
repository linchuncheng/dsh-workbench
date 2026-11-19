import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LibNeed, NeedState, Seam, SupplyIndex } from '@dsh-workbench/shared/host';
import { libInstallCommand } from '@dsh-workbench/adapter-runtime';
import { needIdOf, npmSourceOf, mapWithLimit } from '@dsh-workbench/shared/host';
import { libDir } from '@dsh-workbench/adapter-runtime';
import { npmRegistryOf } from '@dsh-workbench/adapter-supply';
import { isNewerVersion } from '@dsh-workbench/adapter-profile';
import { latestVersion, resetReleaseCache } from './release-port.js';
import { checkVersionRange } from '../self-update/version/version-range.js';

const PROBE_CONCURRENCY = 4;

export function installedLibVersion(name: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(join(libDir(name), 'package.json'), 'utf8')) as {
      version?: unknown;
    };
    const version = parsed.version;
    return typeof version === 'string' && version.trim() !== '' ? version.trim() : undefined;
  } catch {
    return undefined;
  }
}

function stateOf(need: LibNeed, status: NeedState['status'], detail: string, extra: Partial<NeedState> = {}): NeedState {
  return {
    id: needIdOf(need),
    kind: 'lib',
    name: need.name,
    status,
    detail,
    ...extra,
  };
}

export async function probeLibs(options: {
  readonly needs: readonly LibNeed[];
  readonly seam: Seam;
  readonly force: boolean;
  readonly index?: SupplyIndex | undefined;
}): Promise<ReadonlyMap<string, NeedState>> {
  const { needs, seam, force, index } = options;
  const unique: LibNeed[] = [];
  const seen = new Set<string>();
  for (const need of needs) {
    if (seen.has(need.name)) continue;
    seen.add(need.name);
    unique.push(need);
  }
  const states = await mapWithLimit(unique, PROBE_CONCURRENCY, async (need) => {
    const source = npmSourceOf(index?.sourcesOf('lib', need.name) ?? need.sources);
    const install =
      source === undefined
        ? {}
        : { command: libInstallCommand({ need, source, ...(need.version === undefined ? {} : { version: need.version }) }) };
    const installed = installedLibVersion(need.name);
    if (installed === undefined) {
      return stateOf(need, 'missing', `共用依赖 ${need.name} 没装`, install);
    }
    if (checkVersionRange(need.version, installed) !== 'satisfied') {
      return stateOf(
        need,
        'unsatisfied',
        `装的是 ${installed}，声明要 ${need.version ?? '任意版本'}`,
        {
          installed,
          ...install,
        },
      );
    }
    const registry = source === undefined ? undefined : npmRegistryOf(source, process.env);
    const latest =
      registry === undefined || !registry.ok
        ? undefined
        : await latestVersion({ seam, name: need.name, registry: registry.value, force });
    const behind = latest !== undefined && isNewerVersion(latest, installed);
    return stateOf(
      need,
      behind ? 'outdated' : 'ok',
      behind ? `装的 ${installed}，源上最新 ${latest ?? ''}` : `${installed} 版本对`,
      {
        installed,
        ...(latest === undefined ? {} : { latest }),
        ...(behind && source !== undefined
          ? { command: libInstallCommand({ need, source, version: latest }) }
          : {}),
      },
    );
  });
  return new Map(unique.map((need, at) => [need.name, states[at]] as const));
}

export function resetLibCache(): void {
  resetReleaseCache();
}

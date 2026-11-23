import {
  flag,
  gitAddressOf,
  gitTransportCandidates,
  mapWithLimit,
  param,
} from '@dsh-workbench/shared/host';
import type {
  DiscoverProblem,
  GitTransportKind,
  MarketIndex,
  MarketIndexSource,
  MarketInstalledModule,
  MarketInstalledPayload,
  MarketSourceConfig,
} from '@dsh-workbench/shared/contract/protocol/market-index';
import { MARKET_INSTALLED_ROUTE } from '@dsh-workbench/shared/contract/protocol/market-index';
import type { RouteTable } from '@dsh-workbench/shared/host';
import type { ProfileModule } from '@dsh-workbench/shared/host';
import type { GitProbeStatus } from '@dsh-workbench/shared/contract/protocol/market-index';

export interface InstalledIndexInput {
  readonly sources: readonly MarketSourceConfig[];
  readonly cached: (source: MarketSourceConfig) => MarketIndex | undefined;
  readonly modules: readonly ProfileModule[];
  readonly dependencyOf: (pkg: string) => string | undefined;
  readonly isNewer: (latest: string, installed: string) => boolean;
  readonly probe?: ((url: string) => Promise<GitProbeStatus>) | undefined;
  readonly preferred?: ((host: string) => GitTransportKind | undefined) | undefined;
}

async function transportOf(
  source: MarketIndexSource,
  spec: string | undefined,
  probe: ((url: string) => Promise<GitProbeStatus>) | undefined,
  preferred: GitTransportKind | undefined,
): Promise<MarketIndexSource> {
  if (source.type !== 'git' || probe === undefined) return source;
  const candidates = gitTransportCandidates(source.url);
  if (candidates.length === 0) return source;
  const installed = spec === undefined ? undefined : gitAddressOf(spec);
  const first = preferred ?? installed?.kind;
  const ordered =
    first === undefined
      ? candidates
      : [...candidates].sort((left, right) => Number(right.kind === first) - Number(left.kind === first));
  for (const candidate of ordered) {
    const status = await probe(candidate.url).catch(() => 'unreachable' as const);
    if (status === 'ok') return { ...source, url: candidate.url };
  }
  return { ...source, url: ordered[0]?.url ?? source.url };
}

const TRANSPORT_CONCURRENCY = 4;

interface RowJob {
  readonly row: MarketInstalledModule;
  readonly wanted: string | undefined;
  readonly preferred: GitTransportKind | undefined;
}

export async function installedFromIndexes(
  input: InstalledIndexInput,
): Promise<readonly MarketInstalledModule[]> {
  const modules = new Map(input.modules.map((module) => [module.pkg, module] as const));
  const jobs: RowJob[] = [];
  const seen = new Set<string>();
  for (const source of input.sources) {
    const index = input.cached(source);
    if (index === undefined) continue;
    const host = gitAddressOf(source.url)?.host;
    const preferred = host === undefined ? undefined : input.preferred?.(host);
    for (const entry of index.plugins) {
      const module = modules.get(entry.name);
      const newest = entry.versions[0];
      if (module === undefined || newest === undefined || seen.has(entry.name)) continue;
      if (!input.isNewer(newest.version, module.version)) continue;
      seen.add(entry.name);
      jobs.push({
        row: {
          pkg: entry.name,
          unit: module.unit,
          version: newest.version,
          sourceId: source.id,
          sourceLabel: source.label,
          source: newest.source,
          ...(entry.metadata?.workbench === true ? { route: 'module' as const } : {}),
        },
        wanted: input.dependencyOf(entry.name),
        preferred,
      });
    }
  }
  return mapWithLimit(jobs, TRANSPORT_CONCURRENCY, async (job) => ({
    ...job.row,
    source: await transportOf(job.row.source, job.wanted, input.probe, job.preferred),
  }));
}

export interface MarketInstalledOptions {
  readonly check: boolean;
  readonly force: boolean;
}

export interface MarketInstalledPorts {
  read(): MarketInstalledPayload | Promise<MarketInstalledPayload>;
  refresh(options: MarketInstalledOptions): Promise<DiscoverProblem | undefined>;
}

export function marketInstalledRoutes(ports: MarketInstalledPorts): RouteTable {
  return {
    [MARKET_INSTALLED_ROUTE]: async (search) => {
      const options: MarketInstalledOptions = {
        check: param(search, 'check') !== '0',
        force: flag(search, 'force'),
      };
      const problem = options.check ? await ports.refresh(options) : undefined;
      return {
        ok: true,
        ...(await ports.read()),
        ...(problem === undefined ? {} : { problem }),
      };
    },
  };
}

export function transportOfSpec(spec: string): { readonly host: string; readonly kind: GitTransportKind } | undefined {
  const address = gitAddressOf(spec);
  return address === undefined ? undefined : { host: address.host, kind: address.kind };
}

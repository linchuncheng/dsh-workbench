import type { BundleVersionList, LatestUnavailable, ModuleUpdateBlock, ModuleVersion } from '@/kernel/contract/bundle-install';
import type { MarketInstalledModule } from '@/kernel/contract/market-index';
import type { NeedState, SupplySource, Translate, UnitManifest, UnitTitle } from '@dsh-workbench/shared';
import { depOnlyOutdated, supplyNeedsOf } from '@dsh-workbench/shared';
import type { InstalledPlugin } from '@/shared/api/installed-plugins';
import type { MarketNameMap } from './market-names';
import type {
  MarketHint,
  MarketNote,
  MarketRow,
  MarketRowAction,
  MarketState,
  ModuleUpdate,
} from './market-row-types';
import { updateBlockHintOf } from './market-update-block';
import type { SharedRow } from './market-shared-rows';
import { workbenchActionsOf } from './market-workbench-row';

import type { CapabilityMap } from '@/shared/hooks/use-capabilities';

export type {
  MarketHint,
  MarketHintKey,
  MarketNote,
  MarketRow,
  MarketRowAction,
  MarketState,
  ModuleUpdate,
} from './market-row-types';
export type { SharedRow, SharedState } from './market-shared-rows';
export { SHARED_DOT, SHARED_STATE_KEY, sharedActions, sharedRows } from './market-shared-rows';
type MarketDot = 'ongoing' | 'done' | 'warning' | 'idle' | 'error';

const MARKET_STATE_TABLE: Readonly<
  Record<MarketState, { readonly key: string; readonly dot: MarketDot }>
> = {
  checking: { key: 'panels.market.checking', dot: 'ongoing' },
  installed: { key: 'panels.market.installed', dot: 'done' },
  inactive: { key: 'panels.market.notActive', dot: 'warning' },
  unusable: { key: 'panels.market.notUsable', dot: 'error' },
  broken: { key: 'panels.market.broken', dot: 'error' },
  unsupported: { key: 'panels.market.pluginVersionMismatch', dot: 'warning' },
  outdated: { key: 'panels.market.moduleOutdated', dot: 'warning' },
  'older-on-disk': { key: 'panels.market.olderOnDisk', dot: 'warning' },
  'pending-restart': { key: 'panels.market.pendingRestart', dot: 'warning' },
  'pending-followup': { key: 'panels.market.pendingFollowUp', dot: 'warning' },
  missing: { key: 'panels.market.missing', dot: 'idle' },
  unchecked: { key: 'panels.market.unchecked', dot: 'idle' },
  unknown: { key: 'panels.market.unchecked', dot: 'idle' },
};

function columnOf<K extends string, T, R>(
  table: Readonly<Record<K, T>>,
  pick: (value: T) => R,
): Readonly<Record<K, R>> {
  const out: Partial<Record<K, R>> = {};
  for (const key of Object.keys(table) as K[]) out[key] = pick(table[key] as T);
  return out as Readonly<Record<K, R>>;
}

export const MARKET_STATE_KEY = columnOf(MARKET_STATE_TABLE, (value) => value.key);
export const MARKET_DOT = columnOf(MARKET_STATE_TABLE, (value) => value.dot);

export type ModuleUpdateMap = Readonly<Record<string, ModuleUpdate>>;

export function marketRowTitle(row: MarketRow, t: Translate): string {
  return row.label ?? t(row.titleKey);
}

export interface InstalledWorkbenchModule {
  readonly unit: string;
  readonly pkg: string;
  readonly installed: string;
  readonly title?: UnitTitle | undefined;
  readonly latest?: string | undefined;
  readonly latestBlocked?: ModuleUpdateBlock | undefined;
  readonly latestUnavailable?: LatestUnavailable | undefined;
  readonly local?: boolean | undefined;
  readonly refused?: readonly string[] | undefined;
  readonly clientRefused?: readonly string[] | undefined;
  readonly market?: MarketInstalledModule | undefined;
  readonly versions?: BundleVersionList | undefined;
  readonly spec?: string | undefined;
  readonly registry?: string | undefined;
}

export function withClientRefusals(
  modules: readonly InstalledWorkbenchModule[],
  refusals: readonly {
    readonly unit: string;
    readonly kind?: string | undefined;
    readonly reasons: readonly string[];
  }[],
): readonly InstalledWorkbenchModule[] {
  const refused = refusals.filter((one) => one.kind !== 'no-manifest');
  if (refused.length === 0) return modules;
  const byUnit = new Map(refused.map((one) => [one.unit, one.reasons] as const));
  return modules.map((module) => {
    const reasons = byUnit.get(module.unit);
    return reasons === undefined ? module : { ...module, clientRefused: reasons };
  });
}

export function refusalReasons(
  host: readonly string[] | undefined,
  client: readonly string[] | undefined,
): readonly string[] {
  const reported = host ?? [];
  if (reported.length > 0) return reported;
  return [...new Set(client ?? [])];
}

export function installedIdSet(
  installed: readonly InstalledWorkbenchModule[] | undefined,
): ReadonlySet<string> | null {
  if (installed === undefined) return null;
  return new Set(installed.map((item) => item.unit));
}

function latestUnavailableNote(
  unavailable: InstalledWorkbenchModule['latestUnavailable'],
): MarketNote | undefined {
  if (unavailable === 'no-registry') return { key: 'panels.market.latestNoRegistry', params: {} };
  if (unavailable === 'probe-failed') return { key: 'panels.market.latestProbeFailed', params: {} };
  return undefined;
}

export interface LatestCheckSummary {
  readonly checked: number;
  readonly unknown: number;
}

export function latestCheckSummary(
  modules: readonly InstalledWorkbenchModule[] | undefined,
): LatestCheckSummary {
  let checked = 0;
  let unknown = 0;
  for (const module of modules ?? []) {
    if (module.latest !== undefined) checked += 1;
    else if (module.latestUnavailable === 'no-registry' || module.latestUnavailable === 'probe-failed') {
      unknown += 1;
    }
  }
  return { checked, unknown };
}

export function checkedPluginCount(plugins: readonly InstalledPlugin[] | null | undefined): number {
  return (plugins ?? []).filter((plugin) => plugin.latest !== undefined).length;
}

export function installedRows(
  modules: readonly InstalledWorkbenchModule[],
  manifests: readonly UnitManifest[],
  listed: ReadonlySet<string>,
  names?: MarketNameMap | undefined,
  defaults: ReadonlySet<string> = new Set(),
  changed: Readonly<Record<string, number>> = {},
): MarketRow[] {
  const titles = new Map(
    manifests.map((manifest) => [manifest.id, manifest.titleKey] as const),
  );
  const rows: MarketRow[] = [];
  for (const module of modules) {
    if (listed.has(module.unit)) continue;
    const latest = module.local === true ? undefined : module.latest;
    const outdated = latest !== undefined && latest !== module.installed;
    const blocked = outdated ? module.latestBlocked : undefined;
    const loaded = titles.has(module.unit);
    const refused = refusalReasons(module.refused, module.clientRefused);
    const pending = !loaded && refused.length === 0;
    const titleKey = titles.get(module.unit);
    const remembered = titleKey === undefined ? names?.get(module.unit) : undefined;
    const note =
      refused.length > 0
        ? ({ key: 'panels.market.moduleRefused', params: {} } as const)
        : latestUnavailableNote(module.latestUnavailable);
    rows.push({
      id: module.unit,
      titleKey: titleKey ?? module.unit,
      ...(remembered === undefined ? {} : { label: remembered }),
      state: outdated ? 'outdated' : refused.length > 0 ? 'unusable' : pending ? 'inactive' : 'installed',
      ...(pending
        ? { hint: { key: 'panels.market.moduleRestartHint' } as const }
        : blocked === undefined
          ? {}
          : { hint: updateBlockHintOf(blocked) }),
      ...(note === undefined ? {} : { note }),
      ...(module.local === true ? { local: true } : {}),
      pkg: module.pkg,
      ...(module.spec === undefined ? {} : { spec: module.spec }),
      ...(module.registry === undefined ? {} : { registry: module.registry }),
      removeViaBundle: true,
      canInstall: false,
      canUpdate: outdated && blocked === undefined,
      canUninstall: true,
      version: { installed: module.installed, ...(latest === undefined ? {} : { latest }) },
      ...(outdated
        ? {
            moduleUpdate: {
              installed: module.installed,
              latest,
              ...(blocked === undefined ? {} : { blocked }),
              ...(module.market === undefined ? {} : { market: module.market }),
              ...(module.versions === undefined ? {} : { versions: module.versions }),
              pkg: module.pkg,
              ...(module.spec === undefined ? {} : { spec: module.spec }),
              ...(module.registry === undefined ? {} : { registry: module.registry }),
            },
          }
        : {}),
      ...(module.market === undefined ? {} : { market: module.market }),
      defaultShown: defaults.has(module.unit),
      defaultChanged: changed[module.unit] ?? 0,
    });
  }
  return rows;
}

const SWITCH_LOCKED: ReadonlySet<MarketState> = new Set(['unusable', 'broken']);

export function marketSwitchLocked(row: MarketRow): boolean {
  return SWITCH_LOCKED.has(row.state);
}

export function marketActions(row: MarketRow): MarketRowAction[] {
  if (row.workbench === true) return workbenchActionsOf(row);
  if (row.plugin === true) {
    return [
      ...(row.canUpdate ? (['update-plugin'] as const) : []),
      ...(row.canUninstall ? (['uninstall-plugin'] as const) : []),
    ];
  }
  return [
    ...(row.canInstall ? (['install'] as const) : []),
    ...(row.moduleUpdate === undefined
      ? row.canUpdate
        ? (['update'] as const)
        : []
      : row.moduleUpdate.blocked === undefined
        ? ([
            row.market === undefined || row.pkg === undefined
              ? ('update-bundle' as const)
              : ('install-version' as const),
          ])
        : []),
    ...(row.canUninstall
      ? ([row.removeViaBundle === true ? 'remove-bundle' : 'uninstall'] as const)
      : []),
  ];
}

export function updatablePlugins(rows: readonly MarketRow[]): readonly MarketRow[] {
  const updatable = rows.filter((row) => row.canUpdate === true);
  return updatable.length > 1 ? updatable : [];
}

function stateOf(
  capability: CapabilityMap[string] | undefined,
  manifest: UnitManifest,
  installed: boolean,
): MarketState {
  if (capability === undefined) {
    return installed && supplyNeedsOf(manifest).length === 0 ? 'installed' : 'unknown';
  }
  if (capability.released === true) return 'missing';
  if (capability.status === 'missing') return 'missing';
  if (capability.status === 'outdated') return 'outdated';
  if (capability.status === 'unchecked') return 'unchecked';
  if (capability.status === 'unsupported') return 'unsupported';
  if (capability.status === 'failed') return 'broken';
  return 'installed';
}

function isOutdated(capability: CapabilityMap[string] | undefined): boolean {
  if (capability?.status === 'outdated') return true;
  return capability?.needs.some((need) => need.status === 'outdated' || need.status === 'unsatisfied') === true;
}

export function capabilityOutdated(capabilities: CapabilityMap | null, unit: string): boolean {
  return isOutdated(capabilities?.[unit]);
}

function envNameOf(source: SupplySource | undefined): string {
  if (source === undefined) return '';
  if (source.kind === 'local') return source.env ?? '';
  if (source.kind === 'npm') return source.registryEnv ?? '';
  return '';
}

function noteOf(
  state: MarketState,
  capability: CapabilityMap[string] | undefined,
  manifest: UnitManifest,
): MarketNote | undefined {
  if (
    state === 'installed' ||
    state === 'inactive' ||
    state === 'pending-restart' ||
    state === 'older-on-disk'
  ) {
    return undefined;
  }
  if (state === 'unsupported') return { key: 'panels.market.runtimeVersionMismatch', params: {} };
  const problem: NeedState | undefined = capability?.needs.find((need) => need.status !== 'ok');
  if (problem === undefined) return undefined;
  if (problem.kind === 'env') return { key: 'panels.market.needEnv', params: { env: problem.name } };
  if (problem.kind === 'bin') return { key: 'panels.market.needBinary', params: { command: problem.name } };
  if (problem.kind === 'lib') return { key: 'panels.market.needLib', params: { name: problem.name } };
  if (problem.provision === 'env-missing') {
    const need = manifest.needs?.find((item) => item.kind === 'extension' && item.name === problem.name);
    const source = need?.kind === 'extension' ? need.sources?.find((item) => envNameOf(item) !== '') : undefined;
    return { key: 'panels.market.needEnv', params: { env: envNameOf(source) } };
  }
  if (problem.provision === 'not-declared') return { key: 'panels.market.noSource', params: {} };
  if (problem.provision === 'malformed') return { key: 'panels.market.badSource', params: {} };
  return undefined;
}

function isOnMachine(state: MarketState): boolean {
  return (
    state === 'installed' ||
    state === 'outdated' ||
    state === 'older-on-disk' ||
    state === 'pending-restart' ||
    state === 'inactive' ||
    state === 'unusable' ||
    state === 'broken'
  );
}

export function marketCatalog(
  manifests: readonly UnitManifest[],
  installable: ReadonlySet<string> | null | undefined,
): readonly UnitManifest[] {
  if (installable === undefined || installable === null) {
    return manifests.filter((manifest) => supplyNeedsOf(manifest).length > 0);
  }
  return manifests.filter((manifest) => installable.has(manifest.id));
}

export function liveManifests(
  manifests: readonly UnitManifest[],
  capabilities: CapabilityMap | null,
  installed: ReadonlySet<string> | null,
): readonly UnitManifest[] {
  if (capabilities === null || installed === null) return manifests;
  const gone = new Set(
    marketRows(manifests, capabilities)
      .filter(
        (row) =>
          !installed.has(row.id) &&
          marketActions(row).length === 0 &&
          (row.state === 'unknown' || row.state === 'unchecked'),
      )
      .map((row) => row.id),
  );
  if (gone.size === 0) return manifests;
  return manifests.filter((manifest) => !gone.has(manifest.id));
}

export function marketHasUpdates(rows: readonly MarketRow[], shared: readonly SharedRow[] = []): boolean {
  return (
    rows.some((row) =>
      row.moduleUpdate === undefined
        ? row.state === 'outdated' || row.staleDeps !== undefined
        : row.moduleUpdate.blocked === undefined,
    ) ||
    shared.some((row) => row.state === 'outdated' || row.state === 'unsatisfied')
  );
}

export function marketUpdatesOf(
  modules: readonly ModuleVersion[] | null,
): ModuleUpdateMap {
  if (modules === null) return {};
  const next: Record<string, ModuleUpdate> = {};
  for (const module of modules) {
    const local = module.local === true;
    next[module.unit] = {
      installed: module.installed,
      ...(local || module.latest === undefined ? {} : { latest: module.latest }),
      ...(local || module.latest === undefined || module.latestBlocked === undefined
        ? {}
        : { blocked: module.latestBlocked }),
      ...(local ? { local: true } : {}),
      ...(local || module.market === undefined ? {} : { market: module.market }),
      pkg: module.pkg,
      ...(module.spec === undefined ? {} : { spec: module.spec }),
      ...(module.registry === undefined ? {} : { registry: module.registry }),
    };
  }
  return next;
}

export interface MarketSection {
  readonly id: 'installed' | 'not-installed';
  readonly titleKey: string;
  readonly rows: readonly MarketRow[];
}

export function marketOrder(
  rows: readonly MarketRow[],
  titleOf: (row: MarketRow) => string,
): MarketRow[] {
  return [...rows].sort((left, right) => {
    const byTitle = titleOf(left).localeCompare(titleOf(right), 'zh-Hans-CN');
    return byTitle === 0 ? left.id.localeCompare(right.id) : byTitle;
  });
}

export function marketSections(rows: readonly MarketRow[]): MarketSection[] {
  const installed = rows.filter((row) => isOnMachine(row.state));
  const rest = rows.filter((row) => !isOnMachine(row.state));
  return [
    ...(installed.length === 0
      ? []
      : [{ id: 'installed' as const, titleKey: 'panels.market.sectionInstalled', rows: installed }]),
    ...(rest.length === 0
      ? []
      : [{ id: 'not-installed' as const, titleKey: 'panels.market.sectionPending', rows: rest }]),
  ];
}

export function checkingRows(
  rows: readonly MarketRow[],
  scope: { readonly all: boolean; readonly units: ReadonlySet<string> },
): MarketRow[] {
  return rows.map((row) => {
    if (row.state !== 'unknown' && row.state !== 'unchecked') return row;
    if (!scope.all && !scope.units.has(row.id)) return row;
    return { ...row, state: 'checking', hint: undefined, note: undefined };
  });
}

export function marketRows(
  manifests: readonly UnitManifest[],
  capabilities: CapabilityMap | null,
  updates: ModuleUpdateMap = {},
  defaults: ReadonlySet<string> = new Set(),
  changed: Readonly<Record<string, number>> = {},
  held: ReadonlySet<string> = new Set(),
): MarketRow[] {
  const rows: MarketRow[] = [];
  for (const manifest of manifests) {
    const capability = capabilities?.[manifest.id];
    const install = capability?.needs.some((need) => need.provision === 'ready') === true;
    const installDeclared = capability?.needs.some((need) => need.provision !== undefined) === true;
    const entry = updates[manifest.id];
    const local = entry?.local === true;
    const state: MarketState =
      capabilities === null ? 'checking' : stateOf(capability, manifest, entry !== undefined);
    const onMachine = isOnMachine(state);
    const reAdopt = capability?.released === true && !installDeclared;

    const moduleUpdate =
      entry === undefined || entry.latest === undefined || entry.latest === entry.installed
        ? undefined
        : {
            installed: entry.installed,
            latest: entry.latest,
            ...(entry.blocked === undefined ? {} : { blocked: entry.blocked }),
            ...(entry.market === undefined ? {} : { market: entry.market }),
            ...(entry.pkg === undefined ? {} : { pkg: entry.pkg }),
            ...(entry.spec === undefined ? {} : { spec: entry.spec }),
            ...(entry.registry === undefined ? {} : { registry: entry.registry }),
          };
    const staleAll = (capability?.needs ?? []).filter(
      (need) => (need.kind === 'extension' || need.kind === 'lib') && need.status === 'outdated',
    );
    const staleDeps = staleAll.map((need) => need.name).filter((name) => !held.has(name));
    const depsOnly =
      moduleUpdate === undefined && capability !== undefined && depOnlyOutdated(capability);
    const shown: MarketState =
      moduleUpdate === undefined ? (depsOnly ? 'installed' : state) : 'outdated';
    const note = noteOf(shown, capability, manifest);
    const hint: MarketHint | undefined =
      moduleUpdate?.blocked === undefined
        ? shown === 'unknown' || shown === 'unchecked'
          ? { key: 'panels.market.uncheckedHint' }
          : undefined
        : updateBlockHintOf(moduleUpdate.blocked);
    rows.push({
      id: manifest.id,
      titleKey: manifest.titleKey,
      state: shown,
      canInstall: !depsOnly && state !== 'installed' && (install || reAdopt),
      canUpdate: onMachine && isOutdated(capability),
      canUninstall: onMachine,
      ...(staleDeps.length === 0 ? {} : { staleDeps: staleDeps.length }),
      ...(hint === undefined ? {} : { hint }),
      ...(entry === undefined
        ? {}
        : { version: { installed: entry.installed, ...(entry.latest === undefined ? {} : { latest: entry.latest }) } }),
      ...(moduleUpdate === undefined ? {} : { moduleUpdate }),
      ...(entry?.market === undefined ? {} : { market: entry.market }),
      ...(entry?.pkg === undefined
        ? entry?.market === undefined
          ? {}
          : { pkg: entry.market.pkg }
        : { pkg: entry.pkg }),
      ...(entry?.spec === undefined ? {} : { spec: entry.spec }),
      ...(entry?.registry === undefined ? {} : { registry: entry.registry }),
      ...(entry?.market === undefined ? {} : { removeViaBundle: true }),
      ...(moduleUpdate === undefined ? (note === undefined ? {} : { note }) : {}),
      ...(local ? { local: true } : {}),
      defaultShown: defaults.has(manifest.id),
      defaultChanged: changed[manifest.id] ?? 0,
    });
  }
  return rows;
}

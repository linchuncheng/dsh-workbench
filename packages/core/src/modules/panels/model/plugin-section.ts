import {
  OPENCLI_PIN,
  OPENCLI_PIN_ENV,
  checkVersionRange,
  pluginFieldAt,
  requireSupply,
  runtimePinOf,
  param,
  mapWithLimit,
  type RouteTable,
  type Seam,
  type SupplyPort,
} from '@dsh-workbench/shared/host';
import type { InstalledPlugin, InstalledPluginsPayload } from '@/shared/api/installed-plugins';
import { INSTALLED_PLUGINS_ROUTE } from '@/shared/api/installed-plugins';
import type { PluginLedger } from './plugin-ledger';
import { pluginDirOf, pluginOnDisk } from './plugin-name';

const PLUGIN_PROBE_CONCURRENCY = 4;

export async function installedPlugins(options: {
  readonly ledger: PluginLedger;
  readonly runtimeLabel?: string | undefined;
  readonly runtimeField?: string | undefined;
  readonly seam?: Seam | undefined;
  readonly force?: boolean;
  readonly check?: boolean;
  readonly prereleaseChannels?: readonly string[];
  readonly supply?: SupplyPort | undefined;
}): Promise<readonly InstalledPlugin[]> {
  const { ledger, seam, force = false, check = true, prereleaseChannels = [] } = options;
  const supply = options.supply ?? requireSupply();
  const runtime = runtimePinOf(OPENCLI_PIN, OPENCLI_PIN_ENV);
  const runtimeProblemOf = (entry: {
    readonly package: string;
    readonly local?: boolean | undefined;
    readonly name?: string | undefined;
  }): { readonly label: string; readonly need: string; readonly have: string } | undefined => {
    const manifest = options.ledger.pluginFiles?.manifest ?? '';
    if (manifest === '') return undefined;
    const field = options.runtimeField ?? '';
    if (field === '') return undefined;
    const range = pluginFieldAt(pluginDirOf(entry, options.ledger.pluginFiles), manifest, field);
    if (range === undefined) return undefined;
    return checkVersionRange(range, runtime) === 'unsatisfied'
      ? { label: options.runtimeLabel ?? '', need: range, have: runtime }
      : undefined;
  };
  const entries = ledger.list();
  const rows = await mapWithLimit(entries, PLUGIN_PROBE_CONCURRENCY, async (entry) => {
    const runtimeProblem = runtimeProblemOf(entry);
    const release =
      seam === undefined || entry.local === true || entry.registry === undefined
        ? undefined
        : await supply.probeRelease({
            seam,
            package: entry.package,
            registry: entry.registry,
            force,
            check,
            prereleaseChannels,
          });
    return {
      pkg: entry.package,
      ...(entry.name === undefined ? {} : { name: entry.name }),
      ...(release === undefined
        ? {}
        : {
            installed: release.installed,
            ...(release.latest === undefined ? {} : { latest: release.latest }),
          }),
      ...(entry.local === true ? { local: true } : {}),
      ...(entry.registry === undefined ? {} : { registry: entry.registry }),
      ...(entry.installedAt === undefined ? {} : { installedAt: entry.installedAt }),
      ...(pluginOnDisk(entry, ledger.pluginFiles) ? {} : { broken: true }),
      ...(runtimeProblem === undefined ? {} : { runtimeProblem }),
    } satisfies InstalledPlugin;
  });
  return rows;
}

export function pluginRoutes(options: {
  readonly ledger: PluginLedger;
  readonly runtimeLabel?: string | undefined;
  readonly runtimeField?: string | undefined;
  readonly seam?: Seam | undefined;
  readonly prereleaseChannels?: (() => readonly string[]) | undefined;
  readonly supply?: SupplyPort | undefined;
}): RouteTable {
  return {
    [INSTALLED_PLUGINS_ROUTE]: async (search) => {
      const plugins = await installedPlugins({
        ledger: options.ledger,
        ...(options.runtimeLabel === undefined ? {} : { runtimeLabel: options.runtimeLabel }),
        ...(options.runtimeField === undefined ? {} : { runtimeField: options.runtimeField }),
        ...(options.seam === undefined ? {} : { seam: options.seam }),
        ...(options.supply === undefined ? {} : { supply: options.supply }),
        force: param(search, 'force') === '1',
        check: param(search, 'check') !== '0',
        prereleaseChannels: options.prereleaseChannels?.() ?? [],
      });
      const payload: InstalledPluginsPayload = { plugins };
      return { ok: true, ...payload };
    },
  };
}

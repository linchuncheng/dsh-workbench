import { installedPluginRows } from './market-plugin-rows';
import type { InstalledPlugin } from '@/shared/api/installed-plugins';
import type { MarketRow } from './market-row-types';

export interface MarketPluginRead {
  readonly source: readonly InstalledPlugin[] | null;
  readonly rows: readonly MarketRow[];
  readonly held: ReadonlySet<string>;
}

export function marketPluginReadOf(
  source: readonly InstalledPlugin[] | null,
  byDefault: ReadonlySet<string>,
  changed: Readonly<Record<string, number>>,
): MarketPluginRead {
  const rows = installedPluginRows(source ?? [], byDefault, changed);
  const held = new Set(
    rows.flatMap((row) => (row.pkg === undefined ? [] : [row.pkg, row.label ?? row.pkg])),
  );
  return { source, rows, held };
}

export function marketNothingOf(
  shown: readonly MarketRow[],
  self: MarketRow | undefined,
  installedList: readonly MarketRow[],
  pluginList: readonly MarketRow[],
): boolean {
  return shown.length === 0 && self === undefined && installedList.length === 0 && pluginList.length === 0;
}

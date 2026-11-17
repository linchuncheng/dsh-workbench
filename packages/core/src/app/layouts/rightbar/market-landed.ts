import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import type { MarketRow } from './market-row-types';
import type { SharedRow } from './market-shared-rows';
import type { Pending } from './market-view-text';
import { pendingLanded } from './market-view-text';

export function marketLandedOf(input: {
  readonly pending: Pending | null;
  readonly updates: Parameters<typeof pendingLanded>[1];
  readonly capabilities: CapabilityMap | null;
  readonly installedVersion: string | undefined;
  readonly shared: readonly SharedRow[];
  readonly pluginSource: readonly unknown[] | null;
  readonly pluginList: readonly MarketRow[];
  readonly installed: readonly { readonly unit: string }[] | undefined;
}): boolean {
  return pendingLanded(
    input.pending,
    input.updates,
    input.capabilities,
    input.installedVersion,
    input.shared,
    input.pluginSource === null ? null : input.pluginList,
    {
      units: input.installed === undefined ? null : new Set(input.installed.map((one) => one.unit)),
      plugins: input.pluginSource === null ? null : new Set(input.pluginList.map((row) => row.id)),
    },
  );
}

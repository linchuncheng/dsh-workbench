import type { Need } from '@dsh-workbench/shared';
import type { InstalledModule } from '@dsh-workbench/shared/host';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import { pendingBuildsOfError } from './market-pending-builds';
import type { BundleSupply, MarketEntry, SupplyInstallOptions } from './market-types';

export interface SupplyAfterDeps {
  readonly declaredNeeds: (unit: string) => readonly Need[] | undefined;
  readonly install: (unit: string, options?: SupplyInstallOptions) => Promise<MarketEntry>;
}

export function createSupplyAfter(deps: SupplyAfterDeps) {
  return async (
    module: InstalledModule,
    change: BundleChange,
    options?: SupplyInstallOptions,
  ): Promise<BundleSupply> => {
    if (module.kind !== 'module') return { state: 'not-a-module' };
    const declared = deps.declaredNeeds(module.unit);
    if (declared === undefined) {
      return change.application === 'restart-required' ? { state: 'pending-restart' } : { state: 'no-needs' };
    }
    const needs = declared.filter((need) => need.kind === 'extension' || need.kind === 'lib').length;
    if (needs === 0) return { state: 'no-needs' };
    try {
      return { state: 'installed', entry: await deps.install(module.unit, options) };
    } catch (error) {
      const pending = pendingBuildsOfError(error);
      return {
        state: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        ...(pending === undefined ? {} : { pendingBuilds: pending }),
      };
    }
  };
}

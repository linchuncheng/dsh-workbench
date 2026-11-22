import type { BundleManager, InstalledModule, ProfileReload, Seam, SupplyPort } from '@dsh-workbench/shared/host';
import { syncModuleRows } from '@/shared/api/host/module-rows-sync';
import type { SyncRowsSnapshot } from './market-route';
import type { InstallRunner } from './market-install-run';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import type { RegistryFixDeps } from './market-registry';
import { rememberInstalledSource } from './market-registry';
import { removeDshBundle } from './market-remove';
import type { ReplaceBundleDeps } from './market-route';
import type { PluginLedger } from './plugin-ledger';

export interface RouteDepsInput {
  readonly manager: BundleManager;
  readonly command: string;
  readonly supply: SupplyPort;
  readonly runAll: InstallRunner['runAll'];
  readonly outputOf?: (() => string) | undefined;
  readonly registryFix: RegistryFixDeps;
  readonly supplyAfter: (module: InstalledModule, change: BundleChange) => Promise<never> | Promise<unknown>;
  readonly profileDir?: string | null | undefined;
  readonly seam?: Seam | undefined;
  readonly installed?: ((pkg: string) => InstalledModule) | undefined;
  readonly ledger?: PluginLedger | undefined;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
  readonly reconcile?: ((rows: readonly string[]) => Promise<ProfileReload>) | undefined;
  readonly modules?: (() => readonly { readonly pkg: string }[]) | undefined;
}

export function syncModuleRowsOf(
  profileDir: string | null | undefined,
  supply: Pick<SupplyPort, 'profileModules'>,
): () => SyncRowsSnapshot | undefined {
  return () => {
    if (profileDir === undefined || profileDir === null) return undefined;
    return syncModuleRows({ profileDir, modules: supply.profileModules(profileDir) });
  };
}

export function routeDepsOf(input: RouteDepsInput): ReplaceBundleDeps {
  const { manager, profileDir, registryFix, logger } = input;
  return {
    manager,
    command: input.command,
    supply: input.supply,
    runAll: input.runAll,
    ...(input.outputOf === undefined ? {} : { outputOf: input.outputOf }),
    profileDir,
    syncRows: syncModuleRowsOf(profileDir, input.supply),
    modules: () => input.supply.profileModules?.(profileDir ?? null) ?? [],
    rememberSource: (manager, pkg, registry, version) =>
      rememberInstalledSource(registryFix, manager, pkg, registry, version),
    supplyAfter: input.supplyAfter as ReplaceBundleDeps['supplyAfter'],
    remove: (pkg) =>
      removeDshBundle({ manager, pkg, profileDir, registryFix, ...(logger === undefined ? {} : { logger }) }),
    ...(input.seam === undefined ? {} : { seam: input.seam }),
    ...(input.installed === undefined ? {} : { installed: input.installed }),
    ...(input.reconcile === undefined ? {} : { reconcile: input.reconcile }),
    ...(input.ledger === undefined ? {} : { ledger: input.ledger }),
    ...(logger === undefined ? {} : { logger }),
  };
}

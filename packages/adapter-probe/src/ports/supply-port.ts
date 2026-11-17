import type { Seam, SupplyPort } from '@dsh-workbench/shared/host';
import { cliCatalogPath, detachLibsOpencliPeer, ensureLibsBinOnPath, ensureLibsOpencliPeer, isolatedHome, libInstallCommand, libUninstallCommand, vendorPluginsDir } from '@dsh-workbench/adapter-runtime';
import { isolatedRoot } from '@dsh-workbench/adapter-runtime';

import { createRegistryNotebook, isNewerVersion } from '@dsh-workbench/adapter-profile';
import { latestVersion, missingReleaseParts, probeRelease } from '../probe/release-port.js';
import { opencliInstallCommand } from '../install/install.js';
import { startSelfUpdate } from '../self-update/self-update.js';
import { selfUpdateCliFor } from '../self-update/self-update-cli.js';
import { recoveryCommand, type SelfUpdateRequest } from '../self-update/self-update-plan.js';
import {
  declarationGaps,
  declarationRefusalOf,
  moduleDeclarationOf,
  packageRouteOf,
  pathDeclarationOf,
  pluginInstallPlan,
  profileDirOf,
  profileModules,
  readInstalledModule,
  readProfilePackage,
  registryDeclarationOf,
  resolvePluginSource,
  splitNpmSpec,
} from '@dsh-workbench/adapter-supply';
import { PLUGIN_ID, readBundleManager, refusalReason } from '@dsh-workbench/shared/host';
import { OPENCLI_MANIFEST_FILE, OPENCLI_RUNTIME_FIELD } from '@dsh-workbench/adapter-runtime';

export interface ProbeSupplyOptions {
  readonly seam?: Seam | undefined;
}

export function createSupplyPort(options: ProbeSupplyOptions = {}): SupplyPort {
  const seam = options.seam;
  const port = {
    isolatedRoot,
    isolatedHome,
    pluginPackagePrefix: () => 'opencli-plugin-',
    pluginManifestFile: () => OPENCLI_MANIFEST_FILE,
    pluginRuntimeField: () => OPENCLI_RUNTIME_FIELD,
    cliCatalogPath,
    vendorPluginsDir,
    runtimeInstallCommand: opencliInstallCommand,
    beforeLibInstall() {
      detachLibsOpencliPeer();
    },
    afterLibInstall() {
      ensureLibsOpencliPeer();
      ensureLibsBinOnPath();
    },
    profileDirOf,
    profileModules,
    readBundleManager,
    refusalReason,
    readInstalledModule,
    readProfilePackage,
      createRegistryNotebook,
    declarationGaps,
    moduleDeclarationOf,
    registryDeclarationOf,
    pathDeclarationOf,
    declarationRefusalOf,
      latestVersion,
    missingReleaseParts,
    isNewerVersion,
    pluginInstallPlan,
    packageRouteOf,
    probeRelease,
    resolvePluginSource,
    splitNpmSpec,
    libInstallCommand,
    libUninstallCommand,
    recoveryCommand: (options: { readonly profile: string; readonly version: string }) =>
      recoveryCommand({ profile: options.profile, pkg: PLUGIN_ID, version: options.version, cli: selfUpdateCliFor(options.profile) }),
    startSelfUpdate: (request: SelfUpdateRequest, onError: (message: string) => void) =>
      startSelfUpdate(request, onError, seam),
  };
  return { ...port, env: port, modules: port };
}

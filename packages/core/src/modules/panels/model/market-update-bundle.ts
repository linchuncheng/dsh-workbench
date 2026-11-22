import { join } from 'node:path';
import type { BundleManager, Seam, SupplyPort } from '@dsh-workbench/shared/host';
import { PLUGIN_ID, hasModuleRow, profileBundlesOf, quoteShellArg, requireSupply, storeMismatchIn } from '@dsh-workbench/shared/host';
import type { InstalledModule, ProfileModule } from '@dsh-workbench/shared/host';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import { approveBuildsOrProblem } from './market-pending-builds';
import { replaceRouted, type ReplaceBundleDeps } from './market-route';
import { verifyBundleUpdate } from './market-verify';
import { swapExternally } from './market-swap-stuck';
import type { BundleInstallOutcome } from './market-types';

export interface BundleUpdateDeps {
  readonly modules: (() => readonly ProfileModule[]) | undefined;
  readonly installed: ((pkg: string) => InstalledModule) | undefined;
  readonly seam: Seam | undefined;
  readonly manager: BundleManager;
  readonly routeDeps: ReplaceBundleDeps;
  readonly sweep: () => Promise<void>;
  readonly refreshSupply: (unit: string) => Promise<void>;
  readonly logger?: { warn?(message: string): void } | undefined;
  readonly supply?: SupplyPort | undefined;
  readonly profile?: string | undefined;
  readonly profileDir?: string | null | undefined;
  readonly dshHome?: string | undefined;
  readonly profileName?: string | undefined;
  readonly prereleaseChannels?: (() => readonly string[]) | undefined;
  readonly approvedBuilds?: readonly string[] | undefined;
  readonly buildPolicyDirs?: readonly string[] | undefined;
  readonly swapWaitMs?: number | undefined;
  readonly swapPollMs?: number | undefined;
}

const SHIPPED_APPLICATIONS: ReadonlySet<string> = new Set(['applied', 'restart-required', 'overridden']);

function stillStuck(change: BundleChange, after: InstalledModule, before: string | undefined): boolean {
  if (!SHIPPED_APPLICATIONS.has(change.application)) return true;
  return before !== undefined && after.kind === 'module' && after.version === before;
}

function remedyOf(
  deps: BundleUpdateDeps,
  change: BundleChange,
  before: string | undefined,
  afterVersion: string | undefined,
  spec: string,
): { readonly command: string } | undefined {
  const name = deps.profileName ?? deps.profile;
  if (name === undefined) return undefined;
  const stuck = !SHIPPED_APPLICATIONS.has(change.application);
  const unchanged = before !== undefined && afterVersion === before;
  if (!stuck && !unchanged) return undefined;
  const add = `dsh plugin --profile ${name} add ${quoteShellArg(spec)}`;
  if (!storeMismatchIn(`${change.errorCode ?? ''} ${change.errorDetail ?? ''}`)) {
    return { command: add };
  }
  const dir = deps.profileDir;
  if (dir === undefined || dir === null) return { command: add };
  return { command: `rm -rf ${quoteShellArg(join(dir, 'node_modules'))} && ${add}` };
}

async function restoreRemovedBundle(
  pkg: string,
  before: string | undefined,
  registry: string | undefined,
  deps: BundleUpdateDeps,
): Promise<string | undefined> {
  if (before === undefined) return undefined;
  try {
    const change = await deps.manager.install({
      spec: `${pkg}@${before}`,
      ...(registry === undefined ? {} : { registry }),
    });
    const back = deps.installed?.(pkg) ?? { kind: 'unknown', pkg };
    if (change !== null && back.kind === 'module' && back.version === before) {
      deps.logger?.warn?.(`[dsh-workbench] ${pkg} 更新后读不到它了 —— 已把 ${before} 装回去`);
      return before;
    }
    deps.logger?.warn?.(`[dsh-workbench] ${pkg} 更新后读不到它了，装回 ${before} 也没成`);
  } catch (error) {
    deps.logger?.warn?.(
      `[dsh-workbench] ${pkg} 更新后读不到它了，装回 ${before} 失败：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return undefined;
}

function bundleDropped(deps: BundleUpdateDeps, pkg: string): boolean {
  const dir = deps.profileDir;
  if (dir === undefined || dir === null) return false;
  try {
    return !profileBundlesOf(dir).includes(pkg);
  } catch {
    return false;
  }
}

async function reEnableBundle(pkg: string, deps: BundleUpdateDeps): Promise<boolean> {
  if (!bundleDropped(deps, pkg)) return false;
  if (deps.manager.setEnabled === undefined) return false;
  const change = await deps.manager.setEnabled(pkg, true).catch(() => null);
  const back = !bundleDropped(deps, pkg);
  deps.logger?.warn?.(
    back
      ? `[dsh-workbench] ${pkg} 更新后从 profile 名单里掉了 —— 已把它那一行放回去，重启后生效`
      : `[dsh-workbench] ${pkg} 更新后从工作台配置的名单中移除；恢复失败（${change?.errorCode ?? '原因未识别'}）`,
  );
  return back;
}

export async function updateModuleBundle(
  unit: string,
  deps: BundleUpdateDeps,
): Promise<BundleInstallOutcome | null> {
  const supply = deps.supply ?? requireSupply();
  const problem = approveBuildsOrProblem(deps.approvedBuilds, [
    deps.profileDir,
    ...(deps.buildPolicyDirs ?? []),
  ]);
  if (problem !== undefined) throw new Error(problem);
  const found = (deps.modules?.() ?? []).find((item) => item.unit === unit);
  if (found === undefined) return null;
  if (found.local === true) {
    throw new Error(`这份模块装的是本地那一份（${found.pkg}），不从源上更新 —— 要更新先把它换成源上的版本。`);
  }
  const pkg = found.pkg;
  const before = found.version;
  const read = deps.installed?.(pkg) ?? { kind: 'unknown', pkg };
  const registry = read.kind === 'module' ? read.registry : undefined;
  const latest =
    deps.seam === undefined || registry === undefined
      ? undefined
      : await supply.latestVersion({
          seam: deps.seam,
          name: pkg,
          registry,
          force: true,
          prereleaseChannels: deps.prereleaseChannels?.() ?? [],
        });
  if (latest !== undefined && supply.isNewerVersion(before, latest)) return null;
  if (latest !== undefined && deps.seam !== undefined && registry !== undefined) {
    const declared = await supply.registryDeclarationOf({
      seam: deps.seam,
      name: pkg,
      registry,
      force: true,
    });
    if (declared !== undefined && supply.declarationRefusalOf(pkg, declared).length > 0) {
      throw new Error('源上的新版和当前这一版工作台不匹配 —— 先升级工作台，再更新这个模块。');
    }
  }
  const spec = latest === undefined ? pkg : `${pkg}@${latest}`;
  const rowModule =
    deps.profileDir !== undefined && deps.profileDir !== null && hasModuleRow(deps.profileDir, pkg);
  const target =
    deps.seam === undefined || registry === undefined
      ? undefined
      : await supply.packageRouteOf({ spec, seam: deps.seam, registry });
  const delegated =
    !rowModule &&
    target?.kind !== 'dsh-module' &&
    latest !== undefined &&
    registry !== undefined &&
    found.fromRegistry !== false &&
    deps.manager.updateBundle !== undefined
      ? await deps.manager.updateBundle(pkg, latest, { registry }).catch(() => null)
      : null;
  const forwarded = delegated !== null && delegated.change.errorCode !== 'invalid-spec' ? delegated : null;
  const base: BundleInstallOutcome =
    forwarded === null
      ? await replaceRouted(deps.routeDeps, spec, {
          ...(registry === undefined ? {} : { registry }),
          ...(deps.approvedBuilds === undefined ? {} : { approvedBuilds: deps.approvedBuilds }),
        })
      : {
          change: forwarded.change,
          module: deps.installed?.(pkg) ?? { kind: 'unknown', pkg },
          supply: { state: 'no-needs' },
          ...(forwarded.restore?.version === undefined ? {} : { restored: forwarded.restore.version }),
        };
  await deps.sweep();
  const readAfter = deps.installed?.(pkg) ?? { kind: 'unknown', pkg };
  const restored =
    readAfter.kind === 'module'
      ? base.restored
      : (base.restored ?? (await restoreRemovedBundle(pkg, before, registry, deps)));
  if (readAfter.kind === 'module' && forwarded !== null) await reEnableBundle(pkg, deps);
  let after = deps.installed?.(pkg) ?? { kind: 'unknown', pkg };
  const verified = verifyBundleUpdate({
    change: base.change,
    before,
    after,
    ...(restored === undefined ? {} : { restored }),
  });
  let change = verified.change;
  let restoredVersion = verified.restored;
  const precheckRefused = forwarded !== null && forwarded.step === 'check';
  const swap =
    !precheckRefused &&
    pkg === PLUGIN_ID &&
    stillStuck(change, after, before) &&
    before !== undefined &&
    deps.dshHome !== undefined &&
    deps.profileName !== undefined
      ? await swapExternally(
          {
            supply,
            installed: deps.installed,
            dshHome: deps.dshHome,
            profile: deps.profileName,
            ...(deps.logger === undefined ? {} : { logger: deps.logger }),
            ...(deps.swapWaitMs === undefined ? {} : { waitMs: deps.swapWaitMs }),
            ...(deps.swapPollMs === undefined ? {} : { pollMs: deps.swapPollMs }),
          },
          { pkg, from: before, to: latest ?? '', pinned: latest !== undefined },
        )
      : undefined;
  if (swap !== undefined) {
    const swapVersion = swap.kind === 'module' ? swap.version : '';
    after = swap;
    restoredVersion = undefined;
    change = {
      application: 'restart-required',
      stage: 'install',
      changed: true,
      target: pkg,
      bundle: pkg,
      ...(swapVersion === '' ? {} : { version: swapVersion }),
    };
  }
  await deps.refreshSupply(unit).catch(() => undefined);
  const remedy = stillStuck(change, after, before)
    ? remedyOf(deps, change, before, after.kind === 'module' ? after.version : undefined, spec)
    : undefined;
  return {
    ...base,
    change,
    module: after,
    ...(restoredVersion === undefined ? {} : { restored: restoredVersion }),
    ...(remedy === undefined ? {} : { remedy }),
  };
}

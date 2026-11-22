import type { BundleManager, InstallFailure, InstalledModule, PluginPlanStep, Seam } from '@dsh-workbench/shared/host';
import type { BundleChange, BundleInstalledPlugin } from '@/kernel/contract/bundle-install';
import {
  approveBuilds, declaresDshBundle, hostCommandStep, marketSpecPackage, PlanCancelledError, PlanStepError, planStepText,
  profileBundlesOf,
  profilePnpmCommand, quoteShellArg, recordPendingBuilds, refusalReason, splitNpmSpec, WorkbenchDataError,
} from '@dsh-workbench/shared/host';
import { requireSupply, localDirOf, type SupplyPort } from '@dsh-workbench/shared/host';
import { sourceProblemText } from './market-dependency';
import { pluginNameOf, type PluginFiles } from './plugin-name';
import type { PluginLedger } from './plugin-ledger';
import type { BundleInstallOptions, BundleInstallOutcome, BundleSupply } from './market-types';

export interface BundleInstallDeps {
  readonly spec: string;
  readonly options?: BundleInstallOptions | undefined;
  readonly registry?: string | undefined;
  readonly command: string;
  readonly seam?: Seam | undefined;
  readonly supply?: SupplyPort | undefined;
  readonly manager: BundleManager;
  readonly installed?: ((pkg: string) => InstalledModule) | undefined;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
  readonly ledger?: PluginLedger | undefined;
  readonly runAll: (steps: readonly PluginPlanStep[], options?: { readonly signal?: AbortSignal | undefined }) => Promise<void>;
  readonly supplyAfter: (module: InstalledModule, change: BundleChange) => Promise<BundleSupply>;
  readonly rememberSource: (
    manager: BundleManager,
    pkg: string,
    registry: string | undefined,
    version?: string | undefined,
  ) => Promise<void>;
  readonly remove?: ((pkg: string) => Promise<BundleChange>) | undefined;
  readonly profileDir?: string | null | undefined;
  readonly syncRows?: (() => void) | undefined;
  readonly outputOf?: (() => string) | undefined;
}

function moduleInstallLine(options: {
  readonly spec: string;
  readonly profileDir: string;
  readonly registry?: string | undefined;
}): string {
  const pnpm = profilePnpmCommand(options.profileDir);
  const prefix = [pnpm.command, ...pnpm.args].map(quoteShellArg).join(' ');
  const store = pnpm.storeDir === undefined ? '' : ` --store-dir ${quoteShellArg(pnpm.storeDir)}`;
  const registry = options.registry === undefined ? '' : ` --registry ${quoteShellArg(options.registry)}`;
  return `${prefix} add --dir ${quoteShellArg(options.profileDir)} ${quoteShellArg(options.spec)} --save-exact${store}${registry}`;
}

export function bundleNameOf(change: BundleChange, spec: string): string {
  if (change.bundle !== undefined && change.bundle !== '') return change.bundle;
  const inPath = marketSpecPackage(spec);
  if (inPath !== undefined) return inPath;
  const version = spec.lastIndexOf('@');
  return version > 0 ? spec.slice(0, version) : spec;
}

function installedPluginName(spec: string, pkg: string, files: PluginFiles | undefined): string | undefined {
  const local = localDirOf(spec);
  return pluginNameOf(local === undefined ? { package: pkg } : { package: local, local: true }, files);
}

function outcomeOf(
  deps: BundleInstallDeps,
  pkg: string,
  change: BundleChange,
  plugin?: BundleInstalledPlugin,
): BundleInstallOutcome {
  return {
    change,
    module: deps.installed?.(pkg) ?? { kind: 'unknown', pkg },
    supply: { state: 'no-needs' },
    ...(plugin === undefined ? {} : { plugin }),
  };
}

function failureCommandOf(failure: unknown): string | undefined {
  if (typeof failure !== 'object' || failure === null) return undefined;
  const command = (failure as { readonly command?: unknown }).command;
  return typeof command === 'string' && command !== '' ? command : undefined;
}

function failureDetailOf(error: unknown): string {
  const lines: string[] = [];
  const message = error instanceof Error ? error.message : '';
  if (message !== '') lines.push(message);
  if (error instanceof WorkbenchDataError) {
    const command = failureCommandOf(error.failure);
    if (command !== undefined) lines.push(command);
    if (error.detail !== undefined && error.detail !== '') lines.push(error.detail);
  }
  if (lines.length === 0) lines.push(String(error));
  return lines.join('\n');
}

function outputOfError(error: unknown): string {
  const failure = error instanceof WorkbenchDataError ? error.failure : undefined;
  const record = typeof failure === 'object' && failure !== null ? (failure as Record<string, unknown>) : {};
  return [failureDetailOf(error), typeof record['output'] === 'string' ? record['output'] : ''].join('\n');
}

function routedCancelled(deps: BundleInstallDeps, pkg: string): BundleInstallOutcome {
  return outcomeOf(deps, pkg, { application: 'cancelled', stage: 'install', changed: false, target: pkg });
}

function routedFailure(
  deps: BundleInstallDeps,
  pkg: string,
  errorDetail: string,
  pendingBuilds: readonly string[] = [],
  errorCode = 'operation-error',
  exitCode: number | null = null,
  command = '',
): BundleInstallOutcome {
  return outcomeOf(deps, pkg, {
    application: 'failed',
    stage: 'install',
    changed: false,
    target: pkg,
    errorCode: pendingBuilds.length === 0 ? errorCode : 'build-blocked',
    errorDetail,
    ...(pendingBuilds.length === 0 ? {} : { pendingBuilds }),
    ...(exitCode === null && command === ''
      ? {}
      : {
          packageResult: {
            exitCode: exitCode ?? 0,
            output: errorDetail,
            truncated: false,
            logPath: '',
            ...(command === '' ? {} : { command }),
          },
        }),
  });
}

function routedFailureOf(
  deps: BundleInstallDeps,
  pkg: string,
  error: unknown,
  pendingBuilds: readonly string[] = [],
): BundleInstallOutcome {
  const failure = error instanceof WorkbenchDataError ? (error.failure as InstallFailure | undefined) : undefined;
  return routedFailure(
    deps,
    pkg,
    failureDetailOf(error),
    pendingBuilds,
    'operation-error',
    failure?.exitCode ?? (error instanceof PlanStepError ? error.exitCode : null),
    failure?.command ?? (error instanceof PlanStepError ? planStepText(error.step) : ''),
  );
}

function pendingFrom(deps: BundleInstallDeps, output: string): readonly string[] {
  try {
    return recordPendingBuilds(deps.profileDir ?? null, output);
  } catch (error) {
    deps.logger?.warn?.(
      `[dsh-workbench] 构建脚本的待批清单没有记下来：${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

export async function installDshBundle(
  deps: Omit<BundleInstallDeps, 'spec' | 'options'>,
  spec: string,
  options?: BundleInstallOptions,
): Promise<BundleInstallOutcome> {
  return settle(deps, spec, options, await installOnce(deps, spec, options));
}

export type ReplaceBundleDeps = Omit<BundleInstallDeps, 'spec' | 'options' | 'remove'> & {
  readonly remove: (pkg: string) => Promise<BundleChange>;
};

export async function replaceDshBundle(
  deps: ReplaceBundleDeps,
  spec: string,
  options?: BundleInstallOptions,
): Promise<BundleInstallOutcome> {
  const first = await installOnce(deps, spec, options);
  if (first.errorCode !== 'already-installed') return settle(deps, spec, options, first);
  const pkg = bundleNameOf(first, spec);
  const removed = await deps.remove(pkg);
  if (removed.application !== 'applied') {
    return {
      change: removed,
      module: deps.installed?.(pkg) ?? { kind: 'unknown', pkg },
      supply: { state: 'no-needs' },
    };
  }
  return settle(deps, spec, options, await installOnce(deps, spec, options));
}

export async function replaceRouted(
  deps: ReplaceBundleDeps,
  spec: string,
  options?: BundleInstallOptions,
): Promise<BundleInstallOutcome> {
  const { remove: _remove, ...rest } = deps;
  if (options?.route === 'module') return installAsModule(rest, spec, options);
  if (options?.route === 'bundle') return retryBundle(deps, spec, options, true);
  const supply = deps.supply ?? requireSupply();
  const route = await probeOf(supply, spec, deps.seam, deps.registry);
  if (route?.kind === 'dsh-module') {
    return installAsModule(rest, spec, options, route.pkg ?? splitNpmSpec(spec)?.name ?? spec.trim());
  }
  return retryBundle(deps, spec, options, true);
}

function installOptions(options: BundleInstallOptions | undefined) {
  return {
    ...(options?.registry === undefined ? {} : { registry: options.registry }),
    ...(options?.requestId === undefined ? {} : { requestId: options.requestId }),
    ...(options?.approvedBuilds === undefined ? {} : { approvedBuilds: options.approvedBuilds }),
  };
}

async function installOnce(
  deps: Omit<BundleInstallDeps, 'spec' | 'options'>,
  spec: string,
  options: BundleInstallOptions | undefined,
): Promise<BundleChange> {
  const change = await deps.manager.install({ spec, ...installOptions(options) });
  if (change === null) throw new Error('插件管理器回的安装结果看不懂。');
  return change;
}

async function settle(
  deps: Omit<BundleInstallDeps, 'spec' | 'options'>,
  spec: string,
  options: BundleInstallOptions | undefined,
  change: BundleChange,
): Promise<BundleInstallOutcome> {
  const pkg = bundleNameOf(change, spec);
  const module = deps.installed?.(pkg) ?? { kind: 'unknown', pkg };
  const registry =
    options?.registry ?? (module.kind === 'module' ? module.registry : undefined);
  await deps.rememberSource(
    deps.manager,
    pkg,
    registry,
    module.kind === 'module' ? module.version : undefined,
  );
  return { change, module, supply: await deps.supplyAfter(module, change) };
}

function pkgNameOf(spec: string): string {
  return marketSpecPackage(spec) ?? splitNpmSpec(spec)?.name ?? spec.trim();
}

function probeOf(
  supply: SupplyPort,
  spec: string,
  seam: Seam | undefined,
  registry: string | undefined,
) {
  return supply.packageRouteOf({
    spec,
    ...(seam === undefined ? {} : { seam }),
    ...(registry === undefined ? {} : { registry }),
  });
}

function retryBundle(
  deps: Omit<BundleInstallDeps, 'spec' | 'options'>,
  spec: string,
  options: BundleInstallOptions | undefined,
  replace: boolean,
): Promise<BundleInstallOutcome> {
  const attempt =
    replace
      ? replaceDshBundle(deps as ReplaceBundleDeps, spec, options)
      : installDshBundle(deps, spec, options);
  return attempt.then((outcome) => retryAsModule(deps, spec, options, outcome));
}

function installAsModule(
  deps: Omit<BundleInstallDeps, 'spec' | 'options'>,
  spec: string,
  options: BundleInstallOptions | undefined,
  pkg: string = pkgNameOf(spec),
): Promise<BundleInstallOutcome> {
  return installModuleRow({ ...deps, spec, ...(options === undefined ? {} : { options }) }, spec, pkg);
}

async function wireModule(deps: Omit<BundleInstallDeps, 'spec' | 'options'>, pkg: string): Promise<void> {
  const dir = deps.profileDir;
  if (dir === undefined || dir === null) return;
  const wanted = declaresDshBundle(dir, pkg);
  const listed = (): boolean => profileBundlesOf(dir).includes(pkg);
  if (listed() === wanted) return;
  const setEnabled = deps.manager.setEnabled?.bind(deps.manager);
  const shape = wanted ? '这一版声明了 dsh.bundle' : '这一版未声明 dsh.bundle';
  const move = wanted ? '加入 dsh.profile.bundles' : '从 dsh.profile.bundles 移除';
  if (setEnabled === undefined) {
    throw new Error(`${shape}，但这份 dsh 无法把它${move}`);
  }
  let change: BundleChange | null;
  try {
    change = await setEnabled(pkg, wanted);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${shape}，但未能把它${move}（${detail}）`, { cause: error });
  }
  if (listed() !== wanted) {
    throw new Error(`${shape}，但未能把它${move}（${change?.errorCode ?? '原因不明'}）`);
  }
}

async function realignProfile(
  deps: Omit<BundleInstallDeps, 'spec' | 'options'>,
  pkg: string,
): Promise<void> {
  const dir = deps.profileDir;
  if (dir === undefined || dir === null) return;
  const pnpm = profilePnpmCommand(dir);
  const prefix = [pnpm.command, ...pnpm.args].map(quoteShellArg).join(' ');
  const store = pnpm.storeDir === undefined ? '' : ` --store-dir ${quoteShellArg(pnpm.storeDir)}`;
  const line = `${prefix} install --frozen-lockfile --dir ${quoteShellArg(dir)}${store}`;
  try {
    await deps.runAll([hostCommandStep({ kind: 'run', line })]);
    deps.logger?.warn?.(`[dsh-workbench] ${pkg} 安装失败，已按 lockfile 重装工作台配置`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    deps.logger?.warn?.(`[dsh-workbench] ${pkg} 安装失败，按 lockfile 重装工作台配置也失败：${detail}`);
  }
}

async function retryAsModule(
  deps: Omit<BundleInstallDeps, 'spec' | 'options'>,
  spec: string,
  options: BundleInstallOptions | undefined,
  outcome: BundleInstallOutcome,
): Promise<BundleInstallOutcome> {
  if (outcome.change.errorCode !== 'not-bundle') return outcome;
  const pkg = bundleNameOf(outcome.change, spec);
  deps.logger?.info?.(`[dsh-workbench] ${pkg} 未声明 dsh.bundle，改按工作台模块安装`);
  const retried = await installModuleRow(
    { ...deps, spec, ...(options === undefined ? {} : { options }) },
    spec,
    pkg,
  );
  if (retried.change.application === 'failed') await realignProfile(deps, pkg);
  return retried;
}

async function installModuleRow(
  deps: BundleInstallDeps,
  spec: string,
  pkg: string,
): Promise<BundleInstallOutcome> {
  const profileDir = deps.profileDir;
  if (profileDir === undefined || profileDir === null) {
    return routedFailure(deps, pkg, 'profile dir is missing', [], 'no-profile-dir');
  }
  const line = moduleInstallLine({ spec, profileDir, ...(deps.registry === undefined ? {} : { registry: deps.registry }) });
  const signal = deps.options?.signal;
  const approved = deps.options?.approvedBuilds;
  if (approved !== undefined && approved.length > 0) {
    try {
      approveBuilds(profileDir, approved);
    } catch (error) {
      return routedFailure(deps, pkg, error instanceof Error ? error.message : String(error));
    }
  }
  let output: string;
  try {
    await deps.runAll([hostCommandStep({ kind: 'run', line })], signal === undefined ? undefined : { signal });
    output = deps.outputOf?.() ?? '';
  } catch (error) {
    if (error instanceof PlanCancelledError) return routedCancelled(deps, pkg);
    const pending = pendingFrom(deps, outputOfError(error));
    deps.logger?.warn?.(`[dsh-workbench] ${pkg} 安装命令没跑成：${failureDetailOf(error)}`);
    return routedFailureOf(deps, pkg, error, pending);
  }
  try {
    await wireModule(deps, pkg);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    deps.logger?.warn?.(`[dsh-workbench] ${pkg} 已安装到工作台配置，但 dsh.profile.bundles 未同步：${detail}`);
    return outcomeOf(deps, pkg, {
      application: 'failed',
      stage: 'install',
      changed: true,
      target: pkg,
      errorCode: 'bundle-list-failed',
      errorDetail: `dsh.profile.bundles: ${detail}`,
    });
  }
  try {
    deps.syncRows?.();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    deps.logger?.warn?.(`[dsh-workbench] ${pkg} 已安装到 profile，但模块行没有写入：${detail}`);
    return outcomeOf(deps, pkg, {
      application: 'failed',
      stage: 'install',
      changed: true,
      target: pkg,
      errorCode: 'module-row-failed',
      errorDetail: `cordis.patch.yml: ${detail}`,
    });
  }
  const skipped = pendingFrom(deps, output);
  if (skipped.length > 0) {
    deps.logger?.warn?.(`[dsh-workbench] ${pkg} 已安装到工作台配置，但这些包的构建脚本没有运行：${skipped.join('、')}`);
  }
  deps.logger?.info?.(`[dsh-workbench] ${pkg} 按工作台模块安装：profile 依赖 + 一条模块行`);
  return outcomeOf(deps, pkg, {
    application: 'applied',
    stage: 'install',
    changed: true,
    target: pkg,
    ...(skipped.length === 0 ? {} : { pendingBuilds: skipped }),
  });
}

export async function installRouted(deps: BundleInstallDeps): Promise<BundleInstallOutcome> {
  const { spec, options, registry, seam } = deps;
  if (options?.route === 'module') return installAsModule(deps, spec, options);
  if (options?.route === 'bundle') return retryBundle(deps, spec, options, false);
  const supply = deps.supply ?? requireSupply();
  const route = await probeOf(supply, spec, seam, registry);
  if (route?.kind === 'dsh-module') {
    return installModuleRow(deps, spec, route.pkg ?? splitNpmSpec(spec)?.name ?? spec.trim());
  }
  if (route === undefined || route.kind === 'dsh-bundle') return retryBundle(deps, spec, options, false);

  const pkg = route.pkg ?? splitNpmSpec(spec)?.name ?? spec.trim();
  if (route.kind === 'neither') {
    deps.logger?.warn?.(`[dsh-workbench] 不装 ${pkg}：${refusalReason()}`);
    return outcomeOf(deps, pkg, {
      application: 'failed',
      stage: 'install',
      changed: false,
      target: pkg,
      errorCode: 'not-a-module-or-plugin',
      errorDetail: refusalReason(),
    });
  }

  const plan = supply.pluginInstallPlan({
    spec,
    command: deps.command,
    ...(registry === undefined ? {} : { registry }),
    ...(route.pluginName === undefined ? {} : { pluginName: route.pluginName }),
  });
  if (!plan.ok) return routedFailure(deps, pkg, sourceProblemText(plan.problem, plan.env));
  deps.ledger?.intend({
    package: pkg,
    ...(registry === undefined ? {} : { registry }),
    ...(localDirOf(spec) === undefined ? {} : { local: true }),
  });
  try {
    await deps.runAll(plan.steps);
  } catch (error) {
    deps.ledger?.drop(pkg);
    deps.logger?.warn?.(`[dsh-workbench] ${pkg} 插件安装没跑成：${failureDetailOf(error)}`);
    return routedFailureOf(deps, pkg, error);
  }
  deps.ledger?.complete(pkg, installedPluginName(spec, pkg, deps.ledger.pluginFiles));
  deps.logger?.info?.(`[dsh-workbench] 把 ${pkg} 装进了运行时的插件区`);
  return outcomeOf(
    deps,
    pkg,
    { application: 'applied', stage: 'install', changed: true, target: pkg },
    { kind: 'runtime-plugin', pkg, ...(route.pluginName === undefined ? {} : { name: route.pluginName }) },
  );
}

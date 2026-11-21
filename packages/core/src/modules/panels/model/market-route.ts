import type { PluginPlanStep, Seam } from '@dsh-workbench/shared/host';
import type { BundleChange, BundleInstalledPlugin } from '@/kernel/contract/bundle-install';
import type { BundleManager } from '@dsh-workbench/shared/host';
import type { InstalledModule } from '@dsh-workbench/shared/host';
import {
  approveBuilds, hostCommandStep, PlanCancelledError, profilePnpmCommand, quoteShellArg, recordPendingBuilds,
  refusalReason, splitNpmSpec, WorkbenchDataError,
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

function packageNameInPath(path: string): string | undefined {
  const parts = path.split('/').filter((part) => part !== '');
  const last = parts[parts.length - 1];
  if (last === undefined || last === '') return undefined;
  const parent = parts[parts.length - 2];
  return parent !== undefined && parent.startsWith('@') ? `${parent}/${last}` : last;
}

export function bundleNameOf(change: BundleChange, spec: string): string {
  if (change.bundle !== undefined && change.bundle !== '') return change.bundle;
  const at = spec.indexOf('&path:');
  if (at !== -1) {
    const inPath = packageNameInPath(spec.slice(at + '&path:'.length));
    if (inPath !== undefined) return inPath;
  }
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
): BundleInstallOutcome {
  return outcomeOf(deps, pkg, {
    application: 'failed',
    stage: 'install',
    changed: false,
    target: pkg,
    errorCode: pendingBuilds.length === 0 ? 'operation-error' : 'build-blocked',
    errorDetail,
    ...(pendingBuilds.length === 0 ? {} : { pendingBuilds }),
  });
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
  const supply = deps.supply ?? requireSupply();
  const route = await supply.packageRouteOf({
    spec,
    ...(deps.seam === undefined ? {} : { seam: deps.seam }),
    ...(deps.registry === undefined ? {} : { registry: deps.registry }),
  });
  if (route?.kind !== 'dsh-module') return replaceDshBundle(deps, spec, options);
  const { remove: _remove, ...rest } = deps;
  return installModuleRow(
    { ...rest, spec, ...(options === undefined ? {} : { options }) },
    spec,
    route.pkg ?? splitNpmSpec(spec)?.name ?? spec.trim(),
  );
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

async function installModuleRow(
  deps: BundleInstallDeps,
  spec: string,
  pkg: string,
): Promise<BundleInstallOutcome> {
  const profileDir = deps.profileDir;
  if (profileDir === undefined || profileDir === null) {
    return routedFailure(deps, pkg, '这份工作台配置缺少可写的目录，无法安装模块。');
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
    return routedFailure(deps, pkg, failureDetailOf(error), pending);
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
      errorDetail: `包已装进工作台配置，但没有写入它的 cordis.patch.yml：${detail}。请修好这个文件后重启工作台，模块才会加载。`,
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
  const supply = deps.supply ?? requireSupply();
  const route = await supply.packageRouteOf({
    spec,
    ...(seam === undefined ? {} : { seam }),
    ...(registry === undefined ? {} : { registry }),
  });
  if (route?.kind === 'dsh-module') {
    return installModuleRow(deps, spec, route.pkg ?? splitNpmSpec(spec)?.name ?? spec.trim());
  }
  if (route === undefined || route.kind === 'dsh-bundle') return installDshBundle(deps, spec, options);

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
    return routedFailure(deps, pkg, failureDetailOf(error));
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

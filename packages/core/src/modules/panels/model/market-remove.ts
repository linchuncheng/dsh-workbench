import { join } from 'node:path';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import type { BundleManager, PluginPlanStep } from '@dsh-workbench/shared/host';
import { forgetPackageSource, hostCommandStep, packageSourceOf, profilePnpmCommand, quoteShellArg, scopeOf } from '@dsh-workbench/shared/host';
import { retryAfterRegistryFix, type RegistryFixDeps } from './market-registry';

export interface RemoveBundleOptions {
  readonly manager: BundleManager;
  readonly pkg: string;
  readonly profileDir?: string | null | undefined;
  readonly registryFix: RegistryFixDeps;
  readonly logger?: { warn?(message: string): void } | undefined;
}

let chain: Promise<unknown> = Promise.resolve();

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const run = chain.then(operation, operation);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function forgetSource(options: RemoveBundleOptions): void {
  const dir = options.profileDir;
  if (dir === undefined || dir === null) return;
  try {
    forgetPackageSource(dir, options.pkg);
  } catch (error) {
    options.logger?.warn?.(`[dsh-workbench] 清 ${options.pkg} 的来源记录失败：${String(error)}`);
  }
}

function swapScopeFor(options: RemoveBundleOptions): (() => void) | undefined {
  const dir = options.profileDir;
  const notebook = options.registryFix.registries;
  if (dir === undefined || dir === null || notebook?.swapScope === undefined) return undefined;
  const source = packageSourceOf(dir, options.pkg);
  const scope = scopeOf(options.pkg);
  if (source === undefined || scope === null) return undefined;
  try {
    return notebook.swapScope(scope, source.registry);
  } catch (error) {
    options.logger?.warn?.(
      `[dsh-workbench] 临时把 ${scope} 指到 ${source.registry} 失败，卸载照走：${String(error)}`,
    );
    return undefined;
  }
}

async function removeOnce(options: RemoveBundleOptions): Promise<BundleChange> {
  const { manager, pkg, registryFix, logger } = options;
  const first = await manager.remove(pkg);
  if (first === null) throw new Error('插件管理器回的卸载结果看不懂。');
  const settled = await retryAfterRegistryFix(registryFix, manager, pkg, first);
  if (settled.application !== 'failed' && settled.application !== 'cancelled') {
    forgetSource(options);
    return settled;
  }
  const put = await manager.setEnabled?.(pkg, true);
  logger?.warn?.(
    `[dsh-workbench] ${pkg} 卸载失败（${settled.errorCode ?? settled.application}）：已把对应行放回名单，避免留下「已安装但未启用」的状态`,
  );
  return put ?? settled;
}

export function removeDshBundle(options: RemoveBundleOptions): Promise<BundleChange> {
  return serialized(async () => {
    const restore = swapScopeFor(options);
    try {
      return await removeOnce(options);
    } finally {
      try {
        restore?.();
      } catch (error) {
        options.logger?.warn?.(`[dsh-workbench] 还原 .npmrc 失败：${String(error)}`);
      }
    }
  });
}

export interface RemoveModuleRowOptions {
  readonly profileDir: string;
  readonly pkg: string;
  readonly runAll: (steps: readonly PluginPlanStep[]) => Promise<void>;
  readonly syncRows: () => void;
  readonly logger?: { warn?(message: string): void } | undefined;
}

export async function removeWorkbenchModule(options: RemoveModuleRowOptions): Promise<BundleChange> {
  const pnpm = profilePnpmCommand(options.profileDir);
  const prefix = [pnpm.command, ...pnpm.args].map(quoteShellArg).join(' ');
  const store = pnpm.storeDir === undefined ? '' : ` --store-dir ${quoteShellArg(pnpm.storeDir)}`;
  const line = `${prefix} remove --dir ${quoteShellArg(options.profileDir)}${store} ${quoteShellArg(options.pkg)}`;
  const linked = join(options.profileDir, 'node_modules', options.pkg);
  try {
    await options.runAll([
      hostCommandStep({ kind: 'run', line }),
      { kind: 'remove', path: linked },
    ]);
  } catch (error) {
    return {
      application: 'failed',
      stage: 'remove',
      changed: false,
      target: options.pkg,
      errorCode: 'operation-error',
      errorDetail: error instanceof Error ? error.message : String(error),
    };
  }
  try {
    options.syncRows();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    options.logger?.warn?.(`[dsh-workbench] ${options.pkg} 已从 profile 卸载，但模块行没有删除：${detail}`);
    return {
      application: 'failed',
      stage: 'remove',
      changed: true,
      target: options.pkg,
      errorCode: 'module-row-failed',
      errorDetail: `包已从工作台配置移除，但没有改成功它的 cordis.patch.yml：${detail}。请修好这个文件后重启工作台。`,
    };
  }
  return { application: 'applied', stage: 'remove', changed: true, target: options.pkg };
}

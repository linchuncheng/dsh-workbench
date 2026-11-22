import { pluginRetentionOf, quoteShellArg, type PluginLedgerEntry } from '@dsh-workbench/shared/host';
import { requireSupply, type PluginPlanStep, type Seam, type SupplyPort } from '@dsh-workbench/shared/host';
import { sourceProblemText } from './market-dependency';
import { runInstallStep } from './market-pending-builds';

export interface PluginUpdateOptions {
  readonly approvedBuilds?: readonly string[] | undefined;
}
import { pluginNameOf, type PluginFiles } from './plugin-name';
import type { PluginLedger } from './plugin-ledger';

export type PluginKept =
  | { readonly kind: 'held' }
  | { readonly kind: 'claimed'; readonly by: readonly string[] }
  | { readonly kind: 'unsure'; readonly unreadable: readonly string[] }
  | { readonly kind: 'unnamed' };

export interface PluginUninstallOutcome {
  readonly removed: boolean;
  readonly name?: string;
  readonly kept?: PluginKept;
}

export interface PluginUpdateOutcome {
  readonly name?: string;
}

export interface PluginReferences {
  readonly trustworthy: boolean;
  readonly unreadable: readonly string[];
}

export function pluginKeptOf(
  retention: 'keep-held' | 'keep-claimed' | 'keep-unsure',
  detail: { readonly by: readonly string[]; readonly unreadable: readonly string[] },
): PluginKept {
  if (retention === 'keep-held') return { kind: 'held' };
  if (retention === 'keep-unsure') return { kind: 'unsure', unreadable: [...detail.unreadable] };
  return { kind: 'claimed', by: [...detail.by] };
}

export function pluginKeptText(kept: PluginKept): string {
  if (kept.kind === 'held') return '文件保留：用户自行安装的那一份，模块卸载时不删除。';
  if (kept.kind === 'unnamed') return '文件暂时保留：无法判断是哪个插件，无法确认使用方。';
  if (kept.kind === 'unsure') {
    return kept.unreadable.length === 0
      ? '文件暂时保留：无法确认其他使用方。'
      : `文件暂时保留：${kept.unreadable.join('、')} 无法读取使用了什么，无法确认它们是否使用它。`;
  }
  return `文件保留：${kept.by.join('、')} 仍在使用它。`;
}

export function pluginRemovedText(pkg: string): string {
  return `「${pkg}」已卸载：没有其他使用者，文件已删除。`;
}

export function pluginSweptText(pkg: string): string {
  return `已清理 ${pkg}：此前需要它的模块都已卸载，没有其他使用者，文件已删除。`;
}

export interface PluginActions {
  update(pkg: string, options?: PluginUpdateOptions): Promise<PluginUpdateOutcome>;
  uninstall(pkg: string): Promise<PluginUninstallOutcome>;
  sweep(claimedBy?: (plugin: string) => readonly string[]): Promise<readonly string[]>;
}

export function createPluginActions(options: {
  readonly ledger?: PluginLedger | undefined;
  readonly seam?: Seam | undefined;
  readonly command: string;
  readonly runAll: (steps: readonly PluginPlanStep[]) => Promise<void>;
  readonly claimedBy?: ((plugin: string) => readonly string[]) | undefined;
  readonly references?: (() => PluginReferences) | undefined;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
  readonly supply?: SupplyPort | undefined;
  readonly prereleaseChannels?: (() => readonly string[]) | undefined;
}): PluginActions {
  const { ledger, seam, command, runAll, logger } = options;
  const supply = options.supply ?? requireSupply();
  const pluginFilesOf = (): PluginFiles | undefined => {
    const dir = supply.vendorPluginsDir?.();
    const manifest = supply.pluginManifestFile?.();
    return dir === undefined || manifest === undefined ? undefined : { dir, manifest };
  };

  function requireLedger(): PluginLedger {
    if (ledger === undefined) throw new Error('这个模块市场没有插件记录，无法操作已安装插件。');
    return ledger;
  }

  function requireHeld(pkg: string): { readonly entry: PluginLedgerEntry; readonly key: string } {
    const held = requireLedger();
    const direct = held.read(pkg);
    if (direct !== undefined) return { entry: direct, key: direct.package };
    const named = held.heldAsPlugin(pkg);
    if (named !== undefined) return { entry: named, key: named.package };
    const known = held.list().map((entry) => entry.name ?? entry.package);
    throw new Error(
      `插件记录中没有「${pkg}」（包名与插件名均可）；已安装插件：${known.join('、') || '（空）'}`,
    );
  }

  function referencesOf(): PluginReferences {
    return options.references?.() ?? { trustworthy: false, unreadable: [] };
  }

  type PluginDecision =
    | { readonly act: 'remove'; readonly plugin: string }
    | { readonly act: 'keep'; readonly kept: PluginKept; readonly plugin?: string };

  function decide(
    entry: PluginLedgerEntry,
    held: boolean,
    claimedBy?: (plugin: string) => readonly string[],
  ): PluginDecision {
    const plugin = pluginNameOf(entry, pluginFilesOf());
    if (plugin === undefined) return { act: 'keep', kept: { kind: 'unnamed' } };
    const refs = referencesOf();
    const by = claimedBy?.(plugin) ?? options.claimedBy?.(plugin) ?? [];
    const retention = pluginRetentionOf({ held, claimedBy: by, trustworthy: refs.trustworthy });
    if (retention === 'remove') return { act: 'remove', plugin };
    return { act: 'keep', kept: pluginKeptOf(retention, { by, unreadable: refs.unreadable }), plugin };
  }

  async function removeFiles(plugin: string): Promise<void> {
    if (seam === undefined) throw new Error('本机没有 shell 服务，无法删除插件文件。');
    await runAll([{ kind: 'run', line: `${quoteShellArg(command)} plugin uninstall ${quoteShellArg(plugin)}` }]);
  }

  return {
    async update(pkg, updateOptions) {
      const { entry } = requireHeld(pkg);
      if (entry.local === true || entry.registry === undefined) {
        throw new Error(`「${entry.package}」从本地安装，没有可查询的新版本。`);
      }
      if (seam === undefined) throw new Error('本机没有 shell 服务，无法更新。');
      const latest = await supply.latestVersion({
        seam,
        name: entry.package,
        registry: entry.registry,
        force: true,
        prereleaseChannels: options.prereleaseChannels?.() ?? [],
      });
      if (latest === undefined) throw new Error(`读不到「${entry.package}」的新版本。`);
      const plan = supply.pluginInstallPlan({
        spec: `${entry.package}@${latest}`,
        command,
        registry: entry.registry,
        ...(entry.name === undefined ? {} : { pluginName: entry.name }),
      });
      if (!plan.ok) throw new Error(sourceProblemText(plan.problem, plan.env));
      await runInstallStep({ command: plan.line, steps: plan.steps }, updateOptions?.approvedBuilds, supply.buildPolicyDirs?.() ?? [], {
        run: (line) => runAll([{ kind: 'run', line }]),
        runAll,
      });
      logger?.info?.(`[dsh-workbench] 把 ${entry.package} 更新到 ${latest}`);
      return { name: pluginNameOf(entry, pluginFilesOf()) ?? entry.name ?? entry.package };
    },

    async uninstall(pkg) {
      const ledger = requireLedger();
      const { entry, key } = requireHeld(pkg);
      ledger.release(key);
      const decision = decide(entry, false);
      if (decision.act === 'keep') {
        logger?.info?.(`[dsh-workbench] ${pluginKeptText(decision.kept)}`);
        return {
          removed: false,
          ...(decision.plugin === undefined ? {} : { name: decision.plugin }),
          kept: decision.kept,
        };
      }
      await removeFiles(decision.plugin);
      ledger.drop(key);
      logger?.info?.(`[dsh-workbench] ${pluginRemovedText(key)}`);
      return { removed: true, name: decision.plugin };
    },

    async sweep(claimedBy) {
      if (ledger === undefined) return [];
      const removed: string[] = [];
      for (const entry of ledger.all()) {
        if (entry.releasedAt === undefined) continue;
        const decision = decide(entry, false, claimedBy);
        if (decision.act === 'keep') continue;
        try {
          await removeFiles(decision.plugin);
        } catch (error) {
          logger?.warn?.(`[dsh-workbench] 清理 ${entry.package} 失败：${String(error)}`);
          continue;
        }
        ledger.drop(entry.package);
        removed.push(entry.package);
        logger?.info?.(`[dsh-workbench] ${pluginSweptText(entry.package)}`);
      }
      return removed;
    },
  };
}

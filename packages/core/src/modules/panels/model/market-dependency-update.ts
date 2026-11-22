import type { PluginPlanStep, UnitCapability } from '@dsh-workbench/shared/host';
import {
  dependencyCommandPlan,
  type DependencyTarget,
  type SharedDependency,
} from './market-dependency';
import { dependencyStillBehind } from './market-verify';
import { runInstallStep } from './market-pending-builds';

export interface DependencyUpdateDeps {
  readonly capabilityOf: (unit: string, force?: boolean) => Promise<UnitCapability>;
  readonly runAll: (steps: readonly PluginPlanStep[]) => Promise<void>;
  readonly approvedBuilds?: readonly string[] | undefined;
  readonly buildPolicyDirs?: readonly string[] | undefined;
  readonly snapshot: () => Promise<readonly SharedDependency[]>;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
}

export async function updateDependencyRow(
  target: DependencyTarget,
  deps: DependencyUpdateDeps,
): Promise<readonly SharedDependency[]> {
  if (target.conflict !== undefined) {
    throw new Error(`这一行有两份来源，先统一声明再更新：${target.conflict}`);
  }
  const seen = new Map<string, UnitCapability>();
  for (const [index, manifest] of target.declarers.entries())
    seen.set(manifest.id, await deps.capabilityOf(manifest.id, index === 0));
  const primary = target.declarers[0];
  const before = primary === undefined ? undefined : seen.get(primary.id);
  const commands = dependencyCommandPlan({ target, capability: before, capabilities: seen });
  if (commands === undefined) {
    const behind = dependencyStillBehind(target, seen);
    if (behind !== undefined) throw new Error(`这一行没有可执行的更新命令：${behind}`);
    return deps.snapshot();
  }
  const head = commands[0];
  const line = head === undefined || head.kind !== 'run' ? '' : head.line;
  await runInstallStep({ command: line, steps: commands }, deps.approvedBuilds, deps.buildPolicyDirs ?? [], {
    run: (one) => deps.runAll([{ kind: 'run', line: one }]),
    runAll: deps.runAll,
  });
  const after = new Map<string, UnitCapability>();
  for (const [index, manifest] of target.declarers.entries())
    after.set(manifest.id, await deps.capabilityOf(manifest.id, index === 0));
  const behind = dependencyStillBehind(target, after);
  if (behind !== undefined) throw new Error(`更新命令已完成，但还差一步：${behind}`);
  deps.logger?.info?.(`[dsh-workbench] 已更新依赖 ${target.id}`);
  return deps.snapshot();
}

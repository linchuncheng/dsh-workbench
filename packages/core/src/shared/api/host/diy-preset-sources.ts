import type { DshAgentPresetRegistry, DshHostContext, RouteTable } from '@dsh-workbench/shared/host';
import type { DiyPresetSourceRow } from '@dsh-workbench/shared/host';
import { diyPresetSourcesOf } from '@dsh-workbench/shared/host';
import type { WorkbenchDiyPresetsSnapshot } from '@/kernel/contract/workbench-settings';
import { WORKBENCH_DIY_PRESETS_ROUTE } from '@/kernel/contract/workbench-settings';

function brokenIdsOf(rows: readonly { readonly id: string; readonly broken?: string | undefined }[]): Set<string> {
  const broken = new Set<string>();
  for (const row of rows) {
    if (typeof row.broken === 'string' && row.broken.trim() !== '') broken.add(row.id);
  }
  return broken;
}

export async function diyPresetSourcesSnapshotOf(ctx: DshHostContext): Promise<WorkbenchDiyPresetsSnapshot> {
  const loader = ctx.get('loader');
  if (loader === undefined) return { ready: false, sources: [] };
  let rows: readonly DiyPresetSourceRow[];
  try {
    rows = diyPresetSourcesOf(loader.entries());
  } catch (error) {
    ctx.logger?.warn?.(`[dsh-workbench] 读 dsh 的模式声明失败：${String(error)}`);
    return { ready: false, sources: [] };
  }
  const registry = ctx.get('agentPresets') as DshAgentPresetRegistry | undefined;
  let broken = new Set<string>();
  if (typeof registry?.list === 'function') {
    try {
      broken = brokenIdsOf(await registry.list());
    } catch (error) {
      ctx.logger?.warn?.(`[dsh-workbench] 读 dsh 的模式列表失败：${String(error)}`);
    }
  }
  return {
    ready: true,
    sources: rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      usable: row.usable && !broken.has(row.id),
    })),
  };
}

export function mountDiyPresetSources(options: {
  readonly ctx: DshHostContext;
  readonly routes: RouteTable;
}): void {
  options.routes[WORKBENCH_DIY_PRESETS_ROUTE] = async () => ({
    ok: true,
    ...(await diyPresetSourcesSnapshotOf(options.ctx)),
  });
}

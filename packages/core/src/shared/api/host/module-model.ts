import type { DshHostContext, RouteTable } from '@dsh-workbench/shared/host';
import type {
  WorkbenchModelChoice,
  WorkbenchModelGroup,
  WorkbenchModuleModelsSnapshot,
} from '@/kernel/contract/workbench-settings';
import { WORKBENCH_MODULE_MODELS_ROUTE } from '@/kernel/contract/workbench-settings';
import { WORKBENCH_SETTINGS_SERVICE, type WorkbenchSettingsStore } from './workbench-settings';

interface ProviderRow {
  readonly id: string;
  readonly name: string;
}

interface ModelRow {
  readonly id: string;
  readonly name: string;
}

interface LlmCatalogLike {
  listProviders(): readonly ProviderRow[];
  listModels(provider: string): Promise<readonly ModelRow[]>;
}

interface DefaultModelLike {
  currentSelection(): { readonly provider?: unknown; readonly model?: unknown } | undefined;
}

function choiceOf(
  selection: { readonly provider?: unknown; readonly model?: unknown } | undefined,
): WorkbenchModelChoice | undefined {
  const provider = selection?.provider;
  const model = selection?.model;
  return typeof provider === 'string' && provider !== '' && typeof model === 'string' && model !== ''
    ? { provider, model }
    : undefined;
}

export function moduleModelOf(ctx: DshHostContext): WorkbenchModelChoice | undefined {
  const store = ctx.get(WORKBENCH_SETTINGS_SERVICE) as unknown as WorkbenchSettingsStore | undefined;
  return store?.read().moduleModel ?? undefined;
}

export function defaultModelOf(ctx: DshHostContext): WorkbenchModelChoice | undefined {
  const defaults = ctx.get('agentDefaultModel') as unknown as DefaultModelLike | undefined;
  if (defaults === undefined || typeof defaults.currentSelection !== 'function') return undefined;
  try {
    return choiceOf(defaults.currentSelection());
  } catch {
    return undefined;
  }
}

async function groupOf(llm: LlmCatalogLike, provider: ProviderRow): Promise<WorkbenchModelGroup | undefined> {
  try {
    const models = await llm.listModels(provider.id);
    if (models.length === 0) return undefined;
    return {
      id: provider.id,
      name: provider.name,
      models: models.map((model) => ({ id: model.id, name: model.name })),
    };
  } catch {
    return undefined;
  }
}

export async function moduleModelCatalogOf(ctx: DshHostContext): Promise<WorkbenchModuleModelsSnapshot> {
  const llm = ctx.get('llm') as unknown as LlmCatalogLike | undefined;
  const groups =
    llm === undefined
      ? []
      : (await Promise.all(llm.listProviders().map((provider) => groupOf(llm, provider)))).filter(
          (group): group is WorkbenchModelGroup => group !== undefined,
        );
  return { groups };
}

export function mountModuleModels(options: { readonly ctx: DshHostContext; readonly routes: RouteTable }): void {
  options.routes[WORKBENCH_MODULE_MODELS_ROUTE] = async () => ({
    ok: true,
    ...(await moduleModelCatalogOf(options.ctx)),
  });
}

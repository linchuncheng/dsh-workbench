import type { DshHostContext, DshToolRegistry } from '@dsh-workbench/shared/host';
import { TOOL_NAMES_SERVICE, toolNameLedgerOf } from '@/kernel/host/tool-output-budget';

export function toolRegistryOf(ctx: DshHostContext, skip: string): DshToolRegistry | undefined {
  const tools = ctx.get('tools') as DshToolRegistry | undefined;
  if (tools === undefined) {
    ctx.logger?.info?.(`[dsh-workbench] 没有 tools 服务，${skip}`);
    return undefined;
  }
  const names = toolNameLedgerOf(ctx.get(TOOL_NAMES_SERVICE));
  if (names === undefined) return tools;
  return {
    register(definition) {
      names.add(definition.name);
      return tools.register(definition);
    },
  };
}

export function objectSchemaOf(
  properties: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { type: 'object', properties, ...extra };
}

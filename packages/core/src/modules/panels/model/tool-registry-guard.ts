import type { DshHostContext, DshToolRegistry } from '@dsh-workbench/shared/host';

export function toolRegistryOf(ctx: DshHostContext, skip: string): DshToolRegistry | undefined {
  const tools = ctx.get('tools') as DshToolRegistry | undefined;
  if (tools === undefined) ctx.logger?.info?.(`[dsh-workbench] 没有 tools 服务，${skip}`);
  return tools;
}

export function objectSchemaOf(
  properties: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { type: 'object', properties, ...extra };
}

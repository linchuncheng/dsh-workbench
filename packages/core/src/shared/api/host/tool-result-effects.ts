import type { DshHostContext, FactLog, ToolUnit, UnitCall } from '@dsh-workbench/shared/host';
import { PLUGIN_ID, wroteNow } from '@dsh-workbench/shared/host';
import { TOOL_NAMES_SERVICE, createToolNameLedger, type ToolNameLedger } from '@/kernel/host/tool-output-budget';
import { boundToolOutput } from '@/shared/api/host/tool-output-policy';
import { asArgs } from '@/shared/api/host/host-args';

export interface ToolResultEffectDeps {
  readonly toolNames: ToolNameLedger;
  readonly unitsOfTool: () => ReadonlyMap<string, ToolUnit>;
  readonly factsOfMap: ReadonlyMap<string, (call: UnitCall) => readonly string[] | undefined>;
  readonly facts: FactLog;
  readonly factsOfUnit: (unit: string) => readonly string[];
}

export function provideToolNames(ctx: DshHostContext): ToolNameLedger {
  const names = createToolNameLedger();
  ctx.provide(TOOL_NAMES_SERVICE, names);
  return names;
}

export function installToolResultEffects(ctx: DshHostContext, deps: ToolResultEffectDeps): void {
  ctx.effect(() => {
    const off = ctx.on?.('tools/post-execute', (exec, result, next) => {
      const name = exec?.name === undefined ? undefined : String(exec.name);
      const tool = name === undefined ? undefined : deps.unitsOfTool().get(name);
      if (tool !== undefined && name !== undefined) {
        const call: UnitCall = { source: name, args: asArgs(exec?.arguments), result };
        const declared = deps.factsOfMap.get(tool.unit)?.(call);
        if (declared !== undefined) {
          if (declared.length > 0) deps.facts.bump(declared);
        } else if (tool.writes && wroteNow(result) !== false) {
          deps.facts.bump(deps.factsOfUnit(tool.unit));
        }
      }
      return next();
    });
    return () => off?.();
  }, `${PLUGIN_ID}: 事实归属（读工具与写工具同一处声明）`);

  ctx.effect(() => {
    const off = ctx.on?.('tools/post-execute', async (exec, result, next) => {
      const decision = await next();
      const name = exec?.name === undefined ? undefined : String(exec.name);
      if (name === undefined || !deps.toolNames.has(name) || decision.kind !== 'accept') return decision;
      if (Object.hasOwn(decision, 'value')) return decision;
      const bounded = await boundToolOutput(ctx, exec, decision.content ?? result.content);
      if (bounded === undefined) return decision;
      const replacement = { kind: 'accept' as const, content: bounded };
      return decision.additionalContexts === undefined
        ? replacement
        : { ...replacement, additionalContexts: decision.additionalContexts };
    });
    return () => off?.();
  }, `${PLUGIN_ID}: 工具输出按预算兜底（只认工作台注册的工具）`);
}

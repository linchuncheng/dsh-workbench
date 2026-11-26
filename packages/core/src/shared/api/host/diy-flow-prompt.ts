import type { DshHostContext, ToolScopeContext } from '@dsh-workbench/shared/host';
import { DIY_PRESET_ID } from '@/shared/api/diy';
import { registerPromptText } from './prompt-section';

export const DIY_FLOW_SECTION = 'workbench:diy-flow';

export const DIY_FLOW_TEXT =
  'This is a workbench DIY session. To create or change a module, your first call must be ' +
  'workbench_diy_plan (destination=board / headless / tweak; summary restates the request). ' +
  'On create, that call carries only the destination and the summary — no approval yet; ' +
  'on change, submit the full plan at once. ' +
  'The plan step (「确认方案」 / 「补充方案」) uses workbench_diy_plan; every other step goes through ' +
  'workbench_diy_step, and done: true is the only completion signal. ' +
  'Never enter this flow for one-off tasks, existing modules, view-only requests, or troubleshooting.';

const DIY_FLOW_ORDER = 701;

const DIY_FLOW_VISIBLE = (scope: ToolScopeContext | null): boolean =>
  scope !== null && scope.preset === DIY_PRESET_ID;

export function registerDiyFlowPrompt(
  ctx: DshHostContext,
  isChild: (sessionId: string) => boolean,
): () => void {
  return registerPromptText(ctx, isChild, DIY_FLOW_SECTION, DIY_FLOW_ORDER, DIY_FLOW_TEXT, '这个 dsh 没有 systemPrompt 服务：DIY 流程入口不进系统提示词', '注册 DIY 流程提示词段失败', DIY_FLOW_VISIBLE);
}
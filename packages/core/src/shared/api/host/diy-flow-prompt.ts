import type { DshHostContext } from '@dsh-workbench/shared/host';
import { DIY_PRESET_ID } from '@/shared/api/diy';
import { registerPromptSection } from './prompt-section';

export const DIY_FLOW_SECTION = 'workbench:diy-flow';

export const DIY_FLOW_TEXT =
  '这个会话是工作台 DIY 模式。要创建或修改模块时，先调用 workbench_diy_plan' +
  '（destination=board / headless / tweak，summary 复述用户要什么）。' +
  '创建时第一次只交去向与复述（不审批）；修改可直接交完整方案。' +
  '方案那一步（「确认方案」/「补充方案」）用 workbench_diy_plan；其余各步用 workbench_diy_step 提交，' +
  'done: true 才算完成。一次性任务、现成模块、只是查看或排查，都不进流程。';

const DIY_FLOW_ORDER = 701;

export function registerDiyFlowPrompt(
  ctx: DshHostContext,
  isChild: (sessionId: string) => boolean,
): () => void {
  return registerPromptSection(ctx, {
    name: DIY_FLOW_SECTION,
    order: DIY_FLOW_ORDER,
    text: DIY_FLOW_TEXT,
    isChild,
    visible: (scope) => scope !== null && scope.preset === DIY_PRESET_ID,
    absent: '这个 dsh 没有 systemPrompt 服务：DIY 流程入口不进系统提示词',
    failed: '注册 DIY 流程提示词段失败',
  });
}

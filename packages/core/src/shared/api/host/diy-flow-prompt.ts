import type { DshAssemblyContext, DshHostContext } from '@dsh-workbench/shared/host';
import { DIY_PRESET_ID } from '@/shared/api/diy';
import { toolScopeContextOf } from './tool-scope';

export const DIY_FLOW_SECTION = 'workbench:diy-flow';

export const DIY_FLOW_TEXT =
  '这个会话是工作台 DIY 模式。判到这件事要做成模块（新建或修改）后，第一件事调用 workbench_diy_plan' +
  '（destination=board / headless / tweak，summary 复述用户要什么；不清楚就先问、等回答；第一次不审批）；' +
  '此后「查看数据来源 / 创建模块 / 安装 / 检查 / 保存设计」用 workbench_diy_step 提交，' +
  '「确认方案」仍用 workbench_diy_plan；返回 done 才算完成。' +
  '一次性任务、直接使用现成模块、只是查看面板或排障，都不进流程。';

const DIY_FLOW_ORDER = 701;

interface SectionRegistry {
  section(section: {
    readonly name: string;
    readonly order: number;
    readonly text: (context: DshAssemblyContext) => string;
  }): () => void;
}

export function registerDiyFlowPrompt(
  ctx: DshHostContext,
  isChild: (sessionId: string) => boolean,
): () => void {
  const systemPrompt = ctx.get('systemPrompt') as unknown as SectionRegistry | undefined;
  if (systemPrompt?.section === undefined) {
    ctx.logger?.info?.('[dsh-workbench] 这个 dsh 没有 systemPrompt 服务：DIY 流程入口不进系统提示词');
    return () => {};
  }
  try {
    return systemPrompt.section({
      name: DIY_FLOW_SECTION,
      order: DIY_FLOW_ORDER,
      text: (context) => {
        const scope = toolScopeContextOf((context as { readonly agent?: unknown }).agent);
        if (scope === null || scope.preset !== DIY_PRESET_ID) return '';
        return scope.session !== null && isChild(scope.session) ? '' : DIY_FLOW_TEXT;
      },
    });
  } catch (error) {
    ctx.logger?.warn?.(`[dsh-workbench] 注册 DIY 流程提示词段失败：${String(error)}`);
    return () => {};
  }
}

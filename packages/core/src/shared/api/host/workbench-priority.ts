import type { DshHostContext } from '@dsh-workbench/shared/host';
import { registerPromptSection } from './prompt-section';

export const PRIORITY_SECTION = 'workbench:tool-priority';

export const PRIORITY_TEXT =
  'Prefer workbench tools for anything the workbench can do; only use other tools when no workbench tool fits. ' +
  'When unsure which tool pack to open, call workbench_toolbox_list.';

const PRIORITY_ORDER = 700;

export function registerWorkbenchPriority(
  ctx: DshHostContext,
  isChild: (sessionId: string) => boolean,
): () => void {
  return registerPromptSection(ctx, {
    name: PRIORITY_SECTION,
    order: PRIORITY_ORDER,
    text: PRIORITY_TEXT,
    isChild,
    absent: '这个 dsh 没有 systemPrompt 服务：工作台工具优先级不进系统提示词',
    failed: '注册工作台优先级提示词段失败',
  });
}

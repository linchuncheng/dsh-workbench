import type { DshAssemblyContext, DshHostContext } from '@dsh-workbench/shared/host';
import { toolScopeContextOf } from './tool-scope';

export const PRIORITY_SECTION = 'workbench:tool-priority';

export const PRIORITY_TEXT =
  'Prefer workbench tools for anything the workbench can do; only use other tools when no workbench tool fits. ' +
  'When unsure which tool pack to open, call workbench_toolbox_list.';

const PRIORITY_ORDER = 700;

interface SectionRegistry {
  section(section: {
    readonly name: string;
    readonly order: number;
    readonly text: (context: DshAssemblyContext) => string;
  }): () => void;
}

export function registerWorkbenchPriority(
  ctx: DshHostContext,
  isChild: (sessionId: string) => boolean,
): () => void {
  const systemPrompt = ctx.get('systemPrompt') as unknown as SectionRegistry | undefined;
  if (systemPrompt?.section === undefined) {
    ctx.logger?.info?.('[dsh-workbench] 这个 dsh 没有 systemPrompt 服务：工作台工具优先级不进系统提示词');
    return () => {};
  }
  try {
    return systemPrompt.section({
      name: PRIORITY_SECTION,
      order: PRIORITY_ORDER,
      text: (context) => {
        const session = toolScopeContextOf((context as { readonly agent?: unknown }).agent)?.session ?? null;
        return session !== null && isChild(session) ? '' : PRIORITY_TEXT;
      },
    });
  } catch (error) {
    ctx.logger?.warn?.(`[dsh-workbench] 注册工作台优先级提示词段失败：${String(error)}`);
    return () => {};
  }
}

import type { DshAssemblyContext, DshHostContext, ToolScopeContext } from '@dsh-workbench/shared/host';
import { toolScopeContextOf } from './tool-scope';

interface SectionRegistry {
  section(section: {
    readonly name: string;
    readonly order: number;
    readonly text: (context: DshAssemblyContext) => string;
  }): () => void;
}

export interface PromptSectionOptions {
  readonly name: string;
  readonly order: number;
  readonly text: string;
  readonly isChild: (sessionId: string) => boolean;
  readonly visible?: ((scope: ToolScopeContext | null) => boolean) | undefined;
  readonly absent: string;
  readonly failed: string;
}

export function registerPromptSection(ctx: DshHostContext, options: PromptSectionOptions): () => void {
  const systemPrompt = ctx.get('systemPrompt') as unknown as SectionRegistry | undefined;
  if (systemPrompt?.section === undefined) {
    ctx.logger?.info?.(`[dsh-workbench] ${options.absent}`);
    return () => {};
  }
  const visible = options.visible ?? (() => true);
  try {
    return systemPrompt.section({
      name: options.name,
      order: options.order,
      text: (context) => {
        const scope = toolScopeContextOf((context as { readonly agent?: unknown }).agent);
        if (!visible(scope)) return '';
        const session = scope?.session ?? null;
        return session !== null && options.isChild(session) ? '' : options.text;
      },
    });
  } catch (error) {
    ctx.logger?.warn?.(`[dsh-workbench] ${options.failed}：${String(error)}`);
    return () => {};
  }
}

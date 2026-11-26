import type { DshContentBlock, DshHostContext } from '@dsh-workbench/shared/host';
import {
  boundedPreview,
  exceedsBudget,
  textOfBlocks,
  type SpillRef,
} from '@/kernel/host/tool-output-budget';

interface SpillStore {
  saveText(input: {
    owner: { sessionId: string };
    source: { kind: 'tool'; toolName: string; callId: string; label: string };
    suggestedName: string;
    content: string;
  }): Promise<SpillRef>;
}

interface ToolExecLike {
  readonly name?: unknown;
  readonly callId?: unknown;
  readonly agent?: { readonly session?: { readonly header?: { readonly id?: unknown } } };
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sessionOf(exec: ToolExecLike): string {
  return textOf(exec.agent?.session?.header?.id);
}

export async function boundToolOutput(
  ctx: DshHostContext,
  exec: ToolExecLike,
  content: readonly DshContentBlock[],
): Promise<DshContentBlock[] | undefined> {
  const text = textOfBlocks(content);
  if (text === undefined || !exceedsBudget(text)) return undefined;
  const name = textOf(exec.name);
  const store = ctx.get('spillStore') as SpillStore | undefined;
  const owner = sessionOf(exec);
  if (store === undefined || owner === '') {
    ctx.logger?.warn?.(`[dsh-workbench] ${name} 的输出超过预算但落不了盘，改成截断`);
    return boundedPreview(text, null);
  }
  try {
    const ref = await store.saveText({
      owner: { sessionId: owner },
      source: { kind: 'tool', toolName: name, callId: textOf(exec.callId), label: 'result' },
      suggestedName: `${name}.txt`,
      content: text,
    });
    return boundedPreview(text, ref);
  } catch (error) {
    ctx.logger?.warn?.(`[dsh-workbench] ${name} 的输出落盘失败，改成截断：${String(error)}`);
    return boundedPreview(text, null);
  }
}

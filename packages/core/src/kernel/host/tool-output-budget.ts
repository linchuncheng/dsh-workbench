import type { DshContentBlock } from '@dsh-workbench/shared/host';

export const TOOL_OUTPUT_BUDGET = 8192;
export const TOOL_OUTPUT_HEAD = 4096;
export const TOOL_OUTPUT_TAIL = 1024;
export const TOOL_OUTPUT_GAP = '\n\n[...]\n\n';
export const TOOL_NAMES_SERVICE = 'workbenchToolNames';

export interface ToolNameLedger {
  add(name: string): void;
  has(name: string): boolean;
  readonly size: number;
}

export interface SpillRef {
  readonly locator: string;
  readonly retrievalHint: string;
}

export function createToolNameLedger(): ToolNameLedger {
  const names = new Set<string>();
  return {
    add(name: string): void {
      names.add(name);
    },
    has(name: string): boolean {
      return names.has(name);
    },
    get size(): number {
      return names.size;
    },
  };
}

export function toolNameLedgerOf(value: unknown): ToolNameLedger | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as ToolNameLedger;
  return typeof candidate.add === 'function' && typeof candidate.has === 'function' ? candidate : undefined;
}

export function codePointLength(text: string): number {
  return Array.from(text).length;
}

export function textOfBlocks(content: readonly DshContentBlock[]): string | undefined {
  let text = '';
  for (const block of content) {
    if (block.type !== 'text') return undefined;
    text += block.text;
  }
  return text;
}

export function exceedsBudget(text: string): boolean {
  return codePointLength(text) > TOOL_OUTPUT_BUDGET;
}

function noticeOf(omitted: number, ref: SpillRef | null): string {
  return ref === null
    ? `(已省略 ${String(omitted)} 字节。完整输出存不下 —— 收窄查询后再来。)`
    : `(已省略 ${String(omitted)} 字节。完整结果存在：${ref.locator}。用 read 的 offset/limit 接着读，或 grep 这个路径。)`;
}

export function boundedPreview(text: string, ref: SpillRef | null): DshContentBlock[] {
  const points = Array.from(text);
  const head = points.slice(0, TOOL_OUTPUT_HEAD).join('');
  const tail = points.slice(Math.max(0, points.length - TOOL_OUTPUT_TAIL)).join('');
  const omitted = Buffer.byteLength(text, 'utf8') - Buffer.byteLength(head, 'utf8') - Buffer.byteLength(tail, 'utf8');
  const notice = noticeOf(omitted, ref);
  return [{ type: 'text', text: `${head}${TOOL_OUTPUT_GAP}${tail}\n\n${notice}` }];
}

import type { ToolboxCapability } from '@dsh-workbench/shared/host';
import { TOOLBOX_CLOSE_TOOL, TOOLBOX_LIST_TOOL, TOOLBOX_OPEN_TOOL } from '../unit';
import type { PackEntry } from './toolbox';

const DESCRIPTION_MAX = 500;

function entryOf(pack: PackEntry): string {
  return pack.kind === 'unit' ? `${pack.id}（${pack.label.zh}）` : pack.id;
}

function idList(head: string, entries: readonly string[]): string {
  const kept: string[] = [];
  let width = 0;
  for (const [index, entry] of entries.entries()) {
    const next = width + (index === 0 ? 0 : ' / '.length) + entry.length;
    const rest = entries.length - index - 1;
    const tail = rest === 0 ? '' : ` 等 ${String(entries.length)} 个包`;
    if (head.length + next + tail.length > DESCRIPTION_MAX) break;
    kept.push(entry);
    width = next;
  }
  if (kept.length === 0) return `共 ${String(entries.length)} 个包`;
  const rest = entries.length - kept.length;
  return `${kept.join(' / ')}${rest === 0 ? '' : ` 等 ${String(entries.length)} 个包`}`;
}

export function capabilityBriefOf(packs: readonly PackEntry[]): ToolboxCapability {
  const head =
    '用户要的活现有工具干不了、或涉及右侧面板 / 看板 / 卡片、模块 / 市场、页面、录制、日志时看这份。' +
    `工作台的能力按会话收在工具包里，默认不加载：先 ${TOOLBOX_LIST_TOOL} 看目录，` +
    `再 ${TOOLBOX_OPEN_TOOL} 开包。现在能开的包：`;
  return {
    name: 'workbench-capabilities',
    description: `${head}${idList(head, packs.map(entryOf))}`,
    content: [
      '工作台的能力按会话收在工具包里，默认一把都不进上下文。',
      '',
      `- 看目录：${TOOLBOX_LIST_TOOL}（每个包的 id、名字、一句简介）。`,
      `- 开包：${TOOLBOX_OPEN_TOOL}，targets 一次可以给多个包 id；开完下一步就能调那些工具。`,
      `- 收包：相关的事做完、或接下来用不到，调 ${TOOLBOX_CLOSE_TOOL} 把上下文还回来。`,
      '- 四类包：manage（面板 / 模块 / 市场 / 长任务）· diy（工坊 / 页面调试 / 录制 / 日志 / 页面动作）·' +
        ' unit:<模块或插件 id>（每个在板单元一包）· mcp:<server>（dsh 挂的 MCP server）。',
      '- 工作台 DIY 模式（preset workbench-diy）的会话里 manage 与 diy 默认已开：直接调用，无需开包。',
    ].join('\n'),
  };
}

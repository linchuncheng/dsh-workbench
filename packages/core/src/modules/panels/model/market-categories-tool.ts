import type { DshToolDefinition } from '@dsh-workbench/shared/host';
import type { DiscoverPayload } from '@dsh-workbench/shared/contract/protocol/market-index';
import { MARKET_CATEGORIES_TOOL } from '../unit';
import { textOutput } from './tool-output';

const OUTPUT = textOutput({
  categories: { type: 'array', items: { type: 'object', additionalProperties: true } },
  entries: { type: 'number' },
});

export function marketCategoriesTool(
  read: (() => Promise<DiscoverPayload>) | undefined,
): DshToolDefinition {
  return {
    name: MARKET_CATEGORIES_TOOL,
    description: '查看当前模块市场中已有的分类；发布模块时沿用其中一个，避免每次发布新建分类。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: OUTPUT,
    async execute() {
      if (read === undefined) throw new Error('本机没有模块市场索引服务，无法读取分类');
      const payload = await read();
      const counts = new Map<string, number>();
      for (const entry of payload.entries) {
        const category = entry.category ?? '';
        if (category === '') continue;
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
      const categories = [...counts].map(([id, count]) => ({ id, count }));
      const text =
        categories.length === 0
          ? '当前模块市场还没有分类。发布时用 category 指定一个短词（如「任务与协作」），之后这里会显示。'
          : [
              '当前模块市场的分类：',
              ...categories.map((one) => `- ${one.id}（${String(one.count)} 个模块）`),
            ].join('\n');
      return { categories, entries: payload.entries.length, text };
    },
  };
}

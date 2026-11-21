import { describe, expect, it, vi } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import { diyPresetSourcesSnapshotOf } from '../diy-preset-sources';

const PLUGINS = [
  { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
  { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
];

const loaderOf = (...configs: unknown[]) => ({
  entries: () =>
    configs.map((config, index) => ({
      id: `include:preset-${index}`,
      options: { name: '@deepseek-ai/dsh-agent-preset', config },
    })),
});

function ctxOf(
  parts: { loader?: unknown; presets?: unknown },
): { ctx: DshHostContext; warn: ReturnType<typeof vi.fn> } {
  const warn = vi.fn();
  const ctx = {
    get: (name: string) => (name === 'loader' ? parts.loader : name === 'agentPresets' ? parts.presets : undefined),
    logger: { warn },
  } as unknown as DshHostContext;
  return { ctx, warn };
}

describe('diyPresetSourcesSnapshotOf（DIY 设置页的来源列表）', () => {
  it('★ 列出声明过的模式，显示名与 order 跟着声明走', async () => {
    const { ctx } = ctxOf({
      loader: loaderOf(
        { id: 'standard', order: 1, plugins: PLUGINS },
        { id: 'mine', order: 3, name: '我的模式', description: '说明', plugins: PLUGINS },
      ),
    });
    const snapshot = await diyPresetSourcesSnapshotOf(ctx);
    expect(snapshot.ready).toBe(true);
    expect(snapshot.sources).toEqual([
      { id: 'standard', name: null, description: null, usable: true },
      { id: 'mine', name: '我的模式', description: '说明', usable: true },
    ]);
  });

  it('★ 名册上标了加载失败的来源不可选（拷过来也是坏的）', async () => {
    const { ctx } = ctxOf({
      loader: loaderOf({ id: 'standard', order: 1, plugins: PLUGINS }, { id: 'mine', order: 3, plugins: PLUGINS }),
      presets: { list: async () => [{ id: 'standard' }, { id: 'mine', broken: '缺依赖' }] },
    });
    const snapshot = await diyPresetSourcesSnapshotOf(ctx);
    expect(snapshot.sources.map((source) => [source.id, source.usable])).toEqual([
      ['standard', true],
      ['mine', false],
    ]);
  });

  it('缺锚点的声明也列出来但不可选', async () => {
    const { ctx } = ctxOf({ loader: loaderOf({ id: 'bare', plugins: [{ id: 'persona', name: 'x' }] }) });
    const snapshot = await diyPresetSourcesSnapshotOf(ctx);
    expect(snapshot.sources).toEqual([{ id: 'bare', name: null, description: null, usable: false }]);
  });

  it('loader 还没起来 → ready:false（界面继续显示读取中，不把空名单当结论）', async () => {
    const { ctx } = ctxOf({});
    expect(await diyPresetSourcesSnapshotOf(ctx)).toEqual({ ready: false, sources: [] });
  });

  it('读 loader 抛错 → ready:false，不冒泡', async () => {
    const { ctx } = ctxOf({
      loader: {
        entries: () => {
          throw new Error('loader not ready');
        },
      },
    });
    expect(await diyPresetSourcesSnapshotOf(ctx)).toEqual({ ready: false, sources: [] });
  });

  it('名册读不出来只 warn：来源照列，坏标记当作没有', async () => {
    const { ctx, warn } = ctxOf({
      loader: loaderOf({ id: 'standard', plugins: PLUGINS }),
      presets: {
        list: async () => {
          throw new Error('registry down');
        },
      },
    });
    const snapshot = await diyPresetSourcesSnapshotOf(ctx);
    expect(snapshot.sources[0]?.usable).toBe(true);
    expect(String(warn.mock.calls[0]?.[0] ?? '')).toContain('registry down');
  });
});

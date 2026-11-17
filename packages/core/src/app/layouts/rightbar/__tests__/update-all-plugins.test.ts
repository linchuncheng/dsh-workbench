import { describe, expect, it } from 'vitest';
import { updatablePlugins } from '../market-rows';
import type { MarketRow } from '../market-row-types';

function pluginRow(id: string, canUpdate: boolean): MarketRow {
  return {
    id,
    label: id,
    titleKey: 'panels.market.installed',
    plugin: true,
    pkg: `opencli-plugin-${id}`,
    state: 'installed',
    canUpdate,
    canUninstall: true,
  } as MarketRow;
}

describe('插件的「全部升级」：什么时候摆', () => {
  it('★ 一个能升级的都没有 → 空', () => {
    expect(updatablePlugins([pluginRow('a', false), pluginRow('b', false)])).toEqual([]);
  });

  it('★ 只有一个能升级 → 空（单个升级在行里，不重复摆）', () => {
    expect(updatablePlugins([pluginRow('a', true), pluginRow('b', false)])).toEqual([]);
  });

  it('★ 两个以上 → 全给出来，顺序照原样', () => {
    const rows = [pluginRow('a', true), pluginRow('b', false), pluginRow('c', true)];

    expect(updatablePlugins(rows).map((row) => row.id)).toEqual(['a', 'c']);
  });
});

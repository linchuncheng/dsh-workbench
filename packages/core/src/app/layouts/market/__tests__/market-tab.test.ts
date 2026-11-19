import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  marketTabValue,
  resetMarketTab,
  setMarketTab,
  subscribeMarketTab,
} from '../market-tab';

const HERE = new URL('../', import.meta.url);

afterEach(() => {
  resetMarketTab();
});

describe('市场页的 tab：和 dsh 插件页一样，切走再回来停在原来那一格', () => {
  it('★ 最后一个订阅者撤掉（面板卸载）也不回到「已安装」', () => {
    const off = subscribeMarketTab(() => {});
    setMarketTab('discover');
    off();

    expect(marketTabValue()).toBe('discover');
  });

  it('换一格通知一次；同一格再设不通知', () => {
    let hits = 0;
    const off = subscribeMarketTab(() => (hits += 1));

    setMarketTab('discover');
    setMarketTab('discover');
    expect(hits).toBe(1);

    setMarketTab('installed');
    expect(hits).toBe(2);

    off();
  });

  it('reset 回到「已安装」', () => {
    setMarketTab('discover');
    resetMarketTab();
    expect(marketTabValue()).toBe('installed');
  });

  it('★ 页面读的是页面外的那一格（不是组件自己的 useState）', () => {
    const panel = readFileSync(new URL('panel.tsx', HERE), 'utf8');

    expect(panel).toContain('const { tab, setTab } = useMarketTab();');
    expect(panel).not.toContain("useState<MarketTab>('installed')");
  });
});

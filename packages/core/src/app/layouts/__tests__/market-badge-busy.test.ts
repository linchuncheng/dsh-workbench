import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

describe('左栏那枚徽标：更新跑着的那一单元不许点亮（接线判据）', () => {
  it('★ 市场页发的就是行快照那同一个 id（不是照行状态另算一份）', () => {
    const view = read('rightbar/MarketView.tsx');

    expect(view).toContain('const busyId = heldIdOf(pending, steady.held);');
    expect(view).toContain('usePublishMarketBusy(busyId);');
    expect(read('rightbar/market-busy.ts')).toContain(
      'publishMarketBusy(id === null ? [] : [id]);',
    );
  });

  it('★ 入口那枚徽标读数带上这份事实（漏传 = 判据白写）', () => {
    const panel = read('market/panel.tsx');

    expect(panel).toContain('const busy = useMarketBusy();');
    expect(panel).toMatch(/marketHintOf\(\{[\s\S]*?\bbusy,/);
  });

  it('★ 发布方与读取方是同一份事实（各自造集合 = 会漂的第二份口径）', () => {
    const busy = read('rightbar/market-busy.ts');

    expect(busy).toContain('export function publishMarketBusy');
    expect(busy).toContain('export function useMarketBusy');
  });
});

describe('左栏那枚徽标：装的过程中 / 刚装完那一下（接线判据）', () => {
  it('★ 装入口只有一份：添加模块对话框发「正在装」与「已经落地的那一单元」', () => {
    const hook = read('market/use-add-module.ts');

    expect(hook).toContain('usePublishMarketInstalling(');
    expect(hook).toContain('publishMarketApplied(appliedUnitsOf(');
  });

  it('★ 发现页不再自己装：只把规格交给添加模块对话框', () => {
    const discover = read('market/use-discover.ts');

    expect(discover).toContain('onAddModule(');
    expect(discover).not.toContain("action: 'install-version'");
    expect(discover).not.toContain('usePublishMarketInstalling(');
  });

  it('★ 入口徽标读数带上这两份事实（漏传 = 判据白写）', () => {
    const panel = read('market/panel.tsx');

    expect(panel).toContain('const install = useMarketInstallState();');
    expect(panel).toMatch(/marketHintOf\(\{[\s\S]*?\.\.\.install,/);
  });

  it('★ 装完（applied）那一单元在市场上也先按住（这份读数只用来画进度，不改行状态）', () => {
    const panel = read('market/panel.tsx');

    expect(panel).toContain('const held = install.applied;');
    expect(panel).toContain('settling={mock === undefined ? held : undefined}');
  });

  it('★ 市场页也带上「正在装」：那几拍的行说「检测中」，不落「状态未知 + 重启再试」', () => {
    const panel = read('market/panel.tsx');
    const view = read('rightbar/MarketView.tsx');

    expect(panel).toContain('installing={mock === undefined ? install.installing : false}');
    expect(view).toContain('checkingRows(marketRows(');
    expect(view).toContain('readonly installing?: boolean | undefined;');
  });
});

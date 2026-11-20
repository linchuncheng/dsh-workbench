import { describe, expect, it, vi } from 'vitest';
import type { UnitCapability } from '@dsh-workbench/shared/host';
import { createMarketEntries } from '../model/market-entry';

const MANIFEST = {
  id: 'mod',
  title: { zh: '模块', en: 'Module' },
  titleKey: 'unit.mod.title',
  card: { order: 10 },
  tools: [],
  host: { inject: [], writes: [] },
  needs: [],
} as never;

describe('市场里那一格：取清单、取能力', () => {
  it('★ 没有探测能力时给 unchecked，不装作一切正常', async () => {
    const { capabilityOf } = createMarketEntries({ catalog: () => [MANIFEST] });

    await expect(capabilityOf('mod')).resolves.toMatchObject({ unit: 'mod', status: 'unchecked', needs: [] });
  });

  it('★ 探测服务给什么就用什么（force 原样传下去）', async () => {
    const probe = vi.fn(async () => ({ unit: 'mod', status: 'ok', needs: [] }) as unknown as UnitCapability);
    const { capabilityOf } = createMarketEntries({ catalog: () => [MANIFEST], probe });

    await capabilityOf('mod', true);

    expect(probe).toHaveBeenCalledWith('mod', { force: true });
  });

  it('清单里没有这个模块 → 报错里列出可安装的', () => {
    const { requireEntry } = createMarketEntries({ catalog: () => [MANIFEST] });

    expect(() => requireEntry('nope')).toThrow(/市场里没有这个模块：nope（可安装：mod）/);
  });

  it('entryOf 把清单标题键、依赖与能力拼成一行', async () => {
    const { entryOf } = createMarketEntries({ catalog: () => [MANIFEST] });

    await expect(entryOf('mod')).resolves.toMatchObject({
      unit: 'mod',
      titleKey: 'unit.mod.title',
      needs: [],
      capability: { status: 'unchecked' },
    });
  });
});

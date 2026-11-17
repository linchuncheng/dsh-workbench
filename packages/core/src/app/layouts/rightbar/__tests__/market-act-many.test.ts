import { describe, expect, it } from 'vitest';
import { marketActOf } from '../market-act';
import type { MarketRow } from '../market-row-types';

function seatsOf() {
  return {
    setPending: () => undefined,
    setHeld: () => undefined,
    setConfirming: () => undefined,
    setFailed: () => undefined,
    setNotice: () => undefined,
  };
}

function rowOf(id: string): MarketRow {
  return { id, name: id, kind: 'plugin', titleKey: 'panels.market.sectionPlugins', pkg: id } as unknown as MarketRow;
}

function actOf(rows: readonly MarketRow[]) {
  const reloads: unknown[] = [];
  const sent: unknown[] = [];
  const act = marketActOf({
    t: ((key: string) => key) as never,
    mocked: false,
    rowOf: (id) => rows.find((row) => row.id === id),
    seats: seatsOf(),
    send: async (body) => {
      sent.push(body);
      return { ok: true, value: undefined } as never;
    },
    onChanged: (options) => reloads.push(options),
  });
  return { act, reloads, sent };
}

describe('批量升级：过程里不刷新，收尾刷一次', () => {
  it('★ 三个插件批量升级 → 只重新加载一次', async () => {
    const rows = [rowOf('a'), rowOf('b'), rowOf('c')];
    const { act, reloads } = actOf(rows);

    await act.many(['a', 'b', 'c'], 'update-plugin');

    expect(reloads).toHaveLength(1);
    expect(reloads[0]).toEqual({ force: true });
  });

  it('★ 三个都真的发出去了（不是只发第一个）', async () => {
    const rows = [rowOf('a'), rowOf('b'), rowOf('c')];
    const { act, sent } = actOf(rows);

    await act.many(['a', 'b', 'c'], 'update-plugin');

    expect(sent).toHaveLength(3);
    expect(sent.map((one) => (one as { name: string }).name)).toEqual(['a', 'b', 'c']);
  });

  it('★ 单个点还是每次都刷新（批量只是一层包装）', async () => {
    const rows = [rowOf('a'), rowOf('b')];
    const { act, reloads } = actOf(rows);

    await act('a', 'update-plugin');
    await act('b', 'update-plugin');

    expect(reloads).toHaveLength(2);
  });

  it('★ 中间有一条抛了也不留在安静态（下一次单个动作照常刷新）', async () => {
    const rows = [rowOf('a'), rowOf('b'), rowOf('c')];
    const reloads: unknown[] = [];
    const act = marketActOf({
      t: ((key: string) => key) as never,
      mocked: false,
      rowOf: (id) => rows.find((row) => row.id === id),
      seats: seatsOf(),
      send: async (body) => {
        if ((body as { name?: string }).name === 'b') throw new Error('boom');
        return { ok: true, value: undefined } as never;
      },
      onChanged: (options) => reloads.push(options),
    });

    await expect(act.many(['a', 'b', 'c'], 'update-plugin')).rejects.toThrow('boom');
    await act('c', 'update-plugin');

    expect(reloads).toEqual([{ force: true }]);
  });
});

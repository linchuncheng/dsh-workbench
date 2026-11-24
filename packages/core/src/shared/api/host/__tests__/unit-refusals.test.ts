import { describe, expect, it } from 'vitest';
import { refusalRowsOf } from '../unit-refusals';

describe('宿主拒绝清单', () => {
  it('★ 同一个 unit 拒了多次只留最后一次（重装后旧理由不许留着）', () => {
    const rows = refusalRowsOf({
      refusals: () => [
        { unit: 'jj-news', pkg: '@x/a', reasons: ['旧理由'] },
        { unit: 'jj-news', pkg: '@x/a', reasons: ['新理由'] },
      ],
    });

    expect(rows).toEqual([{ unit: 'jj-news', pkg: '@x/a', reasons: ['新理由'] }]);
  });

  it('★ 没写 unit 的拒绝不往外带（客户端按 unit 对不上）', () => {
    const rows = refusalRowsOf({
      refusals: () => [{ unit: '', reasons: ['旧形状'] }],
    });

    expect(rows).toEqual([]);
  });

  it('没有 pkg 的那条不写 undefined 键（返回值要能原样过 JSON）', () => {
    const rows = refusalRowsOf({ refusals: () => [{ unit: 'ghost', reasons: ['没装'] }] });

    expect(rows).toEqual([{ unit: 'ghost', reasons: ['没装'] }]);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(['reasons', 'unit']);
  });
});

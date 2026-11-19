import { describe, expect, it } from 'vitest';
import { mapWithLimit } from '../concurrency.js';

describe('mapWithLimit', () => {
  it('结果与输入同序（先跑的慢任务不会抢到前面）', async () => {
    const out = await mapWithLimit([3, 1, 2], 2, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, value));
      return value * 10;
    });
    expect(out).toEqual([30, 10, 20]);
  });

  it('同时在飞的不超过上限', async () => {
    let active = 0;
    let peak = 0;
    await mapWithLimit(Array.from({ length: 9 }, (_, index) => index), 3, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return value;
    });
    expect(peak).toBe(3);
  });

  it('空输入不启动任何任务', async () => {
    let runs = 0;
    const out = await mapWithLimit([], 4, async () => {
      runs += 1;
      return 1;
    });
    expect(out).toEqual([]);
    expect(runs).toBe(0);
  });

  it('上限小于 1 按 1 算', async () => {
    let active = 0;
    let peak = 0;
    await mapWithLimit([1, 2, 3], 0, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return value;
    });
    expect(peak).toBe(1);
  });

  it('任一任务抛错时整体 reject', async () => {
    await expect(
      mapWithLimit([1, 2, 3], 2, async (value) => {
        if (value === 2) throw new Error('boom');
        return value;
      }),
    ).rejects.toThrow('boom');
  });
});

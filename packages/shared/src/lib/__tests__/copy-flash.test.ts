import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  writeClipboard: vi.fn(async () => true),
}));

import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import { createCopyFlash } from '../copy-flash.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('复制一下亮一会儿再复原', () => {
  it('★ 成功：先亮，到点复原', async () => {
    vi.useFakeTimers();
    const seen: boolean[] = [];
    const flash = createCopyFlash(1500);

    flash.copy('提示词', (copied) => seen.push(copied));
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([true]);

    vi.advanceTimersByTime(1500);
    expect(seen).toEqual([true, false]);
    flash.dispose();
  });

  it('★ 复制没成功：按钮不动（不假装复制了）', async () => {
    vi.mocked(writeClipboard).mockResolvedValueOnce(false);
    const seen: boolean[] = [];
    const flash = createCopyFlash(1500);

    flash.copy('提示词', (copied) => seen.push(copied));
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([]);
    flash.dispose();
  });

  it('★ 连续点两次：只有一条计时器，旧的不再回调', async () => {
    vi.useFakeTimers();
    const seen: boolean[] = [];
    const flash = createCopyFlash(1500);

    flash.copy('第一次', (copied) => seen.push(copied));
    await Promise.resolve();
    await Promise.resolve();
    flash.copy('第二次', (copied) => seen.push(copied));
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(1500);

    expect(seen).toEqual([true, true, false]);
    flash.dispose();
  });

  it('★ dispose 之后到点不再回调（组件已卸载）', async () => {
    vi.useFakeTimers();
    const seen: boolean[] = [];
    const flash = createCopyFlash(1500);

    flash.copy('提示词', (copied) => seen.push(copied));
    await Promise.resolve();
    await Promise.resolve();
    flash.dispose();
    vi.advanceTimersByTime(1500);

    expect(seen).toEqual([true]);
  });
});

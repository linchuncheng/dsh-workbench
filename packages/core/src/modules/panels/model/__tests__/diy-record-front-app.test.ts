import { describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import { WORKBENCH_ADAPTERS } from '@dsh-workbench/shared/host';
import { bringBackWorkbench, frontAppNow, rememberWorkbenchApp } from '../diy-record';

function ctxWith(runtime: {
  frontApp?: () => Promise<string | undefined>;
  bringToFront?: (ctx: DshHostContext, app: string) => Promise<boolean>;
}): DshHostContext {
  const adapters = { runtime };
  return { get: (key: string) => (key === WORKBENCH_ADAPTERS ? adapters : undefined) } as unknown as DshHostContext;
}

describe('结束录制后把工作台带回前台', () => {
  it('★ 开始录制时问适配器：现在谁是前台应用（那就是工作台）', async () => {
    const ctx = ctxWith({ frontApp: async () => 'DeepSeek Harness' });

    expect(await frontAppNow(ctx)).toBe('DeepSeek Harness');
  });

  it('★★ 人还停在录制页（前台是浏览器）→ 收回到工作台', async () => {
    const asked: string[] = [];
    const ctx = ctxWith({
      frontApp: async () => 'com.google.Chrome',
      bringToFront: async (_ctx, app) => {
        asked.push(app);
        return true;
      },
    });
    rememberWorkbenchApp('DeepSeek Harness');

    expect(await bringBackWorkbench(ctx)).toBe(true);
    expect(asked).toEqual(['DeepSeek Harness']);
  });

  it('★★ 人已经切去干别的（前台是终端 / 别的应用）→ 不抢焦点', async () => {
    const asked: string[] = [];
    const ctx = ctxWith({
      frontApp: async () => 'com.apple.Terminal',
      bringToFront: async (_ctx, app) => {
        asked.push(app);
        return true;
      },
    });
    rememberWorkbenchApp('DeepSeek Harness');

    expect(await bringBackWorkbench(ctx)).toBe(false);
    expect(asked).toEqual([]);
  });

  it('★ 工作台本来就在前台 → 什么都不用做', async () => {
    const asked: string[] = [];
    const ctx = ctxWith({
      frontApp: async () => 'DeepSeek Harness',
      bringToFront: async (_ctx, app) => {
        asked.push(app);
        return true;
      },
    });
    rememberWorkbenchApp('DeepSeek Harness');

    expect(await bringBackWorkbench(ctx)).toBe(true);
    expect(asked).toEqual([]);
  });

  it('★ 记到就一直带：两处收工（看守与 stop）都问得着，下一场 prepare 才覆盖', async () => {
    const asked: string[] = [];
    const ctx = ctxWith({
      frontApp: async () => 'com.google.Chrome',
      bringToFront: async (_ctx, app) => {
        asked.push(app);
        return true;
      },
    });
    rememberWorkbenchApp('DeepSeek Harness');

    expect(await bringBackWorkbench(ctx)).toBe(true);
    expect(await bringBackWorkbench(ctx)).toBe(true);
    expect(asked).toHaveLength(2);
  });

  it('★ 没记到 / 适配器没有这个能力 → 什么都不做，不猜应用名', async () => {
    expect(await bringBackWorkbench(ctxWith({}))).toBe(false);
    expect(await frontAppNow(ctxWith({}))).toBeUndefined();
  });
});

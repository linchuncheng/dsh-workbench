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

  it('★ 结束录制 → 让适配器把它带回前台', async () => {
    const asked: string[] = [];
    const ctx = ctxWith({
      bringToFront: async (_ctx, app) => {
        asked.push(app);
        return true;
      },
    });
    rememberWorkbenchApp('DeepSeek Harness');

    expect(await bringBackWorkbench(ctx)).toBe(true);
    expect(asked).toEqual(['DeepSeek Harness']);
  });

  it('★ 只带一次：第二回没东西可带，也不再问适配器', async () => {
    const asked: string[] = [];
    const ctx = ctxWith({
      bringToFront: async (_ctx, app) => {
        asked.push(app);
        return true;
      },
    });
    rememberWorkbenchApp('DeepSeek Harness');

    expect(await bringBackWorkbench(ctx)).toBe(true);
    expect(await bringBackWorkbench(ctx)).toBe(false);
    expect(asked).toHaveLength(1);
  });

  it('★ 没记到 / 适配器没有这个能力 → 什么都不做，不猜应用名', async () => {
    expect(await bringBackWorkbench(ctxWith({}))).toBe(false);
    expect(await frontAppNow(ctxWith({}))).toBeUndefined();
  });
});

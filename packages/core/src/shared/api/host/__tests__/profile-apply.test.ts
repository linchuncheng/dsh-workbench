import { describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import { createProfileApply } from '../profile-apply';

function ctxWith(hmr: unknown): DshHostContext {
  return { get: (name: string) => (name === 'hmr' ? hmr : undefined) } as unknown as DshHostContext;
}

describe('createProfileApply（重建后重新对账）', () => {
  it('没有 hmr：说没有，不假装对过账', async () => {
    const apply = createProfileApply(ctxWith(undefined));

    expect(await apply.apply()).toEqual({ ran: false, reason: 'no-hmr' });
    expect(await apply.reconcile()).toBe(false);
  });

  it('对账跑完：pending 原样带回（谁 pending 由上层按目录判断）', async () => {
    const pending = [{ url: 'file:///w/a/dist/host.js', reason: 'host-module' }];
    const apply = createProfileApply(
      ctxWith({ runExclusive: async (operation: () => Promise<unknown>) => operation(), reconcileProfile: async () => ({ pending }) }),
    );

    expect(await apply.apply()).toEqual({ ran: true, pending });
    expect(await apply.reconcile()).toBe(true);
  });

  it('对账抛了：apply 带上原因，reconcile 照常抛（显式调用不能悄悄成功）', async () => {
    const apply = createProfileApply(
      ctxWith({
        runExclusive: async () => {
          throw new Error('还没就绪');
        },
        reconcileProfile: async () => undefined,
      }),
    );

    expect(await apply.apply()).toEqual({ ran: false, reason: 'error', detail: '还没就绪' });
    await expect(apply.reconcile()).rejects.toThrow('还没就绪');
  });
});

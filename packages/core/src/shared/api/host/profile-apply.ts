import type { DshHostContext } from '@dsh-workbench/shared/host';
import type { BuildApplyOutcome, PendingModule } from './unit-builds';

interface HmrLike {
  runExclusive?<T>(operation: () => Promise<T>): Promise<T>;
  reconcileProfile?(): Promise<{ readonly pending?: readonly PendingModule[] | undefined } | undefined>;
}

export interface ProfileApply {
  apply(): Promise<BuildApplyOutcome>;
  reconcile(): Promise<boolean>;
}

export function createProfileApply(ctx: DshHostContext): ProfileApply {
  const apply = async (): Promise<BuildApplyOutcome> => {
    const hmr = ctx.get('hmr') as HmrLike | undefined;
    if (hmr?.runExclusive === undefined || hmr.reconcileProfile === undefined) return { ran: false, reason: 'no-hmr' };
    const reconcileProfile = hmr.reconcileProfile;
    try {
      const result = await hmr.runExclusive(() => reconcileProfile.call(hmr));
      const pending = result?.pending;
      return pending === undefined ? { ran: true } : { ran: true, pending };
    } catch (error) {
      return { ran: false, reason: 'error', detail: error instanceof Error ? error.message : String(error) };
    }
  };
  return {
    apply,
    reconcile: async () => {
      const outcome = await apply();
      if (!outcome.ran && outcome.reason === 'error') throw new Error(outcome.detail ?? '对账失败');
      return outcome.ran;
    },
  };
}

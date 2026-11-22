import type { DshHostContext, DshHmr } from '../../api/dsh.js';
import type { RestartReason } from '../../contract/protocol/bundle-install.js';

export const HMR_SERVICE = 'hmr';

export interface ProfileReload {
  readonly applied: boolean;
  readonly reason?: RestartReason | undefined;
}

export async function reconcileProfileRows(
  ctx: DshHostContext,
  rows: readonly string[],
): Promise<ProfileReload> {
  if (rows.length === 0) return { applied: false };
  const hmr = ctx.get(HMR_SERVICE) as DshHmr | undefined;
  if (hmr === undefined) return { applied: false, reason: 'no-hmr' };
  const result = await hmr.runExclusive(() => hmr.reconcileProfile(rows));
  return result.restartReason === undefined
    ? { applied: true }
    : { applied: false, reason: result.restartReason };
}

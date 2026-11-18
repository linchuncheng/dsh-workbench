import type { DshHostContext, DshToolRunContext } from '@dsh-workbench/shared/host';
import type { RecordState, RecordStore, Seam } from '@dsh-workbench/shared/host';
import { BROWSER_RECORD_SESSION, cliCommandOf, seamOf, sessionIdOf } from '@dsh-workbench/shared/host';

import { actBrowser } from './diy-browser-act';
import { armRecordPage } from './diy-record';
import { moveOrThrow, recordMissingText, recordPageOf, type RecordPageRead } from './diy-record-text';
import { wireOf, type Wire } from './diy-browser';
import { RECORD_STOP_SCRIPT } from './diy-record-read-scripts';
import { recordEval } from './diy-record-tab';

export interface RecordDoor {
  readonly seam: Seam;
  readonly wire: Wire;
  readonly sessionId: string;
  readonly held: RecordState;
  readonly command: string;
}

export function doorOf(
  ctx: DshHostContext,
  store: RecordStore,
  exec: DshToolRunContext,
  missing: string,
): RecordDoor {
  const seam = seamOf(ctx);
  if (seam === undefined) throw new Error(missing);
  const sessionId = sessionIdOf(exec) ?? '';
  return {
    seam,
    wire: wireOf(ctx),
    sessionId,
    held: heldOf(store, sessionId),
    command: cliCommandOf(ctx),
  };
}

export function heldOf(store: RecordStore, sessionId: string): RecordState {
  const held = store.live(Date.now());
  if (held === null) throw new Error(recordMissingText());
  if (held.sessionId !== sessionId) moveOrThrow({ ok: false, code: 'not-owner' }, held);
  return held;
}

export async function stopPageOf(seam: Seam, command: string, wire: Wire): Promise<RecordPageRead> {
  await armRecordPage(seam, command, BROWSER_RECORD_SESSION, wire);
  const step = await actBrowser(seam, command, BROWSER_RECORD_SESSION, recordEval(RECORD_STOP_SCRIPT), undefined, wire);
  return recordPageOf(step.payload);
}

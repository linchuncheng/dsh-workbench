import type { Seam } from '@dsh-workbench/shared/host';
import { bringBackCommand, frontAppCommand, frontAppOf, noWrite } from '@dsh-workbench/shared/host';
import { currentHostOs } from './platform.js';

const TIMEOUT_MS = 5000;

async function runFrontApp(
  seam: Seam,
  command: string | undefined,
): Promise<{ readonly stdout: string; readonly ok: boolean } | undefined> {
  if (command === undefined) return undefined;
  const result = await seam
    .run({ command, intent: noWrite(), retry: 'safe', timeoutMs: TIMEOUT_MS, bestEffort: true })
    .catch(() => undefined);
  if (result === undefined || result.timedOut) return undefined;
  return { stdout: result.stdout, ok: result.exitCode === 0 };
}

export async function frontAppNow(seam: Seam): Promise<string | undefined> {
  const platform = currentHostOs();
  const run = await runFrontApp(seam, frontAppCommand(platform));
  return run === undefined ? undefined : frontAppOf(run.stdout, platform);
}

export async function bringBackWindow(seam: Seam, app: string): Promise<boolean> {
  const run = await runFrontApp(seam, bringBackCommand(app, currentHostOs()));
  return run?.ok === true;
}

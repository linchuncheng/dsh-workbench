import type { DshHostContext } from '@dsh-workbench/shared/host';
import type { AdapterSet, BrowserCaptureRow, RuntimeCommandSurface } from '@dsh-workbench/shared/host';
import { WORKBENCH_ADAPTERS } from '@dsh-workbench/shared/host';

export function surfaceOf(ctx: DshHostContext): RuntimeCommandSurface | undefined {
  const adapters = ctx.get(WORKBENCH_ADAPTERS, false) as AdapterSet | undefined;
  return adapters?.runtime.commandSurface?.(ctx);
}

export function browserReadOf(ctx: DshHostContext): ((stdout: string) => unknown) | undefined {
  const surface = surfaceOf(ctx);
  const read = surface?.commandResult;
  return read === undefined ? undefined : (stdout: string) => read.call(surface, stdout);
}

export function browserRowsOf(ctx: DshHostContext): ((text: string) => readonly BrowserCaptureRow[]) | undefined {
  const surface = surfaceOf(ctx);
  const rows = surface?.browserCapture;
  return rows === undefined ? undefined : (text: string) => rows.call(surface, text);
}

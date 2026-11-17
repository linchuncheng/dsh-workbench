import { type Seam } from '@dsh-workbench/shared/host';
import { payloadOf, runBrowserStep, textOf, type BrowserStep, type Wire } from './diy-browser';

export const ACT_TIMEOUT_MS = 15000;

export interface ActStep extends BrowserStep {
  readonly payload: Record<string, unknown> | undefined;
}

export async function actBrowser(
  seam: Seam,
  command: string,
  session: string,
  argv: readonly string[],
  timeoutMs = ACT_TIMEOUT_MS,
  wire: Wire = {},
): Promise<ActStep> {
  const step = await runBrowserStep(
    seam,
    command,
    ['browser', session, ...argv, '--window', 'background'],
    timeoutMs,
    wire,
  );
  return { ...step, payload: payloadOf(step.stdout, wire.read) };
}

export function actErrorOf(step: ActStep): string {
  if (step.timedOut) return `运行时没在 ${String(Math.round(ACT_TIMEOUT_MS / 1000))} 秒内回来`;
  const payload = step.payload;
  const wrapped = payload?.['error'];
  const error =
    typeof wrapped === 'object' && wrapped !== null
      ? (wrapped as Record<string, unknown>)
      : !step.ok && payload !== undefined && typeof payload['message'] === 'string'
        ? payload
        : undefined;
  const message = textOf(error?.['message']);
  if (message !== '') {
    const hint = textOf(error?.['hint']);
    const head = hint === '' ? message : `${message}（${hint}）`;
    const extra = traceOf(error);
    return extra === '' ? head : `${head}\n${extra}`;
  }
  if (step.ok) return '';
  return step.stderr || step.stdout || '运行时报了个错';
}

function traceOf(error: Record<string, unknown> | undefined): string {
  if (error === undefined) return '';
  const lines: string[] = [];
  const candidates = error['candidates'];
  if (Array.isArray(candidates)) {
    const shown = candidates
      .slice(0, 3)
      .map((one) => {
        const row = typeof one === 'object' && one !== null ? (one as Record<string, unknown>) : {};
        const id = typeof row['id'] === 'number' ? String(row['id']) : textOf(row['id']);
        const title = textOf(row['title']);
        return [id, title].filter((part) => part !== '').join(' ');
      })
      .filter((one) => one !== '');
    if (shown.length > 0) lines.push(`候选：${shown.join(' / ')}`);
  }
  const trace = error['trace'];
  const dir = typeof trace === 'object' && trace !== null ? textOf((trace as Record<string, unknown>)['dir']) : '';
  if (dir !== '') lines.push(`追踪：${dir}`);
  return lines.join('\n');
}

export const SWEEP_TIMEOUT_MS = 4000;


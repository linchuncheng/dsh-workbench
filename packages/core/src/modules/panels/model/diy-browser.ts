import { productWrite, quoteShellArg, type DshHostContext, type Seam, type WriteIntent } from '@dsh-workbench/shared/host';
import { browserReadOf, surfaceOf } from '@/shared/api/host/runtime-surface';
import { PAGE_PROBE } from './diy-scripts';

const BACKGROUND_ENV: Readonly<Record<string, string>> = { OPENCLI_WINDOW: 'background' };
const FOREGROUND_ENV: Readonly<Record<string, string>> = { OPENCLI_WINDOW: 'foreground' };

export const LOOK_TIMEOUT_MS = 30000;

export interface BrowserStep {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly truncated: boolean;
}

export type LineMaker = (command: string, argv: readonly string[]) => string;

export function plainLine(command: string, argv: readonly string[]): string {
  return [command, ...argv].map(quoteShellArg).join(' ');
}

async function runStep(
  env: Readonly<Record<string, string>>,
  seam: Seam,
  command: string,
  argv: readonly string[],
  timeoutMs: number,
  wire: Wire,
  intent: WriteIntent,
): Promise<BrowserStep> {
  const result = await seam.run({
    command: (wire.line ?? plainLine)(command, argv),
    intent,
    timeoutMs,
    env,
  });
  return {
    ok: result.exitCode === 0 && !result.timedOut,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    truncated: result.truncated,
  };
}

function stepper(env: Readonly<Record<string, string>>) {
  return async function step(
    seam: Seam,
    command: string,
    argv: readonly string[],
    timeoutMs = LOOK_TIMEOUT_MS,
    wire: Wire = {},
    intent: WriteIntent = productWrite(),
  ): Promise<BrowserStep> {
    return runStep(env, seam, command, argv, timeoutMs, wire, intent);
  };
}

export const runBrowserStep = stepper(BACKGROUND_ENV);

export const runForegroundStep = stepper(FOREGROUND_ENV);

export function jsonOf(raw: string): Record<string, unknown> | undefined {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export type WireRead = (stdout: string) => unknown;

export interface Wire {
  readonly read?: WireRead;
  readonly line?: LineMaker;
}

export function wireOf(ctx: DshHostContext): Wire {
  const surface = surfaceOf(ctx);
  const read = browserReadOf(ctx);
  return {
    ...(read === undefined ? {} : { read }),
    ...(surface?.background === undefined ? {} : { line: surface.background }),
  };
}

export function payloadOf(raw: string, read?: WireRead): Record<string, unknown> | undefined {
  const text = raw.trim();
  if (text === '') return undefined;
  let value: unknown;
  try {
    value = read?.(text);
  } catch {
    value = undefined;
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  return jsonOf(text);
}

export function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export interface BoundTab {
  readonly ok: boolean;
  readonly url: string;
  readonly title: string;
  readonly reason: string;
}

export async function bindCurrentTab(
  seam: Seam,
  command: string,
  session: string,
  timeoutMs?: number,
  wire: Wire = {},
): Promise<BoundTab> {
  const step = await runBrowserStep(seam, command, ['browser', session, 'bind', '--window', 'background'], timeoutMs, wire);
  const parsed = payloadOf(step.stdout, wire.read);
  if (parsed === undefined) {
    return { ok: false, url: '', title: '', reason: step.timedOut ? '没在 30 秒内返回' : step.stderr || step.stdout };
  }
  const error = parsed['error'];
  if (typeof error === 'object' && error !== null) {
    const message = textOf((error as Record<string, unknown>)['message']);
    return { ok: false, url: '', title: '', reason: message === '' ? '运行时报了个错' : message };
  }
  return { ok: true, url: textOf(parsed['url']), title: textOf(parsed['title']), reason: '' };
}

export interface WorkbenchPage {
  readonly ok: boolean;
  readonly url: string;
  readonly title: string;
  readonly where: string;
  readonly board: string;
  readonly open: boolean | null;
  readonly shown: boolean;
}

export async function workbenchPageOf(
  seam: Seam,
  command: string,
  session: string,
  wire: Wire = {},
): Promise<WorkbenchPage> {
  const step = await runBrowserStep(
    seam,
    command,
    ['browser', session, 'eval', PAGE_PROBE, '--window', 'background'],
    undefined,
    wire,
  );
  const parsed = payloadOf(step.stdout, wire.read);
  if (parsed === undefined) return { ok: false, url: '', title: '', where: '', board: '', open: null, shown: false };
  const raw = parsed['open'];
  return {
    ok: textOf(parsed['plugin']) === '@dsh-workbench/core',
    url: textOf(parsed['url']),
    title: textOf(parsed['title']),
    where: textOf(parsed['where']),
    board: textOf(parsed['board']),
    open: typeof raw === 'boolean' ? raw : null,
    shown: parsed['shown'] === true,
  };
}

export async function writeShotsDir(seam: Seam, dir: string): Promise<boolean> {
  const line = ['mkdir', '-p', dir].map((one) => `'${one}'`).join(' ');
  const result = await seam.run({ command: line, intent: productWrite(), timeoutMs: LOOK_TIMEOUT_MS });
  return result.exitCode === 0 && !result.timedOut;
}

export interface PageHandshake {
  readonly ok: boolean;
  readonly bound: boolean;
  readonly page: WorkbenchPage;
  readonly reason: string;
}

export async function readyPageOf(
  seam: Seam,
  command: string,
  session: string,
  wire: Wire = {},
): Promise<PageHandshake> {
  const already = await workbenchPageOf(seam, command, session, wire);
  if (already.ok) return { ok: true, bound: false, page: already, reason: '' };
  const bound = await bindCurrentTab(seam, command, session, undefined, wire);
  if (!bound.ok) {
    return { ok: false, bound: false, page: already, reason: bound.reason };
  }
  const after = await workbenchPageOf(seam, command, session, wire);
  return { ok: after.ok, bound: true, page: after, reason: '' };
}

import { existsSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import type { BrowserCaptureRow } from '@dsh-workbench/shared/host';
import { appendTextFile, asRecord, productWrite, writeTextFile, type Seam } from '@dsh-workbench/shared/host';

export const LIVE_POLL_MS = 3000;
export const LIVE_ARM_MS = 2000;
export const LIVE_SNAP_TIMEOUT_MS = 15000;
export const LIVE_TAIL_LINES = 20000;
export const LIVE_KEY_LINES = 20;

export const STATIC_URL_PATTERN = `^(data:)|(\\.(js|css|png|jpe?g|gif|svg|woff2?|ico|map|webp|mp4)(\\?|$))`;

const STATIC_URL = new RegExp(STATIC_URL_PATTERN, 'i');

export type CaptureRowReader = (text: string) => readonly BrowserCaptureRow[];

interface LiveCapture {
  readonly file: string;
  readonly seam: Seam;
  readonly command: string;
  readonly session: string;
  readonly line: LiveLine | undefined;
  readonly rows: CaptureRowReader | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
  stopped: boolean;
}

const LIVE = new Map<string, LiveCapture>();

export type LiveLine = (command: string, argv: readonly string[]) => string;

function requestOf(
  line: LiveLine | undefined,
  command: string,
  session: string,
  args: readonly string[],
): { readonly argv: string[] } | { readonly command: string } {
  const bin = command === '' ? 'runtime' : command;
  const argv = ['browser', session, ...args, '--window', 'background'];
  return line === undefined ? { argv: [bin, ...argv] } : { command: line(bin, argv) };
}

function parsedRecord(text: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return asRecord(parsed);
}

function withoutStatic(record: Record<string, unknown>): string {
  const entries = Array.isArray(record['entries']) ? (record['entries'] as unknown[]) : [];
  const inside = entries.filter((one) => !STATIC_URL.test(String(asRecord(one)?.['url'] ?? '')));
  return inside.length === 0 ? '' : JSON.stringify({ ...record, entries: inside });
}

export function filterStaticLines(raw: string): string {
  const document = parsedRecord(raw.trim());
  if (document !== undefined && Array.isArray(document['entries'])) return withoutStatic(document);
  const kept: string[] = [];
  for (const line of raw.split('\n')) {
    const text = line.trim();
    if (text === '') continue;
    const record = parsedRecord(text);
    if (record === undefined || !Array.isArray(record['entries'])) {
      kept.push(text);
      continue;
    }
    const compact = withoutStatic(record);
    if (compact !== '') kept.push(compact);
  }
  return kept.join('\n');
}

export async function captureTickOnce(
  seam: Seam,
  command: string,
  session: string,
  file: string,
  timeoutMs = LIVE_SNAP_TIMEOUT_MS,
  rows?: CaptureRowReader,
  line?: LiveLine,
): Promise<string> {
  const step = await seam.run({
    ...requestOf(line, command, session, ['network', '--all', '--raw']),
    intent: productWrite(),
    timeoutMs,
  });
  const round = step.exitCode === 0 ? 'ok' : 'fail';
  writeTextFile(`${file}.first`, round);
  const text = rows === undefined ? filterStaticLines(step.stdout) : normalizedOf(rows, step.stdout);
  if (text !== '') appendTextFile(file, `${text}\n`);
  return round;
}

export async function startLiveCapture(input: {
  readonly seam: Seam;
  readonly command: string;
  readonly session: string;
  readonly file: string;
  readonly rows?: CaptureRowReader | undefined;
  readonly line?: LiveLine | undefined;
}): Promise<boolean> {
  const { seam, command, session, file, line } = input;
  stopLiveCapture(file);
  writeTextFile(file, '');
  for (const suffix of ['.first', '.last', '.round', '.pid', '.reaper']) rmSync(`${file}${suffix}`, { force: true });
  try {
    const arm = await seam.run({
      ...requestOf(line, command, session, ['network', '--follow', '--all']),
      intent: productWrite(),
      timeoutMs: LIVE_ARM_MS,
    });
    if (!arm.timedOut && arm.exitCode !== 0) return false;
    const text = input.rows === undefined ? arm.stdout.trim() : normalizedOf(input.rows, arm.stdout).trim();
    if (text !== '') appendTextFile(file, `${text}\n`);
  } catch {
    return false;
  }
  const entry: LiveCapture = { file, seam, command, session, line, rows: input.rows, timer: undefined, stopped: false };
  LIVE.set(file, entry);
  scheduleTick(entry);
  return true;
}

function scheduleTick(entry: LiveCapture): void {
  entry.timer = setTimeout(() => {
    void runTick(entry);
  }, LIVE_POLL_MS);
  entry.timer.unref?.();
}

async function runTick(entry: LiveCapture): Promise<void> {
  if (entry.stopped) return;
  try {
    await captureTickOnce(
      entry.seam,
      entry.command,
      entry.session,
      entry.file,
      LIVE_SNAP_TIMEOUT_MS,
      entry.rows,
      entry.line,
    );
  } catch {
    entry.timer = undefined;
  }
  if (entry.stopped) return;
  scheduleTick(entry);
}

function normalizedOf(rows: CaptureRowReader, raw: string): string {
  try {
    return rows(raw)
      .map((one) => JSON.stringify(one))
      .join('\n');
  } catch {
    return filterStaticLines(raw);
  }
}

export function stopLiveCapture(file: string): boolean {
  const live = LIVE.get(file);
  for (const suffix of ['.pid', '.reaper', '.round']) rmSync(`${file}${suffix}`, { force: true });
  if (live !== undefined) {
    live.stopped = true;
    if (live.timer !== undefined) clearTimeout(live.timer);
    LIVE.delete(file);
  }
  return live !== undefined || existsSync(`${file}.last`) || existsSync(`${file}.first`);
}

export function liveCaptureOf(file: string): boolean {
  return LIVE.has(file);
}

function readText(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

export function appendCaptureLine(file: string, line: string): boolean {
  if (line === '') return false;
  try {
    appendTextFile(file, `${line}\n`);
    return true;
  } catch {
    return false;
  }
}

export function readCaptureLines(file: string): number {
  return (readText(file).match(/\n/g) ?? []).length;
}

export function readCaptureRound(file: string): string {
  const text = readText(`${file}.first`).trim();
  return text === 'ok' || text === 'fail' ? text : '';
}

export function readCaptureText(file: string): { readonly text: string; readonly truncated: boolean } {
  const text = readText(file);
  if (text === '') return { text: '', truncated: false };
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  const kept = lines.slice(-LIVE_TAIL_LINES);
  return { text: kept.length === 0 ? '' : `${kept.join('\n')}\n`, truncated: lines.length > LIVE_TAIL_LINES };
}

export function readCaptureLinesWithKey(file: string, key: string): string {
  const text = readText(file);
  if (text === '') return '';
  const compact = `"key":"${key}"`;
  const spaced = `"key": "${key}"`;
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (out.length >= LIVE_KEY_LINES) break;
    if (line.includes(compact) || line.includes(spaced)) out.push(line);
  }
  return out.length === 0 ? '' : `${out.join('\n')}\n`;
}

export function keepCaptureFile(file: string): boolean {
  const last = `${file}.last`;
  try {
    renameSync(file, last);
    return statSync(last).size > 0;
  } catch {
    return false;
  }
}

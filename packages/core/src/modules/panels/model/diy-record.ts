import { join } from 'node:path';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import type { RecordState } from '@dsh-workbench/shared/host';
import { adaptersOf, BROWSER_RECORD_SESSION, type Seam } from '@dsh-workbench/shared/host';
import {
  LIVE_TAIL_LINES,
  keepCaptureFile,
  readCaptureLines,
  readCaptureLinesWithKey,
  readCaptureRound,
  readCaptureText,
  startLiveCapture,
  stopLiveCapture,
  type LiveLine,
} from '@/shared/api/host/diy-capture-live';

import { actBrowser, type ActStep } from './diy-browser-act';
import type { Wire } from './diy-browser';
import { RECORD_ARM_SCRIPTS, RECORD_RESET_SCRIPT } from './diy-record-scripts';
import { forgetRecordTab, recordedTabOf, recordEval, trimmedNameOf } from './diy-record-tab';
import { captureCallsOf, captureEntriesOf, mergeCalls, segmentOf } from './diy-record-capture';
import type { CaptureRows } from './diy-record-capture';
import type { CaptureEntry } from './diy-record-capture';
import { domainOf, listRowsOf, readDomainsOf, renderRecordDetail } from './diy-record-text';
import type { RecordCall, RecordDetailFacts, RecordListRow, RecordPageRead } from './diy-record-text';
import { plainJson } from './diy-context';

export const OPEN_TIMEOUT_MS = 30000;
export const SETTLE_MS = 2000;
export const WAIT_CAP_MS = 15 * 60 * 1000;
export const POLL_MS = 1000;
const BRING_BACK_MS = 350;
const CAPTURE_TAIL_LINES = LIVE_TAIL_LINES;

export { STATIC_URL_PATTERN } from '@/shared/api/host/diy-capture-live';
export const DETAIL_MAX_BYTES = 60000;

export interface ArmOutcome {
  readonly step: ActStep;
  readonly part: number;
  readonly parts: number;
}

export interface ArmOptions {
  readonly reset?: boolean;
}

export async function armRecordPage(
  seam: Seam,
  command: string,
  session: string,
  wire?: Wire,
  options: ArmOptions = {},
): Promise<ArmOutcome> {
  if (options.reset === true) {
    await actBrowser(seam, command, session, recordEval(RECORD_RESET_SCRIPT), undefined, wire);
  }
  const parts = RECORD_ARM_SCRIPTS.length;
  let out: ArmOutcome | undefined;
  for (const [index, script] of RECORD_ARM_SCRIPTS.entries()) {
    const step = await actBrowser(seam, command, session, recordEval(script), undefined, wire);
    out = { step, part: index + 1, parts };
    if (!step.ok) break;
  }
  if (out === undefined) throw new Error('没有可注入的浮条脚本');
  return out;
}

let workbenchApp: string | undefined;

export function rememberWorkbenchApp(app: string | undefined): void {
  workbenchApp = trimmedNameOf(app);
}

export async function frontAppNow(ctx: DshHostContext): Promise<string | undefined> {
  try {
    return await adaptersOf(ctx).runtime.frontApp?.(ctx);
  } catch {
    return undefined;
  }
}

async function bringBackOnce(ctx: DshHostContext): Promise<boolean> {
  const app = workbenchApp;
  if (app === undefined) return false;
  try {
    return (await adaptersOf(ctx).runtime.bringToFront?.(ctx, app)) === true;
  } catch {
    return false;
  }
}


export async function raiseBrowserNow(ctx: DshHostContext): Promise<boolean> {
  try {
    return (await adaptersOf(ctx).runtime.raiseBrowser?.(ctx)) === true;
  } catch {
    return false;
  }
}

export async function bringBackWorkbench(ctx: DshHostContext): Promise<boolean> {
  if (workbenchApp === undefined) return false;
  if (await bringBackOnce(ctx)) return true;
  await pauseFor(BRING_BACK_MS);
  return bringBackOnce(ctx);
}

export const pauseFor = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

export function waitOf(value: unknown): number {
  const raw = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.min(Math.max(raw, 0), WAIT_CAP_MS);
}

export function foreignDomainText(design: unknown, url: string): string {
  const known = readDomainsOf(design);
  if (known.length === 0) return '';
  const domain = domainOf(url);
  if (domain === '' || known.includes(domain)) return '';
  return (
    `这一页（${domain}）跟这个模块已经探明的读源（${known.join(' / ')}）不是一个域 —— ` +
    '录下来的请求原文要留在本机（工作台的取证目录），不许跨域录。换成它那个域的页面，或者先把这个模块的读源说清。'
  );
}

export function captureFileOf(artifactsDir: string, unit: string): string {
  return join(artifactsDir, `rec-${unit}.jsonl`);
}

export function lastCaptureFileOf(file: string): string {
  return `${file}.last`;
}

export async function startRecordCapture(
  seam: Seam,
  command: string,
  session: string,
  file: string,
  rows?: CaptureRows,
  line?: LiveLine,
): Promise<boolean> {
  return startLiveCapture({ seam, command, session, file, rows, line });
}

export interface CaptureRead {
  readonly text: string;
  readonly totalLines: number;
  readonly tailLimit: number;
  readonly truncated: boolean;
  readonly round: string;
}

export function captureLinesOf(file: string): number {
  return readCaptureLines(file);
}

export function captureRoundOf(file: string): string {
  return readCaptureRound(file);
}

export function captureTextOf(file: string): { readonly text: string; readonly truncated: boolean } {
  return readCaptureText(file);
}

export function captureReadOf(file: string): CaptureRead {
  const totalLines = readCaptureLines(file);
  const text = readCaptureText(file);
  return {
    text: text.text,
    totalLines,
    tailLimit: CAPTURE_TAIL_LINES,
    truncated: text.truncated || totalLines > CAPTURE_TAIL_LINES,
    round: readCaptureRound(file),
  };
}

export function keepCaptureOf(file: string): boolean {
  return keepCaptureFile(file);
}

export function captureLinesWithKeyOf(file: string, key: string): string {
  return readCaptureLinesWithKey(file, key);
}

export interface SegmentBundle {
  readonly capture: CaptureRead;
  readonly entries: readonly CaptureEntry[];
  readonly inside: readonly CaptureEntry[];
  readonly outside: number;
  readonly merged: readonly RecordCall[];
  readonly rows: readonly RecordListRow[];
}

export function bundleOf(
  capture: CaptureRead,
  page: RecordPageRead,
  state: RecordState,
  rows?: CaptureRows,
): SegmentBundle {
  const entries = captureEntriesOf(capture.text, rows);
  const segment = segmentOf(entries, page.t0 ?? state.t0, page.t1 ?? state.t1);
  const merged = mergeCalls(page.calls, captureCallsOf(segment.inside));
  return {
    capture,
    entries,
    inside: segment.inside,
    outside: segment.outside,
    merged,
    rows: listRowsOf(merged, state.expect),
  };
}

export function hookCallOf(page: RecordPageRead, key: string): RecordCall | null {
  const want = key.trim();
  const bare = want.replace(/#\d+$/, '');
  for (const one of page.calls) {
    if (one.key !== '' && one.key === want) return one;
    if (`${one.method} ${one.url}` === bare) return one;
  }
  return null;
}

const DETAIL_WHERE_CAPTURE = '会话捕获（浏览器那一层，快照原文）';
const DETAIL_WHERE_HOOK = '页面钩子（这一段）';

const DETAIL_KEYS = [
  'key',
  'method',
  'url',
  'status',
  'ct',
  'at',
  'request',
  'response',
  'headers',
  'requestFullSize',
  'responseFullSize',
  'requestSizeExact',
  'responseSizeExact',
  'ambiguous',
  'source',
] as const;

function detailFactsOf(input: RecordDetailFacts & { readonly key: string }): Record<string, unknown> {
  const picked = Object.fromEntries(DETAIL_KEYS.map((one) => [one, input[one]]));
  return plainJson({ ok: true, found: true, ...picked, text: renderRecordDetail(input) });
}

type DetailRow = Omit<RecordDetailFacts, 'found' | 'where' | 'source' | 'ambiguous' | 'maxBytes' | 'note'> & {
  readonly key: string;
};

const ROW_KEYS = [
  'key',
  'method',
  'url',
  'status',
  'ct',
  'at',
  'request',
  'response',
  'headers',
  'requestFullSize',
  'responseFullSize',
  'requestSizeExact',
  'responseSizeExact',
] as const;

const rowOf = (one: Record<string, unknown>): DetailRow =>
  Object.fromEntries(ROW_KEYS.map((key) => [key, one[key]])) as DetailRow;

const detailOfRow = (
  row: DetailRow,
  where: string,
  source: string,
  maxBytes: number,
  ambiguous: number,
): Record<string, unknown> => detailFactsOf({ ...row, found: true, where, source, ambiguous, maxBytes, note: '' });

export function detailOfEntry(entry: CaptureEntry, maxBytes: number, ambiguous = 1): Record<string, unknown> {
  return detailOfRow(rowOf({ ...entry }), DETAIL_WHERE_CAPTURE, 'capture', maxBytes, ambiguous);
}

export function detailOfCall(call: RecordCall, maxBytes: number): Record<string, unknown> {
  const shape = {
    ...call,
    request: call.body,
    headers: '',
    requestFullSize: call.body.length,
    responseFullSize: call.response.length,
    requestSizeExact: false,
    responseSizeExact: false,
  };
  return detailOfRow(rowOf(shape), DETAIL_WHERE_HOOK, 'hook', maxBytes, 0);
}

function blanksOf(pages: readonly Record<string, unknown>[] | null, keep: string): readonly string[] {
  if (pages === null) return [];
  return pages
    .filter((one) => typeof one['url'] === 'string' && (one['url'] === '' || one['url'] === 'about:blank'))
    .map((one) => (typeof one['page'] === 'string' ? one['page'] : ''))
    .filter((one) => one !== '' && one !== keep);
}

function tabsOf(raw: string): readonly Record<string, unknown>[] | null {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((one): one is Record<string, unknown> => typeof one === 'object' && one !== null);
  } catch {
    return null;
  }
}

async function sweepBlanksOf(seam: Seam, command: string, session: string, wire?: Wire): Promise<void> {
  const listed = await actBrowser(seam, command, session, ['tab', 'list'], undefined, wire);
  const pages = tabsOf(listed.stdout);
  if (pages === null) return;
  for (const one of blanksOf(pages, '')) {
    await actBrowser(seam, command, session, ['tab', 'close', one], undefined, wire);
  }
}

export async function closeLeftoverTabOf(seam: Seam, command: string, url: string, wire?: Wire): Promise<void> {
  if (recordedTabOf() === undefined) return;
  try {
    await closeRecordTab(seam, command, BROWSER_RECORD_SESSION, url, wire, recordedTabOf());
  } catch {
    forgetRecordTab();
  }
}

export async function closeRecordTab(
  seam: Seam,
  command: string,
  session: string,
  url: string,
  wire?: Wire,
  tab?: string,
): Promise<boolean> {
  const listed = await actBrowser(seam, command, session, ['tab', 'list'], undefined, wire);
  const pages = tabsOf(listed.stdout);
  if (pages !== null && pages.length === 0) return true;
  const named = tab !== undefined && tab !== '' ? tab : '';
  const known = named !== '' && pages !== null && pages.some((one) => one['page'] === named) ? named : '';
  const exact = pages?.find((one) => typeof one['url'] === 'string' && one['url'] === url);
  const found = exact === undefined ? '' : typeof exact['page'] === 'string' ? exact['page'] : '';
  const page = known !== '' ? known : found;
  if (page === '') {
    const released = await actBrowser(seam, command, session, ['close'], undefined, wire);
    return released.ok;
  }
  const done = await actBrowser(seam, command, session, ['tab', 'close', page], undefined, wire);
  if (!done.ok) {
    const released = await actBrowser(seam, command, session, ['close'], undefined, wire);
    return released.ok;
  }
  for (const one of blanksOf(pages, page)) {
    await actBrowser(seam, command, session, ['tab', 'close', one], undefined, wire);
  }
  await sweepBlanksOf(seam, command, session, wire);
  await actBrowser(seam, command, session, ['close'], undefined, wire);
  forgetRecordTab();
  return true;
}

export interface RecordRelease {
  readonly seam: Seam;
  readonly command: string;
  readonly session: string;
  readonly url: string;
  readonly captureFile: string;
  readonly wire?: Wire;
  readonly tab?: string;
}

export async function releaseRecord(input: RecordRelease): Promise<{ readonly tab: boolean; readonly capture: boolean }> {
  const capture = stopLiveCapture(input.captureFile);
  const tab = await closeRecordTab(input.seam, input.command, input.session, input.url, input.wire, input.tab);
  return { tab, capture };
}

export async function releaseQuietly(input: RecordRelease): Promise<{ readonly tab: boolean; readonly capture: boolean }> {
  try {
    return await releaseRecord(input);
  } catch {
    return { tab: false, capture: false };
  }
}

import { actBrowser, actErrorOf } from './diy-browser-act';
import { recordEval } from './diy-record-tab';
import type { Wire } from './diy-browser';
import { payloadOf, runForegroundStep } from './diy-browser';
import type { Seam } from '@dsh-workbench/shared/host';
import { OPEN_TIMEOUT_MS, SETTLE_MS, releaseQuietly } from './diy-record';
import { RECORD_ARM_BAR_SCRIPT } from './diy-record-bar-scripts';

export function samePageOf(here: string, want: string): boolean {
  const norm = (one: string): string => one.replace(/[?#].*$/, '').replace(/\/+$/, '');
  return here !== '' && norm(here) === norm(want);
}

async function waitPageOf(
  input: {
    readonly seam: Seam;
    readonly command: string;
    readonly session: string;
    readonly wire?: Wire | undefined;
  },
  url: string,
): Promise<{ readonly href: string; readonly why: string }> {
  const deadline = Date.now() + SETTLE_MS;
  let seen = await paintAtOf(input);
  while (!samePageOf(seen.href, url) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    seen = await paintAtOf(input);
  }
  return seen;
}

async function paintAtOf(input: {
  readonly seam: Seam;
  readonly command: string;
  readonly session: string;
  readonly wire?: Wire | undefined;
}): Promise<{ readonly href: string; readonly why: string }> {
  const step = await actBrowser(
    input.seam,
    input.command,
    input.session,
    recordEval(RECORD_ARM_BAR_SCRIPT),
    undefined,
    input.wire,
  );
  if (!step.ok) return { href: '', why: actErrorOf(step) };
  const href = step.payload === undefined ? undefined : step.payload['href'];
  const at = typeof href === 'string' ? href : '';
  return { href: at, why: at === '' ? actErrorOf(step) : '' };
}

interface OpenRecordInput {
  readonly seam: Seam;
  readonly command: string;
  readonly session: string;
  readonly url: string;
  readonly captureFile: string;
  readonly wire?: Wire | undefined;
  readonly tab?: string | undefined;
}

export async function openRecordWithRetryOf(input: OpenRecordInput): Promise<{
  readonly ok: boolean;
  readonly at: string;
  readonly why: string;
  readonly reused: boolean;
  readonly page?: string;
}> {
  const reused = await openRecordPage(input);
  if (reused.ok || input.tab === undefined || input.tab === '') return reused;
  return openRecordPage({ ...input, tab: undefined });
}

export async function openRecordPage(input: OpenRecordInput): Promise<{
  readonly ok: boolean;
  readonly at: string;
  readonly why: string;
  readonly reused: boolean;
  readonly page?: string;
}> {
  const reuse = input.tab !== undefined && input.tab !== '';
  if (!reuse) await releaseQuietly(input);
  const opened = reuse ? undefined : await runForegroundStep(
        input.seam,
        input.command,
        ['browser', input.session, 'tab', 'new', input.url, '--window', 'foreground'],
        OPEN_TIMEOUT_MS,
        input.wire,
      );
  if (opened !== undefined && !opened.ok) {
    return {
      ok: false,
      at: '',
      reused: reuse,
      why:
        `开不了录制窗：${opened.stderr || opened.stdout || '运行时那边报了个错'}。` +
        '先让用户把工作台那一页切到前台（第一次要这样），或跑一次运行时自检（doctor）看扩展连没连上。',
    };
  }
  const openedBox = opened === undefined ? undefined : payloadOf(opened.stdout, input.wire?.read);
  const openedPage = openedBox === undefined ? undefined : openedBox['page'];
  const openedTab = openedBox === undefined ? undefined : openedBox['tab'];
  const carried = typeof openedTab === 'string' ? openedTab : undefined;
  const page = reuse ? input.tab : typeof openedPage === 'string' ? openedPage : carried;
  let seen = await waitPageOf(input, input.url);
  if (!samePageOf(seen.href, input.url)) {
    await runForegroundStep(
      input.seam,
      input.command,
      ['browser', input.session, 'open', input.url, '--window', 'foreground'],
      OPEN_TIMEOUT_MS,
      input.wire,
    );
    seen = await waitPageOf(input, input.url);
  }
  if (!samePageOf(seen.href, input.url)) {
    const where = seen.href === '' ? '一张空白页' : seen.href;
    const reason = seen.why === '' ? '' : `，页面的回话是 ${seen.why}`;
    return {
      ok: false,
      at: seen.href,
      reused: reuse,
      why:
        `那一页没开起来（现在开的是 ${where}${reason}）—— 再看一眼 Chrome 里那扇录制窗，` +
        '或跑一次运行时自检（doctor）看扩展连没连上。',
    };
  }
  const resolved = page === undefined ? await tabIdAtOf(input, seen.href) : page;
  return { ok: true, at: seen.href, why: '', reused: reuse, ...(resolved === undefined ? {} : { page: resolved }) };
}

async function tabIdAtOf(input: OpenRecordInput, url: string): Promise<string | undefined> {
  const step = await actBrowser(input.seam, input.command, input.session, ['tab', 'list'], undefined, input.wire);
  if (!step.ok) return undefined;
  const rows = Array.isArray(step.payload) ? step.payload : undefined;
  const list = rows === undefined ? asRowsOf(step.stdout) : rows;
  const hit = list.find((one) => samePageOf(textIn(one['url']), url));
  const tab = hit === undefined ? undefined : textIn(hit['page']);
  return tab === '' ? undefined : tab;
}

function asRowsOf(raw: string): ReadonlyArray<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(raw);
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed !== null && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>)['data'])
        ? ((parsed as Record<string, unknown>)['data'] as unknown[])
        : [];
    return rows.filter((one): one is Record<string, unknown> => one !== null && typeof one === 'object');
  } catch {
    return [];
  }
}

function textIn(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

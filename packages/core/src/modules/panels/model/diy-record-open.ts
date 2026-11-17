import { actBrowser, actErrorOf } from './diy-browser-act';
import type { Wire } from './diy-browser';
import { payloadOf, runBrowserStep, runForegroundStep } from './diy-browser';
import type { Seam } from '@dsh-workbench/shared/host';
import { OPEN_TIMEOUT_MS, SETTLE_MS, releaseQuietly } from './diy-record';

const PAGE_HREF_SCRIPT = 'JSON.stringify({ href: location.href })';

export function samePageOf(here: string, want: string): boolean {
  const norm = (one: string): string => one.replace(/[?#].*$/, '').replace(/\/+$/, '');
  return here !== '' && norm(here) === norm(want);
}

async function whereAtOf(input: {
  readonly seam: Seam;
  readonly command: string;
  readonly session: string;
  readonly wire?: Wire | undefined;
}): Promise<{ readonly href: string; readonly why: string }> {
  const step = await actBrowser(
    input.seam,
    input.command,
    input.session,
    ['eval', PAGE_HREF_SCRIPT],
    undefined,
    input.wire,
  );
  const href = step.payload === undefined ? '' : step.payload['href'];
  const at = typeof href === 'string' ? href : '';
  return { href: at, why: at === '' ? actErrorOf(step) : '' };
}

async function settleOf(input: {
  readonly seam: Seam;
  readonly command: string;
  readonly session: string;
  readonly wire?: Wire | undefined;
}): Promise<void> {
  await runBrowserStep(
    input.seam,
    input.command,
    ['browser', input.session, 'wait', 'time', String(SETTLE_MS / 1000)],
    OPEN_TIMEOUT_MS,
    input.wire,
  );
}

export async function openRecordPage(input: {
  readonly seam: Seam;
  readonly command: string;
  readonly session: string;
  readonly url: string;
  readonly captureFile: string;
  readonly wire?: Wire | undefined;
}): Promise<{ readonly ok: boolean; readonly at: string; readonly why: string; readonly page?: string }> {
  await releaseQuietly(input);
  const opened = await runForegroundStep(
    input.seam,
    input.command,
    ['browser', input.session, 'tab', 'new', input.url, '--window', 'foreground'],
    OPEN_TIMEOUT_MS,
    input.wire,
  );
  if (!opened.ok) {
    return {
      ok: false,
      at: '',
      why:
        `开不了录制窗：${opened.stderr || opened.stdout || '运行时那边报了个错'}。` +
        '先让用户把工作台那一页切到前台（第一次要这样），或跑一次运行时自检（doctor）看扩展连没连上。',
    };
  }
  const openedBox = payloadOf(opened.stdout, input.wire?.read);
  const openedPage = openedBox === undefined ? undefined : openedBox['page'];
  const page = typeof openedPage === 'string' ? openedPage : undefined;
  await settleOf(input);
  let seen = await whereAtOf(input);
  if (!samePageOf(seen.href, input.url)) {
    await runForegroundStep(
      input.seam,
      input.command,
      ['browser', input.session, 'open', input.url, '--window', 'foreground'],
      OPEN_TIMEOUT_MS,
      input.wire,
    );
    await settleOf(input);
    seen = await whereAtOf(input);
  }
  if (!samePageOf(seen.href, input.url)) {
    const where = seen.href === '' ? '一张空白页' : seen.href;
    const reason = seen.why === '' ? '' : `，页面的回话是 ${seen.why}`;
    return {
      ok: false,
      at: seen.href,
      why:
        `那一页没开起来（现在开的是 ${where}${reason}）—— 再看一眼 Chrome 里那扇录制窗，` +
        '或跑一次运行时自检（doctor）看扩展连没连上。',
    };
  }
  return { ok: true, at: seen.href, why: '', ...(page === undefined ? {} : { page }) };
}

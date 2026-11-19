import { dirname, join } from 'node:path';
import {
  BROWSER_RECORD_SESSION,
  type DshHostContext,
  type RecordStore,
  type Seam,
} from '@dsh-workbench/shared/host';
import { actBrowser } from './diy-browser-act';
import type { Wire } from './diy-browser';
import { deliverDebugNotice, noticeMessage, type AgentsLookup } from '@/shared/api/host/diy-debug-act';
import { appendCaptureLine, readCaptureRound, readCaptureText, stopLiveCapture } from '@/shared/api/host/diy-capture-live';
import { captureEntriesOf, captureLineOf, segmentOf } from './diy-record-capture';
import { recordPageOf } from './diy-record-text';
import type { RecordCall } from './diy-record-text';
import { DIY_RECORD_DETAIL_TOOL, DIY_RECORD_READ_TOOL } from '../unit';
import { armRecordPage, bringBackWorkbench, releaseQuietly } from './diy-record';
import { recordEval, recordedTabOf, takeSnapOf } from './diy-record-tab';
import { RECORD_READ_SCRIPT } from './diy-record-read-scripts';

function shotFileOf(captureFile: string, unit: string, n: number, seg: number): string {
  const stamp = Number.isFinite(seg) && seg > 0 ? `-${Math.floor(seg / 1000).toString(36)}` : '';
  return join(dirname(captureFile), `rec-shot-${unit}${stamp}-${String(n)}.png`);
}

async function takeShotOf(input: WatchFinishDeps, unit: string, n: number, seg: number): Promise<void> {
  const path = shotFileOf(input.captureFile, unit, n, seg);
  const step = await actBrowser(input.seam, input.command, BROWSER_RECORD_SESSION, ['screenshot', path], undefined, input.wire);
  if (step.ok) input.store.shotSeen(input.sessionId, n, Date.now());
}

export interface WatchFinishDeps {
  readonly ctx: DshHostContext;
  readonly seam: Seam;
  readonly command: string;
  readonly sessionId: string;
  readonly store: RecordStore;
  readonly url: string;
  readonly captureFile: string;
  readonly wire?: Wire;
}

async function releaseLeftoversOf(input: WatchFinishDeps): Promise<void> {
  await releaseQuietly({
    seam: input.seam,
    command: input.command,
    session: BROWSER_RECORD_SESSION,
    url: input.url,
    captureFile: input.captureFile,
    wire: input.wire,
    tab: recordedTabOf(),
  });
}

async function healRecordPage(input: WatchFinishDeps): Promise<void> {
  try {
    await armRecordPage(input.seam, input.command, BROWSER_RECORD_SESSION, input.wire);
  } catch {}
}

async function stopCaptureQuiet(input: WatchFinishDeps): Promise<boolean> {
  try {
    return stopLiveCapture(input.captureFile);
  } catch {
    return false;
  }
}

async function recordTabCount(input: WatchFinishDeps): Promise<number> {
  try {
    const step = await actBrowser(input.seam, input.command, BROWSER_RECORD_SESSION, ['tab', 'list'], undefined, input.wire);
    const box = step.payload;
    const rows = Array.isArray(box) ? box : Array.isArray(box?.['data']) ? box['data'] : undefined;
    return rows === undefined ? -1 : rows.length;
  } catch {
    return -1;
  }
}

async function leftoversAndStop(input: WatchFinishDeps): Promise<{ readonly stop: true; readonly delivered: false }> {
  await releaseLeftoversOf(input);
  return { stop: true, delivered: false };
}

async function finishWatcher(
  input: WatchFinishDeps,
  keepCapture: boolean,
  state?: { readonly t0?: number | null; readonly t1?: number | null },
): Promise<{ readonly stop: true; readonly delivered: false }> {
  if (keepCapture) await stopCaptureQuiet(input);
  try {
    const step = await actBrowser(
      input.seam,
      input.command,
      BROWSER_RECORD_SESSION,
      recordEval(RECORD_READ_SCRIPT),
      undefined,
      input.wire,
    );
    const page = recordPageOf(step.payload);
    if (page.ok) await keepHookCalls(input, page.calls, state);
  } catch {}
  await bringBackWorkbench(input.ctx);
  await takeSnapOf(input.seam, input.command, input.captureFile, input.wire);
  return { stop: true, delivered: false };
}

async function keepHookCalls(
  input: WatchFinishDeps,
  calls: readonly RecordCall[],
  state?: { readonly t0?: number | null; readonly t1?: number | null },
): Promise<boolean> {
  if (calls.length === 0) return false;
  const captured = readCaptureText(input.captureFile).text;
  const failed = readCaptureRound(input.captureFile) === 'fail';
  if (failed) return appendCaptureLine(input.captureFile, captureLineOf(calls));
  const t0 = state?.t0 ?? null;
  const t1 = state?.t1 ?? null;
  if (t0 !== null && t1 !== null) {
    const inside = segmentOf(captureEntriesOf(captured), t0, t1).inside;
    if (inside.length > 0) return false;
  }
  return appendCaptureLine(input.captureFile, captureLineOf(calls));
}

export async function watchFinishStepOf(
  input: WatchFinishDeps,
): Promise<{ readonly stop: boolean; readonly delivered: boolean }> {
  const live = input.store.live(Date.now());
  if (live === null) return leftoversAndStop(input);
  if (live.sessionId !== input.sessionId) return { stop: true, delivered: false };
  if (live.phase === 'finished') return finishWatcher(input, false, live);
  let page: ReturnType<typeof recordPageOf>;
  try {
    const step = await actBrowser(
      input.seam,
      input.command,
      BROWSER_RECORD_SESSION,
      recordEval(RECORD_READ_SCRIPT),
      undefined,
      input.wire,
    );
    page = recordPageOf(step.payload);
  } catch {
    return { stop: false, delivered: false };
  }
  const held = input.store.live(Date.now());
  if (held === null) return leftoversAndStop(input);
  if (held.sessionId !== input.sessionId) return { stop: true, delivered: false };
  if (held.phase === 'finished') return finishWatcher(input, true, held);
  if (!page.ok) {
    const left = await recordTabCount(input);
    return left === 0 ? finishWatcher(input, true) : { stop: false, delivered: false };
  }
  if (page.hooked === false && !(page.phase === 'finished' && page.t1 !== null)) {
    await healRecordPage(input);
    return { stop: false, delivered: false };
  }
  if (page.shots > held.shotsSeen) await takeShotOf(input, held.unit, page.shots, held.startedAt);
  if (page.phase === 'finished' && page.t1 !== null) {
    if (page.t1 < held.startedAt) {
      await armRecordPage(input.seam, input.command, BROWSER_RECORD_SESSION, input.wire, { reset: true });
      return { stop: false, delivered: false };
    }
    const now = Date.now();
    if (held.phase === 'armed') input.store.started(input.sessionId, page.t0 ?? 0, now);
    if (input.store.live(Date.now())?.phase === 'recording') {
      input.store.finished(input.sessionId, page.t1, now);
    }
    const caught = page.calls.length;
    await stopCaptureQuiet(input);
    const back = await bringBackWorkbench(input.ctx);
    await keepHookCalls(input, page.calls);
    await takeSnapOf(input.seam, input.command, input.captureFile, input.wire);
    const summary = `工作台 DIY：录制完成（${String(caught)} 条）`;
    deliverDebugNotice(
      input.ctx.get('agents') as AgentsLookup | undefined,
      input.sessionId,
      noticeMessage(
        `用户按「结束录制」（页面钩子记录 ${String(caught)} 条）。调用 ${DIY_RECORD_READ_TOOL} 读取本段清单；需要某一条原文时调用 ${DIY_RECORD_DETAIL_TOOL}。` +
          '录制窗口暂时保留（结束只停止采集，不关闭窗口），收尾时才关闭。' +
          (back ? '' : '（结束时未能把工作台切回前台，用户可能仍停在其他窗口。）'),
        summary,
      ),
      'wake',
    );
    return { stop: true, delivered: true };
  }
  if (page.phase === 'recording' && page.t0 !== null && held.phase === 'armed') {
    input.store.started(input.sessionId, page.t0, Date.now());
  }
  return { stop: false, delivered: false };
}

export interface WatchRoundOut {
  readonly stop: boolean;
  readonly delivered: boolean;
}

export async function watchRoundOf(input: WatchFinishDeps): Promise<WatchRoundOut> {
  return watchFinishStepOf(input);
}

export function watchRecordFinish(input: WatchFinishDeps): void {
  let misses = 0;
  const tick = (): void => {
    void watchRoundOf(input)
      .then((out) => {
        misses = 0;
        if (!out.stop) setTimeout(tick, 0);
      })
      .catch(() => {
        misses += 1;
        if (misses < 5) setTimeout(tick, 200);
      });
  };
  setTimeout(tick, 0);
}


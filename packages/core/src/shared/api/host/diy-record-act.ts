import type { PostResource, RecordIntent, RecordState, RecordStore } from '@dsh-workbench/shared/host';
import { parseRecordIntent } from '@dsh-workbench/shared/host';
import { now as clockNow } from '@dsh-workbench/shared/host';
import { deliverDebugNotice, noticeMessage, type AgentsLookup, type NoticeMessage } from './diy-debug-act';

export const RECORD_NOTICE_KIND = 'workbench-diy-record';

const INTENT_WORD: Readonly<Record<RecordIntent, string>> = {
  peek: '查看结果',
  halt: '暂停录制',
  stop: '结束录制',
};

const PHASE_WORD: Readonly<Record<RecordState['phase'], string>> = {
  armed: '已就绪，等待开始',
  recording: '录制中',
  finished: '录制已完成',
};

export function recordNoticeText(intent: RecordIntent, state: RecordState): string {
  const head = `［工作台 DIY］收到「${INTENT_WORD[intent]}」：`;
  if (intent === 'peek') {
    return state.phase === 'finished'
      ? `${head}${state.unit} 这一段已经结束。用 workbench_diy_record_read 读取这一段（用户不在也照取），读取后用 workbench_diy_record_stop 结束整场。`
      : `${head}${state.unit} 这一段当前仍为${PHASE_WORD[state.phase]}。等用户按「结束录制」后再 read；录制条若已消失，read 时会重新注入。`;
  }
  if (intent === 'halt') {
    return (
      `${head}${state.unit} 这一段已暂停（录制条可能已被页面导航移除）。` +
      '**先 read 再 stop**：read 会取出该页面上的缓冲，stop 之后无法再取；顺序颠倒等于未录制。'
    );
  }
  return `${head}${state.unit} 这一场已结束（占用解除）。已 read 的部分仍在你手上；未读取的部分已丢失。需要再录一段就重新 prepare。`;
}

export function recordNoticeSummary(intent: RecordIntent, state: RecordState): string {
  return `工作台 DIY：${INTENT_WORD[intent]}（${state.unit}）`;
}

export function recordNotice(intent: RecordIntent, state: RecordState): { message: NoticeMessage; summary: string } {
  const summary = recordNoticeSummary(intent, state);
  return { summary, message: noticeMessage(recordNoticeText(intent, state), summary, RECORD_NOTICE_KIND) };
}

const NOTICE_MODE: Readonly<Record<RecordIntent, 'wake' | 'hold' | 'drop'>> = {
  peek: 'wake',
  halt: 'wake',
  stop: 'drop',
};

const REFUSAL = '当前没有正在进行的录制，无法查看结果或结束。';

export interface RecordActDeps {
  readonly store: () => RecordStore | undefined;
  readonly agents: () => AgentsLookup | undefined;
  readonly now?: (() => number) | undefined;
  readonly notice?:
    | ((intent: RecordIntent, state: RecordState) => { message: NoticeMessage; summary: string })
    | undefined;
}

async function releaseHeld(
  store: RecordStore,
  held: RecordState,
): Promise<{ readonly tab: boolean; readonly capture: boolean }> {
  try {
    return await (store.release?.(held) ?? Promise.resolve({ tab: false, capture: false }));
  } catch {
    return { tab: false, capture: false };
  }
}

export function recordActResource(deps: RecordActDeps): PostResource {
  const now = (): number => deps.now?.() ?? clockNow();
  return {
    resource: 'act',
    async handle(payload) {
      const intent = parseRecordIntent((payload as { intent?: unknown } | null)?.intent);
      if (intent === null) return { ok: false, text: '无法识别的操作（仅支持 peek / halt / stop）。' };

      const store = deps.store();
      const at = now();
      const held = store?.live(at) ?? null;
      if (store === undefined || held === null) return { ok: false, text: REFUSAL };

      const notice = deps.notice?.(intent, held) ?? recordNotice(intent, held);
      if (intent !== 'stop') {
        const delivered = deliverDebugNotice(deps.agents(), held.sessionId, notice.message, NOTICE_MODE[intent]);
        return { ok: true, intent, delivered, summary: notice.summary, state: store.live(now()) };
      }

      const cleaned = await releaseHeld(store, held);
      const move = store.stop(held.sessionId, at);
      const delivered = deliverDebugNotice(deps.agents(), held.sessionId, notice.message, NOTICE_MODE[intent]);
      return {
        ok: true,
        intent,
        delivered,
        summary: notice.summary,
        cleaned,
        refused: move.ok ? '' : move.code,
        state: store.live(now()),
      };
    },
  };
}

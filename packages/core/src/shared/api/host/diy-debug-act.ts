import { randomUUID } from 'node:crypto';
import type { DebugIntent, DebugMove, DebugState, DebugStore, PostResource } from '@dsh-workbench/shared/host';
import { now as clockNow } from '@dsh-workbench/shared/host';
import { parseDebugIntent } from '@dsh-workbench/shared/host';


export const DEBUG_NOTICE_KIND = 'workbench-diy';

export interface NoticeTextBlock {
  readonly type: 'text';
  readonly text: string;
}

export interface NoticeSource {
  readonly kind: string;
  readonly form: 'notice';
  readonly summary: string;
}

export interface NoticeMessage {
  readonly role: 'user';
  readonly id: string;
  readonly content: readonly NoticeTextBlock[];
  readonly source: NoticeSource;
}

export function noticeMessage(text: string, summary: string, kind: string = DEBUG_NOTICE_KIND): NoticeMessage {
  return {
    role: 'user',
    id: randomUUID(),
    content: [{ type: 'text', text }],
    source: { kind, form: 'notice', summary },
  };
}

export function isNoticeMessage(value: unknown): value is NoticeMessage {
  if (typeof value !== 'object' || value === null) return false;
  const one = value as Partial<NoticeMessage>;
  const source = one.source as Partial<NoticeSource> | undefined;
  return (
    one.role === 'user' &&
    typeof one.id === 'string' &&
    Array.isArray(one.content) &&
    typeof source === 'object' &&
    source !== null &&
    typeof source.kind === 'string'
  );
}

function requireNoticeMessage(value: unknown): NoticeMessage {
  if (!isNoticeMessage(value)) {
    throw new Error(
      'notice 得是 dsh 的 UserMessage 形状（role / id / content / source.kind）—— 裸字符串会写坏会话日志（agent/inbox/spliced requires message objects）',
    );
  }
  return value;
}

export interface NoticeAgent {
  readonly status: string;
  inject(message: NoticeMessage): void;
  followup(message: NoticeMessage): void;
}

export interface AgentsLookup {
  get(id: string): NoticeAgent | undefined;
}

const INTENT_WORD: Readonly<Record<DebugIntent, string>> = {
  pause: '暂停',
  resume: '继续',
  stop: '结束',
};

export function debugNoticeText(intent: DebugIntent, state: DebugState): string {
  const head = `［调试 · ${state.title === '' ? '工作区' : state.title}］用户按了「${INTENT_WORD[intent]}」：`;
  if (intent === 'pause') {
    return (
      `${head}${state.unit} 本次调试已暂停。现在不要再看该页面：看屏、操作页面、网络与日志工具均不可用。` +
      '需要继续时等待用户选择「继续」；在此之前照常修改源码 / 构建 / 运行门禁。'
    );
  }
  if (intent === 'resume') {
    return (
      `${head}${state.unit} 本次调试已恢复，页面操作重新归属本次调试。` +
      '页面或看板不符时仍会被拒绝；被拒时说明具体是哪一种不符。'
    );
  }
  return `${head}${state.unit} 本次调试已结束（占用已解除）。需要再次调试时重新 start。`;
}

export function debugNoticeSummary(intent: DebugIntent, state: DebugState): string {
  return `调试：用户按了${INTENT_WORD[intent]}（${state.unit}）`;
}

export function debugNotice(intent: DebugIntent, state: DebugState): { message: NoticeMessage; summary: string } {
  const summary = debugNoticeSummary(intent, state);
  return { summary, message: noticeMessage(debugNoticeText(intent, state), summary) };
}

export type NoticeMode = 'wake' | 'hold' | 'drop';

const NOTICE_MODE: Readonly<Record<DebugIntent, NoticeMode>> = {
  resume: 'wake',
  pause: 'hold',
  stop: 'drop',
};

export type NoticeDelivery = 'followup' | 'inject' | 'held' | 'none' | 'skipped-idle';

const held = new Map<string, NoticeMessage[]>();

export function holdNotice(sessionId: string, message: NoticeMessage): void {
  const checked = requireNoticeMessage(message);
  const list = held.get(sessionId);
  if (list === undefined) held.set(sessionId, [checked]);
  else list.push(checked);
}

export function takeHeldNotices(sessionId: string): NoticeMessage[] {
  const list = held.get(sessionId) ?? [];
  held.delete(sessionId);
  return list;
}

export function deliverDebugNotice(
  agents: AgentsLookup | undefined,
  sessionId: string,
  message: NoticeMessage,
  mode: NoticeMode = 'wake',
): NoticeDelivery {
  const notice = requireNoticeMessage(message);
  const agent = agents?.get(sessionId);
  if (agent === undefined) {
    if (mode === 'drop') return 'none';
    holdNotice(sessionId, notice);
    return 'held';
  }
  if (agent.status !== 'idle') {
    agent.inject(notice);
    return 'inject';
  }
  if (mode === 'wake') {
    agent.followup(notice);
    return 'followup';
  }
  if (mode === 'hold') {
    holdNotice(sessionId, notice);
    return 'held';
  }
  return 'skipped-idle';
}

const REFUSAL: Readonly<Record<string, string>> = {
  'already-paused': '这一场已经是暂停态了',
  'already-debugging': '这一场本来就在调试中',
  none: '现在没有调试态',
  'not-owner': '这场调试不是这个会话的',
};

export interface DebugActDeps {
  readonly store: () => DebugStore | undefined;
  readonly agents: () => AgentsLookup | undefined;
  readonly now?: (() => number) | undefined;
  readonly notice?: ((intent: DebugIntent, state: DebugState) => { message: NoticeMessage; summary: string }) | undefined;
}

export function debugActResource(deps: DebugActDeps): PostResource {
  const now = (): number => deps.now?.() ?? clockNow();
  const settled = (
    intent: DebugIntent,
    delivered: NoticeDelivery,
    summary: string,
    state: DebugState | null,
  ): { ok: true; intent: DebugIntent; delivered: NoticeDelivery; summary: string; state: DebugState | null } => ({
    ok: true,
    intent,
    delivered,
    summary,
    state,
  });
  return {
    resource: 'act',
    handle(payload) {
      const intent = parseDebugIntent((payload as { intent?: unknown } | null)?.intent);
      if (intent === null) return { ok: false, text: '不认识的意图（只认 pause / resume / stop）' };

      const store = deps.store();
      if (store === undefined) return { ok: false, text: '现在没有调试态 —— 没什么可暂停 / 继续 / 结束的' };

      const at = now();
      const held = store.live(at);
      if (held === null) return { ok: false, text: '现在没有调试态 —— 没什么可暂停 / 继续 / 结束的' };

      const move: DebugMove =
        intent === 'pause'
          ? store.pause(held.sessionId, at)
          : intent === 'resume'
            ? store.resume(held.sessionId, at)
            : store.stop(held.sessionId, at);
      if (!move.ok) return { ok: false, text: REFUSAL[move.code] ?? `按不动：${move.code}` };

      const notice = deps.notice?.(intent, move.state) ?? debugNotice(intent, move.state);
      const delivered = deliverDebugNotice(deps.agents(), held.sessionId, notice.message, NOTICE_MODE[intent]);
      if (intent !== 'stop') return settled(intent, delivered, notice.summary, store.live(now()));
      return (store.settle?.() ?? Promise.resolve()).then(() =>
        settled(intent, delivered, notice.summary, store.live(now())),
      );
    },
  };
}

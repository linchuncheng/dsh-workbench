import { describe, expect, it } from 'vitest';
import { apply } from '../client';
import { entryIssues, resetEntryIssues } from '@/shared/hooks/entry-report';

interface Recorder {
  readonly injected: string[];
  readonly registered: string[];
}

function fakeCtx(
  options: { throwOn?: string; withoutTriggerSource?: boolean } = {},
): { ctx: Parameters<typeof apply>[0]; seen: Recorder } {
  const seen: Recorder = { injected: [], registered: [] };
  const noop = (): void => undefined;
  const unsubscribe = (): (() => void) => () => undefined;
  const base = {
    provide: () => () => undefined,
    effect: (fn: () => unknown) => {
      fn();
      return () => undefined;
    },
    get: () => undefined,
    logger: { warn: noop },
    locale: {
      bind: () => (key: string) => key,
      register: () => () => undefined,
    },
    slots: {
      inject: (name: string, callback: () => unknown) => {
        if (name === options.throwOn) throw new Error(`槽 ${name} 在这一代 dsh 上不存在`);
        seen.injected.push(name);
        return callback();
      },
      register: (config: { name: string }) => {
        seen.registered.push(config.name);
        return () => undefined;
      },
      entriesOfSlot: () => [],
      subscribe: unsubscribe,
    },
    layout: { selectPanel: noop, toggleSidebar: noop, openRightbar: noop, closeRightbar: noop },
    uiWorkspace: { startSession: noop, openWorkspace: noop, openSession: noop, pickDirectory: noop },
    workspaces: {
      list: { getSnapshot: () => ({ items: [] }), subscribe: unsubscribe },
      create: async () => undefined,
      rename: async () => undefined,
    },
    sessions: { list: { getSnapshot: () => ({ items: [] }), subscribe: unsubscribe } },
    remote: { session: {}, agentPresets: {} },
    inputTriggers: options.withoutTriggerSource === true ? {} : { registerSource: () => () => undefined },
    conversation: {},
    contextMenus: {},
    shortcuts: {},
  };
  return { ctx: base as unknown as Parameters<typeof apply>[0], seen };
}

describe('客户端入口：缺东西或一处抛错都不把 dsh 拖下水', () => {
  it('★ 正常环境：入口跑完、槽都注册上，没有任何跳过记录', () => {
    resetEntryIssues();
    const { ctx, seen } = fakeCtx();
    expect(() => apply(ctx)).not.toThrow();
    expect(entryIssues()).toEqual([]);
    expect(seen.injected).toContain('conversation.approval.detail');
    expect(seen.injected).toContain('conversation.input.dock');
  });

  it('★ 一个座位在这一代 dsh 上没了：其余座位照常注册，入口不抛、只记一条跳过', () => {
    resetEntryIssues();
    const { ctx, seen } = fakeCtx({ throwOn: 'conversation.input.dock' });
    expect(() => apply(ctx)).not.toThrow();
    expect(seen.injected).toContain('conversation.approval.detail');
    expect(seen.injected).not.toContain('conversation.input.dock');
    const messages = entryIssues().map((item) => item.message);
    expect(messages.some((text) => text.includes('客户端入口跳过：conversation.input.dock'))).toBe(true);
  });

  it('★ 某一代少了可选能力（输入触发源没登记口）：入口照样跑完，只记一条跳过', () => {
    resetEntryIssues();
    const { ctx, seen } = fakeCtx({ withoutTriggerSource: true });
    expect(() => apply(ctx)).not.toThrow();
    expect(entryIssues().map((item) => item.label)).toContain('context-chips');
    expect(seen.injected).toContain('conversation.approval.detail');
    expect(entryIssues().every((item) => item.message.startsWith('[dsh-workbench]'))).toBe(true);
  });
});

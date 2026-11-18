import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshToolRunContext } from '@dsh-workbench/shared/host';
import { doorOf, heldOf } from '../diy-record-door';

const execOf = (sessionId: string): DshToolRunContext => ({ sessionId }) as unknown as DshToolRunContext;

const heldOfStore = (sessionId: string) =>
  ({
    live: () => ({
      sessionId,
      unit: 'tasks',
      action: '提交',
      url: 'http://127.0.0.1:8099/form',
      phase: 'recording',
      startedAt: 1,
      captureFile: '/tmp/rec.jsonl',
      expect: {},
      shotsSeen: 0,
    }),
  }) as never;

const ctxOf = (seam: unknown): DshHostContext =>
  ({
    get: (key: string) => (key === 'browser' ? seam : undefined),
  }) as unknown as DshHostContext;

describe('这场录制的那道门：没有服务 / 没有这场 / 不是他的', () => {
  it('★★ 机器上没有 shell 服务：当场说清，不假装能读', () => {
    expect(() => doorOf(ctxOf(undefined), heldOfStore('s1'), execOf('s1'), '这台机器上没有 shell 服务')).toThrow(
      '这台机器上没有 shell 服务',
    );
  });

  it('★★ 手里没有这一场：说「先 prepare」', () => {
    const store = { live: () => null } as never;
    expect(() => heldOf(store, 's1')).toThrow();
  });

  it('★★ 这一场不是这个会话的：按「不是你的」挡回去，不给他读别人的', () => {
    const store = heldOfStore('other');
    expect(() => heldOf(store, 's1')).toThrow();
  });
});

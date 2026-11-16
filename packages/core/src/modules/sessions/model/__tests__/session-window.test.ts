import { describe, expect, it } from 'vitest';
import type { SessionSummary } from '@dsh-workbench/shared';
import {
  requiredSessionWatermark,
  sessionNeedsAttention,
  visibleSessionRows,
  type SessionNode,
} from '../session-node';

function row(id: string, patch: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    displayTitle: id,
    blank: false,
    running: false,
    updatedAt: 1,
    retainedBy: {},
    ...patch,
  };
}

function node(patch: Partial<SessionNode> = {}): SessionNode {
  return {
    id: 'n1',
    title: 'n1',
    blank: false,
    running: false,
    runningSubagentCount: 0,
    longTask: false,
    longTaskWaiting: false,
    completed: false,
    pinned: false,
    updatedAt: 1,
    pendingInteraction: undefined,
    ...patch,
  };
}

describe('visibleSessionRows', () => {
  const rows = [row('blank', { blank: true }), row('a'), row('b'), row('c')];

  it('★ 空白会话不占名额，非空白按 watermark 截断', () => {
    expect(visibleSessionRows(rows, 2).rows.map((item) => item.id)).toEqual(['blank', 'a', 'b']);
    expect(visibleSessionRows(rows, 2).hiddenCount).toBe(1);
  });

  it('★ watermark 为 0 时只剩空白会话；没有空白会话时就是空列表', () => {
    expect(visibleSessionRows(rows, 0).rows.map((item) => item.id)).toEqual(['blank']);
    expect(visibleSessionRows([row('a'), row('b')], 0)).toEqual({ rows: [], hiddenCount: 2 });
  });

  it('★ hiddenCount 数的是没显示的行（空白行永远显示，不计入）', () => {
    expect(visibleSessionRows(rows, 99)).toEqual({ rows, hiddenCount: 0 });
  });
});

describe('requiredSessionWatermark', () => {
  const rows = [row('blank', { blank: true }), row('a'), row('b'), row('c'), row('d')];
  const none = (): boolean => false;

  it('★ 当前会话即使超过上限也要露出，水位取它的序号', () => {
    expect(
      requiredSessionWatermark({ rows, currentId: 'd', attention: none, ceiling: 2 }),
    ).toBe(4);
  });

  it('★ 需要关注的行只在上限内抬高水位；超过上限就不再自动展开', () => {
    expect(
      requiredSessionWatermark({
        rows,
        currentId: undefined,
        attention: (item) => item.id === 'b',
        ceiling: 10,
      }),
    ).toBe(2);
    expect(
      requiredSessionWatermark({
        rows,
        currentId: undefined,
        attention: (item) => item.id === 'd',
        ceiling: 3,
      }),
    ).toBe(0);
  });

  it('★ 空白行不计数；没有要求时给 0', () => {
    expect(
      requiredSessionWatermark({ rows, currentId: undefined, attention: none, ceiling: 10 }),
    ).toBe(0);
  });
});

describe('sessionNeedsAttention', () => {
  it('★ 运行、子代理、长任务、等待、未读完成都算需要关注', () => {
    expect(sessionNeedsAttention(node({ running: true }))).toBe(true);
    expect(sessionNeedsAttention(node({ runningSubagentCount: 1 }))).toBe(true);
    expect(sessionNeedsAttention(node({ longTask: true }))).toBe(true);
    expect(sessionNeedsAttention(node({ longTaskWaiting: true }))).toBe(true);
    expect(sessionNeedsAttention(node({ pendingInteraction: 'approval' }))).toBe(true);
    expect(sessionNeedsAttention(node({ completed: true }))).toBe(true);
  });

  it('★ 空闲行不算需要关注', () => {
    expect(sessionNeedsAttention(node())).toBe(false);
  });
});

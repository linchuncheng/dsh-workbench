import { describe, expect, it } from 'vitest';
import type { SessionSummary, SessionsSnapshot, WorkspaceView } from '@dsh-workbench/shared';
import { workspaceRecencyOf } from '../workspace-recency';

function workspace(id: string, sessionIds: readonly string[], updatedAt: number | string = 1): WorkspaceView {
  return { workspaceId: id, path: `/w/${id}`, title: id, sessionIds, createdAt: 1, updatedAt };
}

function summary(id: string, patch: Partial<SessionSummary> = {}): SessionSummary {
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

function snapshot(rows: readonly SessionSummary[]): SessionsSnapshot {
  const byId: Record<string, SessionSummary> = {};
  for (const row of rows) byId[row.id] = row;
  return { byId, projectionsBySession: {} } as unknown as SessionsSnapshot;
}

const NONE: ReadonlySet<string> = new Set();

describe('workspaceRecencyOf：一个工作区最近一次活动', () => {
  it('★★ 取底下会话里最新的 updatedAt', () => {
    const sessions = snapshot([summary('a', { updatedAt: 10 }), summary('b', { updatedAt: 30 })]);
    const recency = workspaceRecencyOf({ items: [workspace('w', ['a', 'b'])], sessions, archivedIds: NONE });

    expect(recency.get('w')).toBe(30);
  });

  it('★ 归档、子代理、空白会话都不算活动', () => {
    const sessions = snapshot([
      summary('a', { updatedAt: 10 }),
      summary('archived', { updatedAt: 90 }),
      summary('sub', { updatedAt: 80, origin: 'subagent' }),
      summary('blank', { updatedAt: 70, blank: true }),
    ]);
    const recency = workspaceRecencyOf({
      items: [workspace('w', ['a', 'archived', 'sub', 'blank'])],
      sessions,
      archivedIds: new Set(['archived']),
    });

    expect(recency.get('w')).toBe(10);
  });

  it('★ 没有可用会话时退回工作区自己的 updatedAt（数字与 ISO 字符串都认）', () => {
    const sessions = snapshot([]);
    const recency = workspaceRecencyOf({
      items: [
        workspace('number', [], 5),
        workspace('iso', [], '1970-01-01T00:00:00.010Z'),
        workspace('junk', [], 'not-a-date'),
      ],
      sessions,
      archivedIds: NONE,
    });

    expect(recency.get('number')).toBe(5);
    expect(recency.get('iso')).toBe(10);
    expect(recency.get('junk')).toBe(0);
  });

  it('★ 会话表里缺这一条就跳过，不抛错', () => {
    const sessions = snapshot([summary('a', { updatedAt: 7 })]);
    const recency = workspaceRecencyOf({ items: [workspace('w', ['missing', 'a'])], sessions, archivedIds: NONE });

    expect(recency.get('w')).toBe(7);
  });
});

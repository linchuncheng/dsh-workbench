import { describe, expect, it } from 'vitest';
import type { SessionSummary, SessionsSnapshot, WorkspaceView } from '@dsh-workbench/shared';
import { sessionSearchHits, type SessionSearchPage } from '../session-search';

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

function snapshot(rows: readonly SessionSummary[]): SessionsSnapshot {
  const byId: Record<string, SessionSummary> = {};
  for (const item of rows) byId[item.id] = item;
  return { byId, projectionsBySession: {} } as unknown as SessionsSnapshot;
}

function workspace(id: string, title: string, sessionIds: string[]): WorkspaceView {
  return {
    workspaceId: id,
    path: `/work/${id}`,
    title,
    sessionIds,
    createdAt: '',
    updatedAt: '',
  } as unknown as WorkspaceView;
}

describe('sessionSearchHits', () => {
  const rows = [
    row('blank', { blank: true }),
    row('alpha', { displayTitle: 'Alpha 方案', updatedAt: 3 }),
    row('beta', { displayTitle: 'Beta 复盘', updatedAt: 2 }),
    row('gamma', { displayTitle: 'Gamma', updatedAt: 1 }),
    row('child', { displayTitle: '子代理', origin: 'subagent' }),
  ];
  const list = snapshot(rows);
  const workspaces = [
    workspace('w1', '工作台', ['alpha', 'beta', 'blank', 'child']),
    workspace('w2', '另一个项目', ['gamma', 'archived']),
  ];
  const archivedIds = new Set(['archived']);

  it('★ 跨工作区找标题与 id，按最近更新排；空白与子代理不算', () => {
    const hits = sessionSearchHits({ workspaces, list, archivedIds, query: 'a', page: null }).hits;

    expect(hits.map((hit) => hit.row.id)).toEqual(['alpha', 'beta', 'gamma']);
    expect(hits.map((hit) => hit.workspace)).toEqual(['工作台', '工作台', '另一个项目']);
  });

  it('★ 宿主内容命中只补进可见会话：当前项目与别的项目都收，按内容页顺序接在后面', () => {
    const page: SessionSearchPage = {
      items: [
        { sessionId: 'gamma', snippet: '命中了 gamma' },
        { sessionId: 'alpha', snippet: '命中了 alpha' },
        { sessionId: 'archived', snippet: '归档的不收' },
        { sessionId: 'missing', snippet: '没有这一行' },
      ],
      hasMore: true,
    };

    const hits = sessionSearchHits({ workspaces, list, archivedIds, query: '关键词', page }).hits;

    expect(hits.map((hit) => hit.row.id)).toEqual(['gamma', 'alpha']);
    expect(hits.map((hit) => hit.workspace)).toEqual(['另一个项目', '工作台']);
    expect(hits.map((hit) => hit.snippet)).toEqual(['命中了 gamma', '命中了 alpha']);
    expect(sessionSearchHits({ workspaces, list, archivedIds, query: '关键词', page }).hasMore).toBe(true);
  });

  it('★ 标题命中的行不会被内容页重复追加，但会带上那条摘要', () => {
    const page: SessionSearchPage = {
      items: [
        { sessionId: 'alpha', snippet: 'alpha 的摘要' },
        { sessionId: 'beta', snippet: 'beta 的摘要' },
      ],
      hasMore: false,
    };

    const hits = sessionSearchHits({ workspaces, list, archivedIds, query: 'alpha', page }).hits;

    expect(hits.map((hit) => hit.row.id)).toEqual(['alpha', 'beta']);
    expect(hits.map((hit) => hit.snippet)).toEqual(['alpha 的摘要', 'beta 的摘要']);
  });

  it('★ 合并结果封顶 20 条，多出来的只体现在 hasMore 上', () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      row(`s${index}`, { displayTitle: `match ${index}`, updatedAt: index }),
    );
    const hits = sessionSearchHits({
      workspaces: [workspace('w', '工作台', many.map((item) => item.id))],
      list: snapshot(many),
      archivedIds: new Set(),
      query: 'match',
      page: null,
    });

    expect(hits.hits).toHaveLength(20);
    expect(hits.hasMore).toBe(true);
  });

  it('★ 空查询给空结果；没有内容页时只靠本地标题', () => {
    expect(sessionSearchHits({ workspaces, list, archivedIds, query: '   ', page: null })).toEqual({
      hits: [],
      hasMore: false,
    });
    expect(sessionSearchHits({ workspaces, list, archivedIds, query: 'Gamma', page: null }).hasMore).toBe(false);
  });
});

import type { SessionSummary, SessionsSnapshot, WorkspaceView } from '@dsh-workbench/shared';
import { orderByRecency } from './session-node';

export interface SessionSearchItem {
  readonly sessionId: string;
  readonly snippet: string;
}

export interface SessionSearchPage {
  readonly items: readonly SessionSearchItem[];
  readonly hasMore: boolean;
}

export type SessionSearch = (query: string, signal: AbortSignal) => Promise<SessionSearchPage>;

export interface SessionSearchHit {
  readonly row: SessionSummary;
  readonly workspace: string;
  readonly snippet?: string;
}

export interface SessionSearchHits {
  readonly hits: readonly SessionSearchHit[];
  readonly hasMore: boolean;
}

export interface SessionSearchInput {
  readonly workspaces: readonly WorkspaceView[];
  readonly list: SessionsSnapshot;
  readonly archivedIds: ReadonlySet<string>;
  readonly query: string;
  readonly page: SessionSearchPage | null;
}

export const SESSION_SEARCH_RESULT_LIMIT = 20;

export function sessionSearchHits(input: SessionSearchInput): SessionSearchHits {
  const needle = input.query.trim().toLowerCase();
  if (needle === '') return { hits: [], hasMore: false };

  const candidates = new Map<string, { readonly row: SessionSummary; readonly workspace: string }>();
  for (const workspace of input.workspaces) {
    const label = workspace.title === '' ? workspace.path : workspace.title;
    for (const id of workspace.sessionIds) {
      if (input.archivedIds.has(id)) continue;
      const row = input.list.byId[id];
      if (row === undefined || row.blank || row.origin === 'subagent') continue;
      if (!candidates.has(row.id)) candidates.set(row.id, { row, workspace: label });
    }
  }

  const local = orderByRecency(
    [...candidates.values()]
      .filter(
        ({ row }) =>
          row.displayTitle.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle),
      )
      .map(({ row }) => row),
  );
  const included = new Set(local.map((row) => row.id));
  const snippets = new Map<string, string>();
  const content: SessionSummary[] = [];

  for (const item of input.page?.items ?? []) {
    const candidate = candidates.get(item.sessionId);
    if (candidate === undefined) continue;
    if (!snippets.has(candidate.row.id)) snippets.set(candidate.row.id, item.snippet);
    if (included.has(candidate.row.id)) continue;
    included.add(candidate.row.id);
    content.push(candidate.row);
  }

  const merged = [...local, ...content].map((row) => {
    const workspace = candidates.get(row.id)?.workspace ?? '';
    const snippet = snippets.get(row.id);
    return snippet === undefined ? { row, workspace } : { row, workspace, snippet };
  });

  return {
    hits: merged.slice(0, SESSION_SEARCH_RESULT_LIMIT),
    hasMore: input.page?.hasMore === true || merged.length > SESSION_SEARCH_RESULT_LIMIT,
  };
}

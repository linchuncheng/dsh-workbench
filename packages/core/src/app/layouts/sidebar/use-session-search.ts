import { useEffect, useMemo, useState } from 'react';
import type { SessionSummary, SessionsSnapshot, WorkspaceView } from '@dsh-workbench/shared';
import {
  sessionSearchHits,
  type SessionSearch,
  type SessionSearchHits,
  type SessionSearchPage,
} from '@/modules/sessions';

const SEARCH_DEBOUNCE_MS = 250;

interface SearchState {
  readonly query: string;
  readonly page: SessionSearchPage | null;
}

const EMPTY_SEARCH: SearchState = { query: '', page: null };

export interface SessionSearchInput {
  readonly workspaceId: string | undefined;
  readonly query: string;
  readonly workspaces: readonly WorkspaceView[];
  readonly list: SessionsSnapshot;
  readonly archivedSet: ReadonlySet<string>;
  readonly searchSessions: SessionSearch;
}

export interface SessionSearchView {
  readonly searching: boolean;
  readonly pending: boolean;
  readonly hits: SessionSearchHits;
  readonly rows: readonly SessionSummary[];
}

export function useSessionSearch(input: SessionSearchInput): SessionSearchView {
  const { workspaceId, query, workspaces, list, archivedSet, searchSessions } = input;
  const normalizedQuery = query.trim();
  const [remote, setRemote] = useState<SearchState>(EMPTY_SEARCH);

  useEffect(() => {
    if (normalizedQuery === '' || workspaceId === undefined) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchSessions(normalizedQuery, controller.signal).then(
        (page) => {
          if (controller.signal.aborted) return;
          setRemote({ query: normalizedQuery, page });
        },
        () => {
          if (controller.signal.aborted) return;
          setRemote({ query: normalizedQuery, page: null });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery, searchSessions, workspaceId]);

  const searching = normalizedQuery !== '';
  const searchPage = remote.query === normalizedQuery ? remote.page : null;
  const pending = searching && remote.query !== normalizedQuery;
  const hits = useMemo(
    () =>
      sessionSearchHits({
        workspaces,
        list,
        archivedIds: archivedSet,
        query: normalizedQuery,
        page: searchPage,
      }),
    [workspaces, list, archivedSet, normalizedQuery, searchPage],
  );
  const rows = useMemo(() => hits.hits.map((hit) => hit.row), [hits]);

  return { searching, pending, hits, rows };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { marketInstallTarget } from '@dsh-workbench/shared';
import type {
  DiscoverEntry,
  DiscoverPayload,
  DiscoverSourceRow,
  DiscoverVersionRow,
  GitTransportKind,
  MarketSourceConfig,
} from '@/kernel/contract/market-index';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { readMarketDiscover, readMarketSources } from '@/shared/hooks/market-queries';
import { CAPABILITY_FACT } from '@/shared/hooks/use-capabilities';
import { subscribeFactRevision } from '@/shared/hooks/use-facts';
import {
  DISCOVER_PAGE_SIZE,
  filterEntries,
  localeNow,
  sortEntries,
  sourceFromUrl,
  visibleEntries,
  type DiscoverSort,
} from './discover-view';

interface InstallTarget {
  readonly entry: DiscoverEntry;
  readonly version: DiscoverVersionRow;
}

interface KnownSources {
  readonly sources: readonly DiscoverSourceRow[];
  readonly selected: string | null;
  readonly transports: Readonly<Record<string, GitTransportKind>>;
}

function sourceRowsOf(sources: readonly MarketSourceConfig[]): readonly DiscoverSourceRow[] {
  return sources.map((source) => ({
    ...source,
    writable: source.kind === 'http' ? false : null,
  }));
}

export interface DiscoverController {
  readonly t: Translate;
  readonly locale: string;
  readonly payload: DiscoverPayload | null;
  readonly loading: boolean;
  readonly slow: boolean;
  readonly failure: string | null;
  readonly sources: DiscoverPayload['sources'];
  readonly selected: string | null;
  readonly transports: Readonly<Record<string, GitTransportKind>>;
  readonly entries: readonly DiscoverEntry[];
  readonly shown: readonly DiscoverEntry[];
  readonly total: number;
  readonly categories: readonly string[];
  readonly labels: readonly string[];
  readonly query: string;
  readonly category: string | null;
  readonly selectedLabels: readonly string[];
  readonly sort: DiscoverSort;
  readonly detailEntry: DiscoverEntry | null;
  readonly choice: InstallTarget | null;
  readonly notice: string | null;
  readonly writeFailed: string | null;
  readonly busy: boolean;
  readonly addingSource: boolean;
  readonly manageOpen: boolean;
  readonly problem: { readonly id: string; readonly kind: string; readonly detail: string } | null;
  readonly uninitialized: { readonly path: string; readonly empty: boolean } | null;
  readonly defaultBranch: string;
  readonly pendingSourceId: string | null;
  readonly initOpen: boolean;
  readonly reload: () => void;
  readonly setQuery: (value: string) => void;
  readonly setCategory: (value: string | null) => void;
  readonly toggleLabel: (label: string) => void;
  readonly setSort: (sort: DiscoverSort) => void;
  readonly showMore: () => void;
  readonly openDetail: (name: string) => void;
  readonly closeDetail: () => void;
  readonly setDetailEntry: (name: string | null) => void;
  readonly setChoice: (value: InstallTarget | null) => void;
  readonly setManageOpen: (open: boolean) => void;
  readonly setInitOpen: (open: boolean) => void;
  readonly initialize: (branch: string) => void;
  readonly enableSource: (id: string) => void;
  readonly readOnlySource: (id: string) => void;
  readonly addSource: (url: string) => void;
  readonly removeSourceById: (id: string) => void;
  readonly selectSource: (id: string) => void;
  readonly install: (url?: string) => void;
}

export function useDiscover(
  t: Translate,
  active: boolean,
  onAddModule: (preset: { readonly spec: string; readonly registry?: string | undefined }) => void,
): DiscoverController {
  const [payload, setPayload] = useState<DiscoverPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<readonly string[]>([]);
  const [sort, setSort] = useState<DiscoverSort>('default');
  const [limit, setLimit] = useState(DISCOVER_PAGE_SIZE);
  const [detail, setDetail] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [initOpen, setInitOpen] = useState(false);
  const [choice, setChoice] = useState<InstallTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addingSource, setAddingSource] = useState(false);
  const [pendingSourceId, setPendingSourceId] = useState<string | null>(null);
  const [knownSources, setKnownSources] = useState<KnownSources | null>(null);
  const loaded = useRef(false);
  const loadTicket = useRef(0);
  const sourceTicket = useRef(0);
  const locale = useMemo(() => localeNow(), []);

  const sources = useHostWrite({
    channel: 'actions',
    resource: 'market-sources',
    networkText: t('panels.discover.failed'),
  });

  const loadSources = useCallback(async (): Promise<void> => {
    const ticket = sourceTicket.current + 1;
    sourceTicket.current = ticket;
    let response: Awaited<ReturnType<typeof readMarketSources>>;
    try {
      response = await readMarketSources();
    } catch {
      if (sourceTicket.current !== ticket) return;
      setFailure(t('panels.discover.unreadable'));
      return;
    }
    if (sourceTicket.current !== ticket) return;
    if (!response.ok) {
      setFailure(t('panels.discover.unreadable'));
      return;
    }

    setKnownSources({
      sources: sourceRowsOf(response.sources),
      selected: response.selected,
      transports: response.transports ?? {},
    });
  }, [t]);

  const load = useCallback(
    async (force = false): Promise<void> => {
      const ticket = loadTicket.current + 1;
      loadTicket.current = ticket;
      setLoading(true);
      setSlow(false);
      setFailure(null);
      const response = await readMarketDiscover({ force }).catch(() => null);
      if (loadTicket.current !== ticket) return;
      setLoading(false);
      setSlow(false);
      if (response === null || !response.ok) {
        setFailure(t('panels.discover.unreadable'));
        return;
      }
      setPayload(response);
      setKnownSources({ sources: response.sources, selected: response.selected, transports: {} });
      setLimit(DISCOVER_PAGE_SIZE);
    },
    [t],
  );

  const beginSwitch = (): void => {
    loadTicket.current += 1;
    sourceTicket.current += 1;
    setFailure(null);
    setPayload(null);
    setLoading(true);
    setSlow(false);
  };

  useEffect(() => {
    if (!active || loaded.current) return;
    loaded.current = true;
    void loadSources();
    void load();
  }, [active, load, loadSources]);

  useEffect(() => {
    if (!loading) return undefined;
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(
    () =>
      subscribeFactRevision(CAPABILITY_FACT, () => {
        if (!loaded.current) return;
        void load(true);
      }),
    [load],
  );

  const entries = useMemo(() => payload?.entries ?? [], [payload]);
  const categories = useMemo(
    () => [...new Set(entries.flatMap((entry) => (entry.category === undefined ? [] : [entry.category])))],
    [entries],
  );
  const labels = useMemo(() => [...new Set(entries.flatMap((entry) => entry.labels))].sort(), [entries]);
  const filtered = useMemo(
    () => filterEntries(entries, { query, category, labels: selectedLabels }, locale),
    [entries, query, category, selectedLabels, locale],
  );
  const sorted = useMemo(() => sortEntries(filtered, sort), [filtered, sort]);
  const shown = useMemo(() => visibleEntries(sorted, limit), [sorted, limit]);
  const detailEntry = useMemo(() => entries.find((entry) => entry.name === detail) ?? null, [entries, detail]);
  const problem = useMemo(() => {
    if (payload?.problem === undefined || payload.selected === null) return null;
    const detail =
      payload.problem.detail ?? (payload.problem.kind === 'sandbox' ? t('panels.discover.sandbox') : '');
    return { id: payload.selected, kind: payload.problem.kind, detail };
  }, [payload, t]);

  const selectedSource = useMemo(
    () =>
      payload === null || payload.selected === null
        ? undefined
        : payload.sources.find((source) => source.id === payload.selected),
    [payload],
  );

  const uninitialized = useMemo(() => {
    const kind = payload?.problem?.kind;
    if (selectedSource === undefined || selectedSource.kind !== 'git') return null;
    if (kind !== 'git-empty' && kind !== 'git-missing-index') return null;
    return { path: selectedSource.path ?? 'market', empty: kind === 'git-empty' };
  }, [payload, selectedSource]);

  const defaultBranch = payload?.problem?.branch ?? selectedSource?.ref ?? 'main';

  const enableSource = (id: string): void => {
    setNotice(null);
    setPendingSourceId(id);
    void sources
      .send({ action: 'init', id, stampOnly: true })
      .then(async (outcome) => {
        if (!outcome.ok) return;
        const label = payload?.sources.find((one) => one.id === id)?.label ?? id;
        setNotice(t('panels.discover.sourceEnabled', { label }));
        await loadSources();
        await load(true);
      })
      .finally(() => setPendingSourceId(null));
  };

  const readOnlySource = (id: string): void => {
    setNotice(null);
    setPendingSourceId(id);
    void sources
      .send({ action: 'read-only', id })
      .then(async (outcome) => {
        if (!outcome.ok) return;
        const label = payload?.sources.find((one) => one.id === id)?.label ?? id;
        setNotice(t('panels.discover.sourceReadOnly', { label }));
        await loadSources();
        await load(true);
      })
      .finally(() => setPendingSourceId(null));
  };

  const initialize = (branch: string): void => {
    if (payload === null || payload.selected === null) return;
    const id = payload.selected;
    setNotice(null);
    void sources.send({ action: 'init', id, ref: branch }).then(async (outcome) => {
      if (!outcome.ok) return;
      const value =
        typeof outcome.value === 'object' && outcome.value !== null
          ? (outcome.value as Readonly<Record<string, unknown>>)
          : undefined;
      const done = typeof value?.['branch'] === 'string' ? value['branch'] : branch;
      setInitOpen(false);
      setNotice(t('panels.discover.initDone', { branch: done }));
      beginSwitch();
      await loadSources();
      await load(true);
    });
  };

  const addSource = (url: string): void => {
    const parsed = sourceFromUrl(url);
    if (!parsed.ok) return;
    setNotice(null);
    setInitOpen(false);
    const id = `source-${globalThis.crypto.randomUUID()}`;
    setAddingSource(true);
    void sources
      .send({ action: 'save', source: { ...parsed.source, id } })
      .then((outcome) => {
        if (!outcome.ok) return;
        const value =
          typeof outcome.value === 'object' && outcome.value !== null
            ? (outcome.value as Readonly<Record<string, unknown>>)
            : undefined;
        void loadSources();
        if (value?.['selected'] === id) void load(true);
      })
      .finally(() => setAddingSource(false));
  };

  const removeSourceById = (id: string): void => {
    setNotice(null);
    setInitOpen(false);
    const wasSelected = (payload?.selected ?? knownSources?.selected ?? null) === id;
    void sources.send({ action: 'remove', id }).then(async (outcome) => {
      if (!outcome.ok) return;
      if (wasSelected) {
        setQuery('');
        setCategory(null);
        setSelectedLabels([]);
        setSort('default');
        setDetail(null);
      }
      await loadSources();
      if (wasSelected) await load(true);
    });
  };

  const selectSource = (id: string): void => {
    if (payload?.selected === id) return;
    setNotice(null);
    setInitOpen(false);
    setQuery('');
    setCategory(null);
    setSelectedLabels([]);
    setSort('default');
    setDetail(null);
    beginSwitch();
    setKnownSources((current) =>
      current === null ? current : { ...current, selected: id },
    );
    void sources.send({ action: 'select', id }).then(async (outcome) => {
      if (!outcome.ok) {
        setLoading(false);
        setSlow(false);
        void loadSources();
        return;
      }
      await loadSources();
      await load(true);
    });
  };

  const install = (url?: string): void => {
    if (choice === null) return;
    const source = choice.version.source;
    const target = marketInstallTarget(
      choice.entry.name,
      choice.version.version,
      source.type === 'git' && url !== undefined ? { ...source, url } : source,
    );
    setChoice(null);
    setNotice(null);
    onAddModule({
      spec: target.spec,
      ...(target.registry === undefined ? {} : { registry: target.registry }),
    });
  };

  const reload = (): void => {
    setNotice(null);
    setInitOpen(false);
    void load(true);
  };

  return {
    t,
    locale,
    payload,
    loading,
    slow,
    failure,
    sources: knownSources?.sources ?? payload?.sources ?? [],
    selected: knownSources?.selected ?? payload?.selected ?? null,
    transports: knownSources?.transports ?? {},
    entries,
    shown,
    total: sorted.length,
    categories,
    labels,
    query,
    category,
    selectedLabels,
    sort,
    detailEntry,
    choice,
    notice,
    writeFailed: sources.failed,
    busy: sources.busy,
    addingSource,
    manageOpen,
    problem,
    uninitialized,
    defaultBranch,
    pendingSourceId,
    initOpen,
    reload,
    setQuery,
    setCategory,
    toggleLabel: (label) =>
      setSelectedLabels((current) =>
        current.includes(label) ? current.filter((one) => one !== label) : [...current, label],
      ),
    setSort,
    showMore: () => setLimit((current) => current + DISCOVER_PAGE_SIZE),
    openDetail: (name) => setDetail(name),
    closeDetail: () => setDetail(null),
    setDetailEntry: setDetail,
    setChoice,
    setManageOpen,
    setInitOpen,
    initialize,
    enableSource,
    readOnlySource,
    addSource,
    removeSourceById,
    selectSource,
    install,
  };
}

export type { InstallTarget };
export type { MarketSourceConfig };

import { useMemo, useState } from 'react';
import type { SessionStatusSnapshot, SessionsSnapshot, SessionSummary } from '@dsh-workbench/shared';
import {
  requiredSessionWatermark,
  sessionNeedsAttention,
  sessionNode,
  visibleSessionRows,
  type LongTaskPresence,
  type SessionNode,
  type VisibleSessionRows,
} from '@/modules/sessions';

const VISIBLE_SESSIONS = 10;
const AUTO_VISIBLE_MAX = 50;
const ALL_SESSIONS = Number.POSITIVE_INFINITY;

export interface SessionWatermarkHookInput {
  readonly workspaceId: string | undefined;
  readonly rows: readonly SessionSummary[];
  readonly currentId: string | undefined;
  readonly statusById: SessionStatusSnapshot;
  readonly list: SessionsSnapshot;
  readonly pinned: ReadonlySet<string>;
  readonly archivedSet: ReadonlySet<string>;
  readonly longTasks: LongTaskPresence;
}

export interface SessionWatermarkView {
  readonly nodesById: ReadonlyMap<string, SessionNode>;
  readonly visible: VisibleSessionRows;
  readonly expandedAll: boolean;
  readonly expand: () => void;
  readonly collapse: () => void;
}

export function useSessionWatermark(input: SessionWatermarkHookInput): SessionWatermarkView {
  const { workspaceId, rows, currentId, statusById, list, pinned, archivedSet, longTasks } = input;
  const [revealed, setRevealed] = useState<Readonly<Record<string, number>>>({});

  const nodes = useMemo(
    () =>
      rows.map((row) =>
        sessionNode(row, statusById, list, pinned, archivedSet, longTasks.bySession, longTasks.waitingBySession),
      ),
    [rows, statusById, list, pinned, archivedSet, longTasks],
  );
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const required = useMemo(
    () =>
      requiredSessionWatermark({
        rows,
        currentId,
        attention: (row) => {
          const node = nodesById.get(row.id);
          return node !== undefined && sessionNeedsAttention(node);
        },
        ceiling: AUTO_VISIBLE_MAX,
      }),
    [rows, currentId, nodesById],
  );

  const userWatermark =
    workspaceId === undefined ? VISIBLE_SESSIONS : revealed[workspaceId] ?? VISIBLE_SESSIONS;
  const watermark = Math.max(VISIBLE_SESSIONS, required, userWatermark);
  const visible = useMemo(() => visibleSessionRows(rows, watermark), [rows, watermark]);
  const expandedAll = userWatermark === ALL_SESSIONS;

  const expand = (): void => {
    if (workspaceId === undefined) return;
    setRevealed((current) => ({
      ...current,
      [workspaceId]:
        visible.hiddenCount <= VISIBLE_SESSIONS ? ALL_SESSIONS : watermark + VISIBLE_SESSIONS,
    }));
  };
  const collapse = (): void => {
    if (workspaceId === undefined) return;
    setRevealed((current) => ({ ...current, [workspaceId]: VISIBLE_SESSIONS }));
  };

  return { nodesById, visible, expandedAll, expand, collapse };
}

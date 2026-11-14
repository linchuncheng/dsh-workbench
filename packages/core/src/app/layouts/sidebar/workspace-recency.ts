import dayjs from 'dayjs';
import type { SessionsSnapshot, WorkspaceView } from '@dsh-workbench/shared';

export interface WorkspaceRecencyInput {
  readonly items: readonly WorkspaceView[];
  readonly sessions: SessionsSnapshot;
  readonly archivedIds: ReadonlySet<string>;
}

function stampOf(value: number | string): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = dayjs(value).valueOf();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function workspaceRecencyOf(input: WorkspaceRecencyInput): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const workspace of input.items) {
    let latest = stampOf(workspace.updatedAt);
    for (const id of workspace.sessionIds) {
      if (input.archivedIds.has(id)) continue;
      const row = input.sessions.byId[id];
      if (row === undefined || row.origin === 'subagent' || row.blank === true) continue;
      if (Number.isFinite(row.updatedAt) && row.updatedAt > latest) latest = row.updatedAt;
    }
    out.set(workspace.workspaceId, latest);
  }
  return out;
}

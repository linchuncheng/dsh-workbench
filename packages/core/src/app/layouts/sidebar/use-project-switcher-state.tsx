import { createElement as h, useMemo, useState } from 'react';
import type { ReactNode, Translate, WorkspaceView } from '@dsh-workbench/shared';
import { attentionListRank, type Attention, type WorkspaceAttention } from '@/modules/sessions';
import type { WorkspaceMenuTarget } from './WorkspaceRowMenu';
import { nextWorkspaceMenu } from './WorkspaceRowMenu';
import styles from './ProjectSwitcher.module.css';
import { displayNameOf } from './workspace-name';
import { workspaceSections, revealTargetOf } from './workspace-groups';
import { workspaceOptions } from './workspace-items';

interface WorkspaceOrderSnapshot {
  readonly attention: ReadonlyMap<string, WorkspaceAttention>;
  readonly recency: ReadonlyMap<string, number>;
}

interface ProjectSwitcherStateInput {
  readonly items: readonly WorkspaceView[];
  readonly current: WorkspaceView | null;
  readonly attention: Attention;
  readonly recency: ReadonlyMap<string, number>;
  readonly compact?: boolean;
  readonly t: Translate;
}

export function useProjectSwitcherState({
  items,
  current,
  attention,
  recency,
  compact = false,
  t,
}: ProjectSwitcherStateInput) {
  const [open, setOpen] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [triggerHover, setTriggerHover] = useState(false);
  const [frozenOrder, setFrozenOrder] = useState<WorkspaceOrderSnapshot | null>(null);
  const [menu, setMenu] = useState<WorkspaceMenuTarget | null>(null);
  const [naming, setNaming] = useState<WorkspaceView | null>(null);
  const [deleting, setDeleting] = useState<WorkspaceView | null>(null);

  const currentId = current?.workspaceId ?? '';
  const ordering = useMemo(
    () => frozenOrder ?? { attention: attention.byWorkspace, recency },
    [frozenOrder, attention.byWorkspace, recency],
  );
  const byId = useMemo(() => new Map(items.map((workspace) => [workspace.workspaceId, workspace])), [items]);
  const sections = useMemo(
    () =>
      workspaceSections(
        items,
        {
          workspaces: t('project.group.workspaces'),
          defaultWorkspace: t('project.group.defaultWorkspace'),
          workshop: t('project.group.workshop'),
        },
        {
          rankOf: (workspace) => attentionListRank(ordering.attention.get(workspace.workspaceId)),
          recencyOf: (workspace) => ordering.recency.get(workspace.workspaceId) ?? 0,
        },
      ),
    [items, ordering, t],
  );
  const revealId = useMemo(() => {
    const rankOf = (workspace: WorkspaceView): number => {
      const own = ordering.attention.get(workspace.workspaceId);
      if (own === undefined || own.severity === 'ongoing') return Number.POSITIVE_INFINITY;
      return attentionListRank(own);
    };
    return revealTargetOf(sections, rankOf, current)?.workspaceId ?? null;
  }, [sections, ordering.attention, current]);
  const options = useMemo(
    () =>
      workspaceOptions({
        sections,
        currentId,
        revealId,
        hoverId,
        openMenuId: menu?.workspace.workspaceId ?? null,
        t,
        attention: attention.byWorkspace,
        onHover: setHoverId,
        onMenu: (workspace, open) => setMenu((current) => nextWorkspaceMenu(current, workspace, open)),
      }),
    [sections, currentId, revealId, hoverId, menu, t, attention.byWorkspace],
  );
  const valueNodes = useMemo(() => {
    const out = new Map<string, ReactNode>();
    for (const workspace of items) {
      const { dir, name } = displayNameOf(workspace);
      out.set(
        workspace.workspaceId,
        <span className={styles.triggerName}>
          <span className={styles.dir}>{dir}</span>
          {name === '' ? null : <span className={styles.name}>{name}</span>}
        </span>,
      );
    }
    return out;
  }, [items]);

  const triggerWorkspace = compact || open ? null : current;
  const triggerMenuOpen =
    triggerWorkspace !== null && menu !== null && menu.workspace.workspaceId === triggerWorkspace.workspaceId;
  const triggerActionActive = triggerWorkspace !== null && (triggerHover || triggerMenuOpen);

  return {
    open,
    setOpen,
    setHoverId,
    triggerHover,
    setTriggerHover,
    setFrozenOrder,
    menu,
    setMenu,
    naming,
    setNaming,
    deleting,
    setDeleting,
    currentId,
    byId,
    options,
    valueNodes,
    revealId,
    triggerWorkspace,
    triggerMenuOpen,
    triggerActionActive,
  };
}

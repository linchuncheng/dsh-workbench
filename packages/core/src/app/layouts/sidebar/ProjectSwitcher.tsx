import { Fragment, createElement as h, useMemo, useState } from 'react';
import type { ReactNode, SelectFieldOption, Translate, WorkspaceView } from '@dsh-workbench/shared';
import { attentionListRank, type Attention, type WorkspaceAttention } from '@/modules/sessions';
import styles from './ProjectSwitcher.module.css';
import { SelectField, cx } from '@dsh-workbench/shared';
import { IconFolderCloseRegular, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { Tip } from '@/shared/components/Tip';
import { WorkspaceAttentionDot } from './WorkspaceAttentionDot';
import { WorkspaceAttentionTag } from './WorkspaceAttentionTag';
import { WorkspaceAliasDialog } from './WorkspaceAliasDialog';
import { WorkspaceDeleteDialog } from './WorkspaceDeleteDialog';
import { WorkspaceRowMenu, nextWorkspaceMenu } from './WorkspaceRowMenu';
import { WorkspaceRowAction } from './WorkspaceRowAction';
import type { WorkspaceMenuTarget } from './WorkspaceRowMenu';
import { displayNameOf, matchWorkspaces } from './workspace-name';
import { workspaceSections } from './workspace-groups';
import { workspaceOptions } from './workspace-items';

export interface ProjectSwitcherProps {
  items: readonly WorkspaceView[];
  current: WorkspaceView | null;
  attention: Attention;
  recency: ReadonlyMap<string, number>;
  compact?: boolean;
  onPick: (workspaceId: string) => void;
  onAdd: () => void;
  onAlias: (workspaceId: string, title: string) => Promise<boolean>;
  onDelete: (workspaceId: string) => Promise<boolean>;
  onReveal: (path: string) => void;
  t: Translate;
}

interface WorkspaceOrderSnapshot {
  readonly attention: ReadonlyMap<string, WorkspaceAttention>;
  readonly recency: ReadonlyMap<string, number>;
}

export function ProjectSwitcher({
  items,
  current,
  attention,
  recency,
  compact = false,
  onPick,
  onAdd,
  onAlias,
  onDelete,
  onReveal,
  t,
}: ProjectSwitcherProps) {
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
  const hasWarning = [...ordering.attention.values()].some((one) => one.severity === 'warning');
  const revealCurrentId = hasWarning ? null : current?.workspaceId ?? null;
  const options = useMemo(
    () =>
      workspaceOptions({
        sections,
        currentId,
        revealCurrentId,
        hoverId,
        openMenuId: menu?.workspace.workspaceId ?? null,
        t,
        attention: attention.byWorkspace,
        onHover: setHoverId,
        onMenu: (workspace, open) => setMenu((current) => nextWorkspaceMenu(current, workspace, open)),
      }),
    [sections, currentId, revealCurrentId, hoverId, menu, t, attention.byWorkspace],
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

  return (
    <div className={cx(styles.root, compact && styles.rail)}>
      <div
        className={cx(styles.triggerArea, triggerActionActive && styles.triggerAreaActive)}
        onPointerEnter={compact ? undefined : () => setTriggerHover(true)}
        onPointerLeave={compact ? undefined : () => setTriggerHover(false)}
        onContextMenu={
          compact
            ? undefined
            : (event) => {
                if (current === null) return;
                const node = event.target;
                if (node instanceof Element && node.closest('[role="menu"]') !== null) return;
                event.preventDefault();
                event.stopPropagation();
                setMenu((previous) =>
                  nextWorkspaceMenu(previous, current, {
                    point: { x: event.clientX, y: event.clientY },
                    align: 'start',
                    mode: 'open',
                  }),
                );
              }
        }
      >
        <SelectField
          value={currentId}
          options={options}
          onChange={onPick}
          open={open}
          onOpenChange={(next) => {
            setFrozenOrder(next ? { attention: attention.byWorkspace, recency } : null);
            setOpen(next);
          }}
          icon={
            <Tip label={current?.path ?? ''} disabled={current === null}>
              <span className={styles.glyphBox}>
                <span className={cx(styles.glyph, styles.glyphActive)}>
                  <IconFolderCloseRegular size={16} />
                  {compact ? (
                    <WorkspaceAttentionDot attention={attention.overall} t={t} variant="overlay" tip />
                  ) : null}
                </span>
              </span>
            </Tip>
          }
          renderValue={
            compact
              ? undefined
              : (option: SelectFieldOption | undefined) => (
                  <Fragment>
                    {option === undefined ? t('project.none') : (valueNodes.get(option.value) ?? option.label)}
                    <WorkspaceAttentionTag attention={attention.elsewhere} t={t} />
                  </Fragment>
                )
          }
          placeholder={t('project.none')}
          variant="ghost"
          iconOnly={compact}
          chevronHidden={triggerActionActive}
          search={!compact}
          ariaLabel={t('project.label')}
          searchLabel={t('project.search.label')}
          searchPlaceholder={t('project.search.placeholder')}
          emptyText={(query) => t('project.search.empty', { query: query.trim() })}
          filter={(option, query) => {
            const workspace = byId.get(option.value);
            return workspace !== undefined && matchWorkspaces([workspace], query).length > 0;
          }}
          footer={{ label: t('project.add'), icon: <IconPlusOutlineRegular size={14} /> }}
          onFooter={onAdd}
        />
        {triggerWorkspace === null ? null : (
          <span className={styles.triggerAction}>
            <WorkspaceRowAction
              workspace={triggerWorkspace}
              t={t}
              menuOpen={triggerMenuOpen}
              onMenu={(next) => setMenu((previous) => nextWorkspaceMenu(previous, triggerWorkspace, next))}
            />
          </span>
        )}
      </div>
      <WorkspaceRowMenu
        target={menu}
        t={t}
        onClose={() => setMenu(null)}
        onAlias={(workspace) => {
          setOpen(false);
          setNaming(workspace);
        }}
        onDelete={(workspace) => {
          setOpen(false);
          setDeleting(workspace);
        }}
        onReveal={(path) => {
          setOpen(false);
          onReveal(path);
        }}
      />
      {naming === null ? null : (
        <WorkspaceAliasDialog
          key={naming.workspaceId}
          workspace={naming}
          t={t}
          onClose={() => setNaming(null)}
          onSubmit={(title) => onAlias(naming.workspaceId, title)}
        />
      )}
      {deleting === null ? null : (
        <WorkspaceDeleteDialog
          key={deleting.workspaceId}
          workspace={deleting}
          t={t}
          onClose={() => setDeleting(null)}
          onConfirm={() => onDelete(deleting.workspaceId)}
        />
      )}
    </div>
  );
}

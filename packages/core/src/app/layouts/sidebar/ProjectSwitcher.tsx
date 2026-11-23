import { Fragment, createElement as h } from 'react';
import type { SelectFieldOption, Translate, WorkspaceView } from '@dsh-workbench/shared';
import type { Attention } from '@/modules/sessions';
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
import { matchWorkspaces } from './workspace-name';
import { useProjectSwitcherState } from './use-project-switcher-state';

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
  fileManager: 'finder' | 'explorer' | 'none';
  t: Translate;
}

export function ProjectSwitcher(props: ProjectSwitcherProps) {
  const { current, attention, recency, compact = false, onPick, onAdd, onAlias, onDelete, onReveal, fileManager, t } = props;
  const {
    open,
    setOpen,
    setTriggerHover,
    setFrozenOrder,
    triggerAreaRef,
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
  } = useProjectSwitcherState(props);

  return (
    <div className={cx(styles.root, compact && styles.rail)}>
      <div
        ref={triggerAreaRef}
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
          initialSelectedId={revealId}
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
        fileManager={fileManager}
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

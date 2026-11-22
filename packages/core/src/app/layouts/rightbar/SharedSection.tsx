import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { Spinner } from '@dsh-workbench/shared';
import { sharedActions, type SharedRow } from './market-rows';
import { DependencyLine } from './dependency-line';
import type { MarketFailure } from './market-row-types';
import { MarketRowFailure } from './market-section';
import { marketSectionIcon } from './market-section-icon';
import { sharedRowKind } from './market-row-icon';
import { ACTION_LABEL_KEY, PROGRESS_KEY, UPDATE_ACTIONS, type Pending } from './market-view-text';
import styles from '../market/MarketPage.module.css';
import type { MarketRowAction } from './market-rows';

export function SharedActions({
  t,
  actions,
  running,
  locked,
  onAct,
}: {
  readonly t: Translate;
  readonly actions: readonly MarketRowAction[];
  readonly running: Pending | null;
  readonly locked: boolean;
  readonly onAct: (action: MarketRowAction) => void;
}) {
  return running !== null ? (
    <span className={styles.marketProgress}>
      <Spinner size={14} />
      {t(PROGRESS_KEY[running.action])}
    </span>
  ) : actions.length === 0 ? null : (
    <span className={styles.marketActions}>
      {actions.map((action) => (
        <Button
          key={action}
          type="button"
          size="sm"
          variant="outline"
          className={UPDATE_ACTIONS.includes(action) ? styles.marketUpdateAction : undefined}
          disabled={locked}
          onClick={() => onAct(action)}
        >
          {t(ACTION_LABEL_KEY[action])}
        </Button>
      ))}
    </span>
  );
}

function SharedLine({
  t,
  row,
  pending,
  failure,
  onAct,
  onApprove,
  onOpenDetail,
  onRecheck,
  rechecking,
}: {
  t: Translate;
  row: SharedRow;
  pending: Pending | null;
  failure: MarketFailure | null;
  onAct: (action: MarketRowAction) => void;
  onApprove?: (() => void) | undefined;
  onOpenDetail?: ((id: string) => void) | undefined;
  onRecheck: () => void;
  rechecking: boolean;
}) {
  const running = pending !== null && pending.id === row.id ? pending : null;
  const locked = pending !== null;
  const actions = sharedActions(row);
  const clickable = onOpenDetail !== undefined;

  return (
    <li className={styles.marketRow} data-open={clickable ? 'true' : undefined}>
      <DependencyLine
        t={t}
        kind={sharedRowKind(row)}
        label={row.label}
        version={row.version}
        state={row.state}
        note={t('panels.market.sharedUsedBy', {
          modules: row.usedByKeys.map((key) => t(key)).join(t('panels.market.listSeparator')),
        })}
        {...(onOpenDetail === undefined ? {} : { onOpen: () => onOpenDetail(row.id) })}
      />

      <div className={styles.marketEnd}>
        <SharedActions t={t} actions={actions} running={running} locked={locked} onAct={onAct} />
      </div>

      <MarketRowFailure
        t={t}
        failure={failure}
        onRecheck={onRecheck}
        rechecking={rechecking}
        onApprove={onApprove}
      />
    </li>
  );
}

export function SharedSection({
  t,
  rows,
  pending,
  failureOf,
  act,
  onOpenDetail,
  onRecheck,
  rechecking,
}: {
  readonly t: Translate;
  readonly rows: readonly SharedRow[];
  readonly pending: Pending | null;
  readonly failureOf: (id: string) => MarketFailure | null;
  readonly act: (
    id: string,
    action: MarketRowAction,
    options?: { readonly approvedBuilds?: readonly string[] | undefined },
  ) => Promise<void>;
  readonly onOpenDetail?: ((id: string) => void) | undefined;
  readonly onRecheck: () => void;
  readonly rechecking: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section className={`${styles.marketSection} ${styles.marketSectionQuiet}`}>
      <div className={styles.marketSectionHead}>
        <span className={styles.marketSectionIcon} aria-hidden="true">
          {marketSectionIcon('shared')}
        </span>
        <h2 className={styles.marketSectionTitle}>{t('panels.market.sectionShared')}</h2>
        <span className={styles.marketSectionCount}>{rows.length}</span>
      </div>
      <ul className={styles.marketList}>
        {rows.map((row) => (
          <SharedLine
            key={row.id}
            t={t}
            row={row}
            pending={pending}
            failure={failureOf(row.id)}
            onAct={(action) => void act(row.id, action)}
            onApprove={() => {
              const failed = failureOf(row.id);
              if (failed?.pendingBuilds !== undefined && failed.action !== undefined) {
                void act(row.id, failed.action, { approvedBuilds: failed.pendingBuilds });
              }
            }}
            onOpenDetail={onOpenDetail}
            onRecheck={onRecheck}
            rechecking={rechecking}
          />
        ))}
      </ul>
    </section>
  );
}

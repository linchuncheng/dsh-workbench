import { Fragment, createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Spinner } from '@dsh-workbench/shared';
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import { SHARED_DOT, SHARED_STATE_KEY, type SharedState } from './market-shared-rows';
import { packageIcon, type PackageKind } from './market-row-icon';
import styles from '../market/MarketPage.module.css';

export interface DependencyLineProps {
  readonly t: Translate;
  readonly kind?: PackageKind | undefined;
  readonly label: string;
  readonly version?: { readonly installed?: string; readonly latest?: string } | undefined;
  readonly state: SharedState;
  readonly note?: string | undefined;
  readonly stateText?: string | undefined;
  readonly onOpen?: (() => void) | undefined;
}

export function DependencyLine({
  t,
  kind,
  label,
  version,
  state,
  note,
  stateText,
  onOpen,
}: DependencyLineProps) {
  const versionText =
    version === undefined
      ? undefined
      : version.installed !== undefined &&
          version.latest !== undefined &&
          version.installed !== version.latest
        ? t('panels.market.versionArrow', { from: version.installed, to: version.latest })
        : (version.installed ?? version.latest ?? '');
  return (
    <>
      <span className={styles.marketIcon} aria-hidden="true">
        {kind === undefined ? null : packageIcon(kind)}
      </span>
      <div className={styles.marketMain}>
        <span className={styles.marketName}>
          {onOpen === undefined ? (
            label
          ) : (
            <button
              type="button"
              className={styles.marketNameOpen}
              aria-label={t('panels.market.openDetail', { name: label })}
              onClick={onOpen}
            >
              {label}
            </button>
          )}
          {versionText === undefined || versionText === '' ? null : (
            <span className={styles.marketVersion}>{versionText}</span>
          )}
        </span>
        <span className={styles.marketStatus}>
          {state === 'checking' ? (
            <Spinner size={14} />
          ) : (
            <StateDot state={SHARED_DOT[state]} size={9} />
          )}
          <span className={styles.marketStateText}>
            {stateText ?? t(SHARED_STATE_KEY[state])}
          </span>
          {note === undefined ? null : (
            <>
              <span className={styles.marketSep} aria-hidden="true">·</span>
              <span className={styles.marketReason}>{note}</span>
            </>
          )}
        </span>
      </div>
    </>
  );
}

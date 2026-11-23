import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { Tip } from '@/shared/components/Tip';
import { checkedAgo } from '../rightbar/market-freshness';
import type { LatestCheckSummary } from '../rightbar/market-rows';
import styles from './market-check.module.css';

export interface MarketRefreshButtonProps {
  readonly label: string;
  readonly checking: boolean;
  readonly disabled: boolean;
  readonly onCheck: () => void;
}

export function MarketRefreshButton({ label, checking, disabled, onCheck }: MarketRefreshButtonProps) {
  return (
    <Tip label={label}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={styles.button}
        aria-label={label}
        disabled={disabled || checking}
        icon={
          <span className={`${styles.icon}${checking ? ' wb-spinning' : ''}`} aria-hidden="true">
            <IconRefreshOutlineRegular size={14} />
          </span>
        }
        onClick={onCheck}
      />
    </Tip>
  );
}

export interface MarketCheckProps {
  readonly t: Translate;
  readonly checkedAt: number | null;
  readonly latestCheck?: LatestCheckSummary | undefined;
  readonly checking: boolean;
  readonly failed: boolean;
  readonly sourceFailed?: boolean | undefined;
  readonly disabled: boolean;
  readonly onCheck: () => void;
}

export function MarketCheck({
  t,
  checkedAt,
  latestCheck = { unknown: 0 },
  checking,
  failed,
  sourceFailed = false,
  disabled,
  onCheck,
}: MarketCheckProps) {
  const parts: string[] = [];
  if (checking) {
    parts.push(t('panels.market.checkingNow'));
  } else if (failed) {
    if (checkedAt !== null) {
      parts.push(t('panels.market.checkedAt', { time: checkedAgo(checkedAt, t) }));
    }
    parts.push(t('panels.market.checkFailed'));
  } else if (checkedAt === null) {
    parts.push(t('panels.market.notCheckedYet'));
  } else {
    parts.push(t('panels.market.checkedAt', { time: checkedAgo(checkedAt, t) }));
    if (sourceFailed) parts.push(t('panels.market.sourceUnreachable'));
    if (latestCheck.unknown > 0) {
      parts.push(t('panels.market.latestPartial', { n: String(latestCheck.unknown) }));
    }
  }
  return (
    <span className={styles.check}>
      <span className={styles.status} aria-live="polite">
        {parts.join(' · ')}
      </span>
      <MarketRefreshButton
        label={t('panels.market.checkUpdates')}
        checking={checking}
        disabled={disabled}
        onCheck={onCheck}
      />
    </span>
  );
}

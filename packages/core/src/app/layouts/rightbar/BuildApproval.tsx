import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarketRowAction } from './market-row-types';
import { approveKeyOf } from './market-view-text';
import styles from './BuildApproval.module.css';

export function BuildApproval({
  t,
  packages,
  action,
  onApprove,
}: {
  readonly t: Translate;
  readonly packages: readonly string[];
  readonly action?: MarketRowAction | undefined;
  readonly onApprove: () => void;
}) {
  return (
    <div className={styles.approval}>
      <p className={styles.title}>{t('panels.market.approve.title')}</p>
      <p className={styles.text}>{t('panels.market.approve.hint', { packages: packages.join('、') })}</p>
      <p className={styles.caution}>{t('panels.market.approve.caution')}</p>
      <Button type="button" size="sm" variant="primary" onClick={onApprove}>
        {t(approveKeyOf(action))}
      </Button>
    </div>
  );
}

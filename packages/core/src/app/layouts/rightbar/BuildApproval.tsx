import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './BuildApproval.module.css';

export function BuildApproval({
  t,
  packages,
  onApprove,
}: {
  readonly t: Translate;
  readonly packages: readonly string[];
  readonly onApprove: () => void;
}) {
  return (
    <div className={styles.approval}>
      <p className={styles.title}>{t('panels.market.add.approveTitle')}</p>
      <p className={styles.text}>{t('panels.market.add.approveHint', { packages: packages.join('、') })}</p>
      <p className={styles.caution}>{t('panels.market.add.approveCaution')}</p>
      <Button type="button" size="sm" variant="primary" onClick={onApprove}>
        {t('panels.market.add.approveRun')}
      </Button>
    </div>
  );
}

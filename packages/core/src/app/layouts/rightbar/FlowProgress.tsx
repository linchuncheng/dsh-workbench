import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { useDiyFlow } from './use-diy-flow';
import styles from './FlowProgress.module.css';

export function FlowProgress({
  t,
  session,
}: {
  readonly t: Translate;
  readonly session: string | null;
}) {
  const flow = useDiyFlow(session);
  if (flow === null || flow.current === null) return null;

  return (
    <div className={styles.flow} role="status" aria-label={t('rightbar.flow.label')}>
      <span className={styles.placeholder} aria-hidden="true">
        <span className={styles.bar} />
        <span className={styles.bar} />
        <span className={styles.bar} />
      </span>
      <span className={styles.caption}>{flow.current.title}</span>
    </div>
  );
}

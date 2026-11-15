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
  const at = flow.steps.findIndex((step) => step.id === flow.current?.id);
  if (at < 0) return null;

  return (
    <div className={styles.strip} role="status" aria-label={t('rightbar.flow.label')}>
      <span className={styles.dots} aria-hidden="true">
        {flow.steps.map((step, index) => (
          <span
            className={index === at ? styles.now : index < at ? styles.done : styles.pending}
            key={step.id}
          />
        ))}
      </span>
      <span className={styles.title}>{flow.current.title}</span>
      <span className={styles.spinner} aria-hidden="true" />
    </div>
  );
}

import { Fragment, createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { useDiyFlow } from '@/shared/hooks/use-diy-flow';
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
    <div className={styles.flow} role="status" aria-label={t('rightbar.flow.label')}>
      <span className={styles.position}>
        {t('rightbar.flow.position', { at: at + 1, total: flow.steps.length })}
      </span>
      <span className={styles.track}>
        {flow.steps.map((step, index) => (
          <Fragment key={step.id}>
            {index === 0 ? null : <span className={styles.link} aria-hidden="true" />}
            <span
              className={index === at ? styles.now : index < at ? styles.done : styles.pending}
              title={step.title}
            />
          </Fragment>
        ))}
      </span>
      <span className={styles.title}>{flow.current.title}</span>
    </div>
  );
}

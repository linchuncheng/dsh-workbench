import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { LongTaskRow } from '@dsh-workbench/shared';
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
    <div className={styles.flow} aria-label={t('rightbar.flow.label')}>
      <LongTaskRow
        status="running"
        headline={flow.current.title}
        stepsTitle={t('rightbar.flow.steps')}
        steps={flow.steps.map((step) => step.title)}
      />
    </div>
  );
}

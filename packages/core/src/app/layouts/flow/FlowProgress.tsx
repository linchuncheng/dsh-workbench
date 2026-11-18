import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import {
  IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular,
  IconSparkleRegular,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { useDiyFlow } from './use-diy-flow';
import styles from './FlowProgress.module.css';

type StepStatus = 'completed' | 'in_progress' | 'pending';

const DOT: Record<StepStatus, 'done' | 'ongoing' | 'idle'> = {
  completed: 'done',
  in_progress: 'ongoing',
  pending: 'idle',
};

export function FlowProgress({
  t,
  flowSessionId,
}: {
  readonly t: Translate;
  readonly flowSessionId: string;
}) {
  const [open, setOpen] = useState(false);
  const flow = useDiyFlow(flowSessionId);
  if (flow === null || flow.current === null) return null;
  const label = t(flow.kind === 'record' ? 'rightbar.record.label' : 'rightbar.flow.label');
  const at = flow.steps.findIndex((step) => step.id === flow.current?.id);
  if (at < 0) return null;

  const rows = flow.steps.map((step, index) => ({
    id: step.id,
    content: step.title,
    status: (index < at ? 'completed' : index === at ? 'in_progress' : 'pending') as StepStatus,
  }));
  const done = rows.filter((row) => row.status === 'completed').length;
  const active = rows.filter((row) => row.status === 'in_progress').length;
  const pending = rows.length - done - active;
  const progress = [
    done > 0 ? t('rightbar.flow.done', { done }) : '',
    active > 0 ? t('rightbar.flow.active', { active }) : '',
    pending > 0 ? t('rightbar.flow.pending', { pending }) : '',
  ]
    .filter((part) => part !== '')
    .join(' · ');
  const statusLabel = (status: StepStatus): string =>
    status === 'completed'
      ? t('rightbar.flow.statusCompleted')
      : status === 'in_progress'
        ? t('rightbar.flow.statusInProgress')
        : t('rightbar.flow.statusPending');

  return (
    <section className={styles.root} aria-label={label}>
      <div className={styles.body}>
        <button
          type="button"
          className={styles.header}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className={styles.lead} aria-hidden="true">
            <IconSparkleRegular />
          </span>
          <span className={styles.title}>{label}</span>
          <span className={styles.progress}>{progress}</span>
          <span className={styles.chevron} aria-hidden="true">
            {open ? <IconChevronUpOutlineRegular /> : <IconChevronDownOutlineRegular />}
          </span>
        </button>
        {open ? (
          <ul className={styles.list}>
            {rows.map((row) => (
              <li className={styles.item} key={row.id}>
                <span className={styles.glyph} role="img" aria-label={statusLabel(row.status)}>
                  <StateDot state={DOT[row.status]} />
                </span>
                <span className={styles.content}>{row.content}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

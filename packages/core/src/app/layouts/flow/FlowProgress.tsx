import { createElement as h, useEffect, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { LONG_TASK_STOP_ARM_MS, longTaskStopPress, longTaskStopStage } from '@dsh-workbench/shared';
import {
  IconChecklistOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular,
  IconStopFillRegular,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { useHostWrite } from '@/shared/hooks/use-host-write';
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
  const [token, setToken] = useState(0);
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const flow = useDiyFlow(flowSessionId, token);
  const stop = useHostWrite<{ text?: string }>({
    channel: 'actions',
    resource: 'diy-flow-stop',
    networkText: '网络不通，没停下来',
  });
  useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(false), LONG_TASK_STOP_ARM_MS);
    return () => clearTimeout(timer);
  }, [armed]);
  if (flow === null || flow.current === null) return null;
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
    <section className={styles.root} aria-label={t('rightbar.flow.label')}>
      <div className={styles.body}>
        <div className={styles.headRow}>
          <button
            type="button"
            className={styles.header}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span className={styles.lead} aria-hidden="true">
              <IconChecklistOutlineRegular />
            </span>
            <span className={styles.title}>{t('rightbar.flow.label')}</span>
            <span className={styles.progress}>{progress}</span>
            <span className={styles.chevron} aria-hidden="true">
              {open ? <IconChevronUpOutlineRegular /> : <IconChevronDownOutlineRegular />}
            </span>
          </button>
          <button
            type="button"
            className={armed ? `${styles.stop} ${styles.stopArmed}` : styles.stop}
            aria-label={
              armed
                ? t('rightbar.flow.stopAgain')
                : t('rightbar.flow.stop', { what: flow.current.title })
            }
            disabled={stop.busy}
            onClick={() => {
              const press = longTaskStopPress(longTaskStopStage({ armed, busy: stop.busy }));
              if (press === 'ignore') return;
              if (press === 'arm') {
                setArmed(true);
                return;
              }
              setArmed(false);
              void stop.send({ session: flowSessionId }).then(() => setToken((value) => value + 1));
            }}
          >
            {armed ? t('rightbar.flow.stopConfirm') : <IconStopFillRegular />}
          </button>
        </div>
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

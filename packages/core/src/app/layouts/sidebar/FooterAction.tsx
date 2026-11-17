import { createElement as h } from 'react';
import type { ReactNode } from 'react';
import { cx } from '@dsh-workbench/shared';
import { HoverCard, StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import { Tip } from '@/shared/components/Tip';
import styles from './FooterAction.module.css';

export type FooterTone = 'good' | 'wait' | 'blocked';

export type FooterDot = 'done' | 'warning' | 'error';

export interface FooterActionProps {
  readonly wide?: boolean | undefined;
  readonly label: string;
  readonly title: string;
  readonly note: string;
  readonly dot: FooterDot;
  readonly pulse?: boolean | undefined;
  readonly tone: FooterTone;
  readonly acts?: ReactNode;
}

const TONE: Record<FooterTone, string> = {
  good: styles.toneGood,
  wait: styles.toneWait,
  blocked: styles.toneBlocked,
};

export function FooterAction({
  wide,
  label,
  title,
  note,
  dot,
  pulse,
  tone,
  acts,
}: FooterActionProps): JSX.Element {
  const actsBox = <span className={styles.acts}>{acts}</span>;
  const status = (
    <span className={styles.entryInner}>
      <StateDot state={dot} className={pulse === true ? styles.pulse : undefined} />
      {wide === true ? <span className={styles.entryLine}>{label}</span> : null}
    </span>
  );
  const row = (
    <div className={cx(styles.action, wide === true ? undefined : styles.actionRail, TONE[tone])}>
      <span className={styles.entry} role="status" aria-label={`${label}，${note}`}>
        {wide === true ? (
          <Tip label={note} side="top">
            {status}
          </Tip>
        ) : (
          status
        )}
      </span>
      {wide === true ? actsBox : null}
    </div>
  );

  if (wide === true) {
    return <span className={styles.slot}>{row}</span>;
  }
  return (
    <span className={styles.slot}>
      <HoverCard
        anchor={row}
        content={
          <div className={styles.card}>
            <div className={styles.cardTitle}>{title}</div>
            <div className={styles.cardNote}>{note}</div>
            {actsBox}
          </div>
        }
        openDelayMs={200}
      />
    </span>
  );
}

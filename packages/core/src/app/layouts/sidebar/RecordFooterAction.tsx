import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import type { RecordIntent, RecordState } from '@dsh-workbench/shared/host';
import { cx } from '@dsh-workbench/shared';
import { useDiyRecordAct, useDiyRecordState } from '@/shared/hooks/use-diy-record';
import { FooterAction } from './FooterAction';
import footer from './FooterAction.module.css';
import styles from './RecordFooterAction.module.css';

export interface RecordFooterActionProps {
  readonly wide?: boolean | undefined;
  readonly t: Translate;
}

export interface RecordActView {
  readonly intent: RecordIntent;
  readonly label: string;
}

export interface RecordFooterView {
  readonly label: string;
  readonly note: string;
  readonly acts: readonly RecordActView[];
}

export function recordFooterView(state: RecordState, t: Translate): RecordFooterView {
  if (state.phase === 'recording') {
    const taken = state.shots === undefined ? 0 : state.shots.length;
    return {
      label: t('record.recording'),
      note:
        taken === 0
          ? t('record.recording.note')
          : `${t('record.recording.note')}${t('record.recording.shots', { n: taken })}`,
      acts: [{ intent: 'halt', label: t('record.act.halt') }],
    };
  }
  if (state.phase === 'finished') {
    return {
      label: t('record.finished'),
      note: t('record.finished.note'),
      acts: [],
    };
  }
  return {
    label: t('record.waiting'),
    note: t('record.waiting.note'),
    acts: [{ intent: 'stop', label: t('record.act.cancel') }],
  };
}

export function RecordFooterAction({ wide, t }: RecordFooterActionProps) {
  const state = useDiyRecordState();
  const act = useDiyRecordAct();

  if (state === null) return null;
  const view = recordFooterView(state, t);
  const acts = view.acts.map((one) => (
    <button
      key={one.intent}
      type="button"
      className={cx(footer.act, styles.actText)}
      aria-label={one.label}
      onClick={(event) => {
        event.stopPropagation();
        void act.send({ intent: one.intent });
      }}
    >
      {one.label}
    </button>
  ));

  return (
    <FooterAction
      wide={wide}
      label={view.label}
      title={view.label}
      note={view.note}
      dot={state.phase === 'finished' ? 'done' : 'warning'}
      pulse={state.phase === 'armed'}
      tone={state.phase === 'finished' ? 'good' : 'wait'}
      acts={acts}
    />
  );
}

import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { LongTaskRow } from '@dsh-workbench/shared';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { useDiyFlow } from './use-diy-flow';
import styles from './FlowProgress.module.css';

export function FlowProgress({
  t,
  session,
}: {
  readonly t: Translate;
  readonly session: string;
}) {
  const [token, setToken] = useState(0);
  const flow = useDiyFlow(session, token);
  const stop = useHostWrite<{ text?: string }>({
    channel: 'actions',
    resource: 'diy-flow-stop',
    networkText: '网络不通，没停下来',
  });
  if (flow === null || flow.current === null) return null;

  return (
    <div className={styles.flow} aria-label={t('rightbar.flow.label')}>
      <LongTaskRow
        status="running"
        headline={flow.current.title}
        stepsTitle={t('rightbar.flow.steps')}
        steps={flow.steps.map((step) => step.title)}
        stop={{
          onStop: () => {
            void stop.send({ session }).then(() => setToken((value) => value + 1));
          },
          label: t('rightbar.flow.stop', { what: flow.current?.title ?? '' }),
          askLabel: t('rightbar.flow.stopConfirm'),
          armedLabel: t('rightbar.flow.stopAgain'),
          busy: stop.busy,
          failed: stop.failed,
        }}
      />
    </div>
  );
}

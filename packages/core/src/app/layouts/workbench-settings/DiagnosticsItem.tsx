import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { useApiResource } from '@/shared/hooks/use-api-resource';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { SettingsRow } from './SettingsRow';
import { diagRowsOf, exportResultOf, type DiagSummaryLike, type ExportOutcome } from './diag-view';
import styles from './DiagnosticsItem.module.css';

const DIAG_ROUTE = 'diag/records';

export interface DiagnosticsItemProps {
  readonly t: Translate;
}

function outcomeText(outcome: ExportOutcome, t: Translate): string | null {
  if (outcome.kind === 'busy') return t('diag.exporting');
  if (outcome.kind === 'done') return t('diag.exported', { dir: outcome.dir });
  if (outcome.kind === 'failed') return `${t('diag.exportFailed')}${outcome.message}`;
  return null;
}

export function DiagnosticsItem({ t }: DiagnosticsItemProps): JSX.Element {
  const [token, setToken] = useState(0);
  const diag = useApiResource<DiagSummaryLike>(DIAG_ROUTE, { limit: '50' }, token);
  const exporter = useHostWrite({ channel: 'actions', resource: 'export-diagnostics', networkText: t('diag.exportFailed') });
  const [outcome, setOutcome] = useState<ExportOutcome>({ kind: 'idle' });

  const rows = diag.phase === 'ready' && diag.value !== undefined ? diagRowsOf(diag.value) : [];
  const text = outcomeText(outcome, t);

  const runExport = (): void => {
    setOutcome({ kind: 'busy' });
    void exporter.send({}).then((result) => {
      setOutcome(exportResultOf(result));
      setToken((one) => one + 1);
    });
  };

  return (
    <SettingsRow title={t('diag.title')} description={t('diag.hint')}>
      <div className={styles.body}>
        {rows.length === 0 ? (
          <p className={styles.empty}>{t('diag.empty')}</p>
        ) : (
          <ul className={styles.list}>
            {rows.map((row) => (
              <li key={row.code} className={styles.row}>
                <span className={styles.dot} aria-hidden="true" />
                <code className={styles.code}>{row.code}</code>
                <span className={styles.area}>{row.area}</span>
                <span className={styles.count}>{t('diag.count', { count: String(row.count) })}</span>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.actions}>
          <Button type="button" size="sm" variant="outline" disabled={outcome.kind === 'busy'} onClick={runExport}>
            <IconRefreshOutlineRegular />
            {t('diag.export')}
          </Button>
          {text === null ? null : <span className={styles.outcome}>{text}</span>}
        </div>
      </div>
    </SettingsRow>
  );
}

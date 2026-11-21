import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { useApiResource } from '@/shared/hooks/use-api-resource';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { SettingsRow } from './SettingsRow';
import { SettingsDisclosure } from './SettingsDisclosure';
import { diagRowsOf, exportResultOf, type DiagSummaryLike, type ExportOutcome } from './diag-view';

const DIAG_ROUTE = 'diag/records';

export interface DiagnosticsItemProps {
  readonly t: Translate;
}

function outcomeText(outcome: ExportOutcome, t: Translate): string {
  if (outcome.kind === 'busy') return t('diag.exporting');
  if (outcome.kind === 'done') return t('diag.exported', { dir: outcome.dir });
  if (outcome.kind === 'failed') return `${t('diag.exportFailed')}${outcome.message}`;
  return '';
}

export function DiagnosticsItem({ t }: DiagnosticsItemProps): JSX.Element {
  const [token, setToken] = useState(0);
  const [open, setOpen] = useState(false);
  const diag = useApiResource<DiagSummaryLike>(DIAG_ROUTE, { limit: '50' }, token);
  const exporter = useHostWrite({ channel: 'actions', resource: 'export-diagnostics', networkText: t('diag.exportFailed') });
  const [outcome, setOutcome] = useState<ExportOutcome>({ kind: 'idle' });

  const rows = diag.phase === 'ready' && diag.value !== undefined ? diagRowsOf(diag.value) : [];
  const host = diag.phase === 'ready' ? (diag.value as { host?: { node?: string; profileDir?: string | null } } | undefined)?.host : undefined;
  const text = outcomeText(outcome, t);
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  const runExport = (): void => {
    setOutcome({ kind: 'busy' });
    void exporter.send({}).then((result) => {
      setOutcome(exportResultOf(result));
      setToken((one) => one + 1);
    });
  };

  return (
    <SettingsRow
      title={t('diag.title')}
      description={t('diag.hint')}
      control={
        <Button type="button" size="sm" variant="outline" disabled={outcome.kind === 'busy'} onClick={runExport}>
          <IconRefreshOutlineRegular />
          {t('diag.export')}
        </Button>
      }
      error={text === '' ? null : text}
    >
      <SettingsDisclosure
        title={t('diag.listTitle')}
        meta={rows.length === 0 ? t('diag.empty') : t('diag.total', { count: String(total) })}
        open={open}
        onToggle={() => setOpen(!open)}
      >
        <ul>
          {rows.map((row) => (
            <li key={row.code}>
              {row.code} · {row.area} · {t('diag.count', { count: String(row.count) })}
            </li>
          ))}
        </ul>
        {host === undefined ? null : (
          <p>
            {t('diag.host', { node: host.node ?? '-', dir: host.profileDir ?? '-' })}
          </p>
        )}
      </SettingsDisclosure>
    </SettingsRow>
  );
}

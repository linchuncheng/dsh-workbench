import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Note } from '@dsh-workbench/shared';
import { SettingsRow } from './SettingsRow';
import { useWorkbenchHealth } from './use-workbench-health';

export function AdapterSetItem({ t }: { readonly t: Translate }): JSX.Element | null {
  const health = useWorkbenchHealth();
  const unreadable = health.unreadable;
  const info = health.value?.adapterSet;
  const failed = info?.failure !== null && info?.failure !== undefined;
  if (!unreadable && (info === undefined || (!failed && info.configured === null))) return null;
  const problem = unreadable || info === undefined || failed;
  const message =
    unreadable || info === undefined
      ? t('adapterSet.healthUnreadable')
      : failed
        ? t(info.messageKey ?? 'adapterSet.failed', { spec: info.configured ?? '' })
        : t('adapterSet.active', { id: info.id, version: info.version });
  const detail = unreadable ? health.error : (info?.detail ?? undefined);

  return (
    <SettingsRow
      title={t('adapterSet.title')}
      description={t('adapterSet.lead')}
      error={problem ? message : null}
    >
      {problem ? null : <Note>{message}</Note>}
      {info !== undefined && !failed && info.configured !== null && info.usesDefaults ? (
        <Note>{t('adapterSet.defaults')}</Note>
      ) : null}
      {detail === undefined || detail === '' ? null : <Note>{detail}</Note>}
    </SettingsRow>
  );
}

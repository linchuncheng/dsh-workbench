import { Fragment, createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { clientSurface } from '@/shared/api/platform/client';
import { SettingsRow } from './SettingsRow';
import { useWorkbenchHealth } from './use-workbench-health';

export function WorkbenchFacts({ t }: { readonly t: Translate }): JSX.Element {
  const surface = clientSurface();
  const identity = useWorkbenchHealth().value?.workbench;
  const profile = identity?.profile ?? '';
  const version = identity?.version ?? '';
  return (
    <>
      <SettingsRow
        title={t('workbenchSettings.fact.mode')}
        description={
          surface.deployment === 'desktop'
            ? t('workbenchSettings.fact.mode.desktop')
            : t('workbenchSettings.fact.mode.browser')
        }
      />
      {profile === '' ? null : (
        <SettingsRow title={t('workbenchSettings.fact.profile')} description={profile} />
      )}
      {version === '' ? null : (
        <SettingsRow title={t('workbenchSettings.fact.version')} description={version} />
      )}
      <SettingsRow
        title={t('workbenchSettings.fact.settings')}
        description={t('workbenchSettings.fact.settings.lead')}
      />
    </>
  );
}
